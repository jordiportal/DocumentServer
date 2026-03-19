/**
 * BIW Data Connector - Background Service v3.1.0
 * 
 * Plugin de fondo que registra la pestaña BIW en el ribbon
 * y gestiona las ventanas modales y el panel de filtros.
 */

(function(window, undefined) {
    'use strict';

    const VERSION = "3.9.14";
    const PLUGIN_NAME = "BIW";
    const SERVER_URL = "http://localhost:3001";
    
    // Configuración de formato numérico (europeo por defecto)
    // 'EU' = 1.234,56 | 'US' = 1,234.56
    let numberFormat = localStorage.getItem('biw_number_format') || 'EU';
    
    // Referencias a ventanas activas
    let importWindow = null;
    let settingsWindow = null;
    let filtersPanel = null;
    let isInitialized = false;
    
    // Estado de la última query ejecutada (para jerarquías)
    let lastQueryState = {
        queryName: null,
        selectedKeyFigures: [],
        expandedRatios: new Set(),
        hierarchyMap: {},  // uid -> { expandable, children, parentUid }
        cellToRatioMap: {} // "row_col" -> uid (mapeo de celdas a ratios)
    };

    // =========================================================================
    // INICIALIZACIÓN
    // =========================================================================

    window.Asc.plugin.init = function() {
        if (isInitialized) return;
        isInitialized = true;
        
        console.log(`[${PLUGIN_NAME}] v${VERSION} inicializado`);
        
        // Registrar eventos de menú
        attachEvent("onToolbarMenuClick");
        attachEvent("onContextMenuClick");
        
        // Registrar UI después de un breve delay
        setTimeout(registerUI, 100);
    };

    // =========================================================================
    // REGISTRO DE UI
    // =========================================================================

    function registerUI() {
        registerToolbar();
        registerContextMenu();
    }

    function registerToolbar() {
        // Patrón de iconos con soporte para temas light/dark
        const iconPattern = (name) => `resources/icons/%theme-type%(light|dark)/${name}.svg`;
        
        window.Asc.plugin.executeMethod("AddToolbarMenuItem", [{
            guid: window.Asc.plugin.info.guid,
            tabs: [{
                id: "BIWTab",
                text: "BIW",
                items: [
                    {
                        id: "biw-import",
                        type: "button",
                        text: "Importar Datos",
                        hint: "Importar datos desde BIW",
                        icons: iconPattern("import")
                    },
                    {
                        id: "biw-refresh-btn",
                        type: "button",
                        text: "Actualizar",
                        hint: "Actualiza los datos importados",
                        icons: iconPattern("refresh"),
                        split: true,
                        items: [
                            { id: "biw-refresh", text: "Actualizar Query Actual" },
                            { id: "biw-refresh-all", text: "Actualizar Todas" }
                        ]
                    },
                    {
                        id: "biw-filters",
                        type: "button",
                        text: "Editar Filtros",
                        hint: "Panel de filtros (se puede fijar al lateral)",
                        icons: iconPattern("filter")
                    },
                    {
                        id: "biw-settings",
                        type: "button",
                        text: "Configuración",
                        hint: "Configuración del conector BIW",
                        icons: iconPattern("settings")
                    }
                ]
            }]
        }]);
    }

    function registerContextMenu() {
        // Usar Asc.ButtonContextMenu como el plugin de AI
        if (!window.Asc.ButtonContextMenu) {
            console.log(`[${PLUGIN_NAME}] ButtonContextMenu no disponible, usando método legacy`);
            registerContextMenuLegacy();
            return;
        }
        
        const iconPattern = (name) => `resources/icons/%theme-type%(light|dark)/${name}.svg`;
        
        // Botón principal "BIW"
        let buttonMain = new window.Asc.ButtonContextMenu();
        buttonMain.text = "BIW";
        buttonMain.icons = iconPattern("import");
        buttonMain.addCheckers("All");
        
        // Submenú: Importar datos
        let btnImport = new window.Asc.ButtonContextMenu(buttonMain);
        btnImport.text = "Importar datos";
        btnImport.icons = iconPattern("import");
        btnImport.addCheckers("All");
        btnImport.attachOnClick(function() {
            openImportWindow();
        });
        
        // Submenú: Editar filtros
        let btnFilters = new window.Asc.ButtonContextMenu(buttonMain);
        btnFilters.text = "Editar filtros";
        btnFilters.icons = iconPattern("filter");
        btnFilters.addCheckers("All");
        btnFilters.attachOnClick(function() {
            openFiltersPanel();
        });
        
        // Submenú: Expandir jerarquía
        let btnExpand = new window.Asc.ButtonContextMenu(buttonMain);
        btnExpand.text = "▶ Expandir jerarquía";
        btnExpand.editors = ["cell"];
        btnExpand.addCheckers("Selection");
        btnExpand.attachOnClick(function() {
            expandHierarchyAtSelection();
        });
        
        // Submenú: Contraer jerarquía
        let btnCollapse = new window.Asc.ButtonContextMenu(buttonMain);
        btnCollapse.text = "▲ Contraer jerarquía";
        btnCollapse.editors = ["cell"];
        btnCollapse.addCheckers("Selection");
        btnCollapse.attachOnClick(function() {
            collapseHierarchyAtSelection();
        });
        
        // Submenú: Expandir todas
        let btnExpandAll = new window.Asc.ButtonContextMenu(buttonMain);
        btnExpandAll.text = "⊞ Expandir todas";
        btnExpandAll.editors = ["cell"];
        btnExpandAll.addCheckers("All");
        btnExpandAll.attachOnClick(function() {
            expandAllHierarchies();
        });
        
        // Submenú: Contraer todas
        let btnCollapseAll = new window.Asc.ButtonContextMenu(buttonMain);
        btnCollapseAll.text = "⊟ Contraer todas";
        btnCollapseAll.editors = ["cell"];
        btnCollapseAll.addCheckers("All");
        btnCollapseAll.attachOnClick(function() {
            collapseAllHierarchies();
        });
        
        // Submenú: Actualizar
        let btnRefresh = new window.Asc.ButtonContextMenu(buttonMain);
        btnRefresh.text = "🔄 Actualizar";
        btnRefresh.icons = iconPattern("refresh");
        btnRefresh.addCheckers("All");
        btnRefresh.attachOnClick(function() {
            refreshData();
        });
        
        console.log(`[${PLUGIN_NAME}] Menú contextual registrado con ButtonContextMenu`);
    }
    
    // Método legacy por si ButtonContextMenu no está disponible
    function registerContextMenuLegacy() {
        window.Asc.plugin.executeMethod("AddContextMenuItem", [{
            guid: window.Asc.plugin.info.guid,
            items: [
                { id: "biw-ctx-import", text: "📊 BIW - Importar datos" },
                { id: "biw-ctx-expand", text: "▶ BIW - Expandir jerarquía" },
                { id: "biw-ctx-collapse", text: "▲ BIW - Contraer jerarquía" }
            ]
        }]);
    }

    // =========================================================================
    // HANDLERS DE EVENTOS
    // =========================================================================

    window.Asc.plugin.onToolbarMenuClick = function(id) {
        handleMenuClick(id);
    };

    window.Asc.plugin.onContextMenuClick = function(id) {
        switch(id) {
            case "biw-ctx-import":
                openImportWindow();
                break;
            case "biw-ctx-expand":
                expandHierarchyAtSelection();
                break;
            case "biw-ctx-collapse":
                collapseHierarchyAtSelection();
                break;
            case "biw-ctx-expand-all":
                expandAllHierarchies();
                break;
            case "biw-ctx-collapse-all":
                collapseAllHierarchies();
                break;
        }
    };

    function handleMenuClick(id) {
        switch(id) {
            case "biw-import":
                openImportWindow();
                break;
            case "biw-refresh":
            case "biw-refresh-all":
                refreshData();
                break;
            case "biw-filters":
                openFiltersPanel();
                break;
            case "biw-settings":
                openSettingsWindow();
                break;
        }
    }

    // =========================================================================
    // VENTANAS Y PANELES
    // =========================================================================

    /**
     * Abre la ventana modal de importación de datos
     */
    function openImportWindow() {
        if (!window.Asc.PluginWindow) return;
        
        closeWindow(importWindow);
        
        importWindow = new window.Asc.PluginWindow();
        
        // Escuchar datos de la ventana de importación
        importWindow.attachEvent("onInsertData", function(data) {
            console.log(`[${PLUGIN_NAME}] Datos recibidos:`, data);
            if (data && data.rows) {
                // Guardar estado de la query para jerarquías
                if (data.query) {
                    saveQueryState(data.query.name, data.query.selectedKeyFigures);
                }
                
                // Actualizar formato numérico si viene en los datos
                if (data.numberFormat) {
                    numberFormat = data.numberFormat;
                    try { localStorage.setItem('biw_number_format', numberFormat); } catch(e) {}
                }
                
                insertDataToSheet(data.rows, function(result) {
                    // Notificar a la ventana que la inserción terminó
                    if (importWindow) {
                        importWindow.command("onInsertComplete", result);
                    }
                }, {
                    columns: data.columns,
                    multiLevelHeaders: data.multiLevelHeaders
                });
            }
        });
        
        importWindow.attachEvent("onClose", function() {
            importWindow = null;
        });
        
        importWindow.show({
            url: 'window.html',
            description: 'Importar Datos BIW',
            isVisual: true,
            buttons: [
                { text: 'Importar', primary: true },
                { text: 'Cancelar', primary: false }
            ],
            isModal: true,
            EditorsSupport: ["word", "cell", "slide", "pdf"],
            size: [600, 550]
        });
    }

    /**
     * Abre la ventana modal de configuración
     */
    function openSettingsWindow() {
        if (!window.Asc.PluginWindow) return;
        
        closeWindow(settingsWindow);
        settingsWindow = createWindow({
            url: 'settings.html',
            description: 'Configuración BIW',
            buttons: [
                { text: 'Guardar', primary: true },
                { text: 'Cancelar', primary: false }
            ],
            isModal: true,
            size: [400, 350]
        }, function() { settingsWindow = null; });
    }

    /**
     * Abre el panel de filtros con funcionalidad PIN/UNPIN
     */
    function openFiltersPanel() {
        if (!window.Asc.PluginWindow) return;
        
        closeWindow(filtersPanel);
        
        // Recuperar estado guardado (window = flotante, panel = fijado)
        let savedType = "window";
        try {
            savedType = localStorage.getItem("biw_filters_placement") || "window";
        } catch(e) {}
        
        filtersPanel = new window.Asc.PluginWindow();
        
        // Escuchar datos del panel de filtros para insertar
        filtersPanel.attachEvent("onInsertData", function(data) {
            console.log(`[${PLUGIN_NAME}] Datos desde filtros:`, data);
            if (data && data.rows) {
                // Guardar estado de la query para jerarquías
                if (data.query) {
                    saveQueryState(data.query.name, data.query.selectedKeyFigures);
                }
                
                // Actualizar formato numérico si viene en los datos
                if (data.numberFormat) {
                    numberFormat = data.numberFormat;
                    try { localStorage.setItem('biw_number_format', numberFormat); } catch(e) {}
                }
                
                insertDataToSheet(data.rows, null, {
                    columns: data.columns,
                    multiLevelHeaders: data.multiLevelHeaders
                });
            }
        });
        
        filtersPanel.attachEvent("onDockedChanged", function(newType) {
            try {
                localStorage.setItem("biw_filters_placement", newType);
            } catch(e) {}
            window.Asc.plugin.executeMethod("OnWindowDockChangedCallback", [filtersPanel.id]);
        });
        
        filtersPanel.attachEvent("onClose", function() {
            filtersPanel = null;
        });
        
        filtersPanel.show({
            url: 'filters.html',
            description: 'Editar Filtros BIW',
            isVisual: true,
            buttons: [],
            isModal: false,
            isCanDocked: true,
            type: savedType,
            EditorsSupport: ["word", "cell", "slide", "pdf"],
            size: [350, 500]
        });
    }

    // =========================================================================
    // ACCIONES
    // =========================================================================

    /**
     * Actualiza los datos en la celda activa
     */
    function refreshData() {
        window.Asc.plugin.callCommand(function() {
            var oSheet = Api.GetActiveSheet();
            var oCell = oSheet.GetActiveCell();
            oCell.SetValue("Actualizado: " + new Date().toLocaleTimeString());
        }, true, true);
    }

    /**
     * Inserta datos en la hoja de cálculo con formato
     * Soporta cabeceras multi-nivel cuando hay dimensiones en columnas
     * @param {Array} rows - Filas de datos a insertar
     * @param {Function} callback - Callback después de insertar
     * @param {Object} options - Opciones adicionales (columns, multiLevelHeaders)
     */
    function insertDataToSheet(rows, callback, options = {}) {
        if (!rows || rows.length === 0) {
            console.log(`[${PLUGIN_NAME}] Sin datos para insertar`);
            if (callback) callback({ error: "Sin datos" });
            return;
        }
        
        console.log(`[${PLUGIN_NAME}] Insertando ${rows.length} filas...`);
        
        // Crear lista de ratios expandibles para marcar en headers
        const expandableRatios = {};
        for (const [uid, info] of Object.entries(lastQueryState.hierarchyMap)) {
            if (info.expandable && info.caption) {
                expandableRatios[info.caption] = true;
            }
        }
        
        // Guardar datos en scope para el comando
        window.Asc.scope.insertRows = rows;
        window.Asc.scope.expandableRatios = expandableRatios;
        window.Asc.scope.numberFormat = numberFormat;
        window.Asc.scope.columns = options.columns || null;
        window.Asc.scope.multiLevelHeaders = options.multiLevelHeaders || null;
        
        window.Asc.plugin.callCommand(function() {
            var oSheet = Api.GetActiveSheet();
            var sheetName = oSheet.GetName();
            var data = Asc.scope.insertRows;
            var expandableRatios = Asc.scope.expandableRatios || {};
            var numFormat = Asc.scope.numberFormat || 'EU';
            var columns = Asc.scope.columns || null;
            var multiLevelHeaders = Asc.scope.multiLevelHeaders || null;
            
            if (!data || data.length === 0) {
                return { error: "Sin datos en scope" };
            }
            
            // Función para formatear números según configuración
            function formatNumber(value) {
                if (value === null || value === undefined || value === '') return '';
                
                var num = parseFloat(value);
                if (isNaN(num)) return value;
                
                if (numFormat === 'EU') {
                    var parts = num.toFixed(2).split('.');
                    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                    return parts.join(',');
                } else {
                    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                }
            }
            
            // Función para detectar si un valor es numérico
            function isNumericValue(value) {
                if (value === null || value === undefined || value === '') return false;
                return !isNaN(parseFloat(value)) && isFinite(value);
            }
            
            // Determinar número de filas de cabecera
            var numHeaderRows = 1;
            var columnHeaders = null;
            if (multiLevelHeaders && multiLevelHeaders.columnHeaders && multiLevelHeaders.columnHeaders.length > 0) {
                numHeaderRows = multiLevelHeaders.columnHeaders.length;
                columnHeaders = multiLevelHeaders.columnHeaders;
            }
            
            var headers = columns || Object.keys(data[0]);
            var numRows = data.length + numHeaderRows;
            var numCols = headers.length;
            
            // Función para convertir número de columna a letra (0=A, 25=Z, 26=AA)
            function colToLetter(col) {
                var letter = '';
                var temp = col;
                while (temp >= 0) {
                    letter = String.fromCharCode((temp % 26) + 65) + letter;
                    temp = Math.floor(temp / 26) - 1;
                }
                return letter;
            }
            
            // Nombre de la hoja oculta para metadata
            var metaSheetName = "_BIWMeta";
            var metaSheet = Api.GetSheet(metaSheetName);
            
            // Si no existe la hoja de metadata, crearla y ocultarla
            if (!metaSheet) {
                Api.AddSheet(metaSheetName);
                metaSheet = Api.GetSheet(metaSheetName);
                if (metaSheet) {
                    metaSheet.SetVisible(false);
                }
            }
            
            // Leer metadata anterior (formato: sheetName|rows|cols en cada fila)
            var prevRows = 0;
            var prevCols = 0;
            if (metaSheet) {
                // Buscar la fila que corresponde a esta hoja
                for (var i = 0; i < 100; i++) {
                    var storedSheet = metaSheet.GetRangeByNumber(i, 0).GetValue();
                    if (storedSheet === sheetName) {
                        prevRows = parseInt(metaSheet.GetRangeByNumber(i, 1).GetValue()) || 0;
                        prevCols = parseInt(metaSheet.GetRangeByNumber(i, 2).GetValue()) || 0;
                        break;
                    }
                    if (!storedSheet || storedSheet === "") break;
                }
            }
            
            // LIMPIAR área anterior si existe
            if (prevRows > 0 && prevCols > 0) {
                var clearEndCol = colToLetter(prevCols - 1);
                var clearRangeStr = "A1:" + clearEndCol + prevRows;
                var clearRange = oSheet.GetRange(clearRangeStr);
                if (clearRange) {
                    // Limpiar valores y formato
                    clearRange.SetValue("");
                    // 'No Fill' quita el color de fondo y deja visible el grid
                    clearRange.SetFillColor('No Fill');
                    clearRange.SetFontColor(Api.CreateColorFromRGB(0, 0, 0));
                    clearRange.SetBold(false);
                }
            }
            
            // Colores para cabeceras (diferentes niveles)
            var headerBgPrimary = Api.CreateColorFromRGB(30, 58, 95);    // Azul oscuro para primera fila de cabecera
            var headerBgSecondary = Api.CreateColorFromRGB(68, 105, 149); // Azul medio para filas intermedias
            var headerBgLast = Api.CreateColorFromRGB(100, 140, 180);    // Azul claro para última fila de cabecera
            var headerFont = Api.CreateColorFromRGB(255, 255, 255);
            var altRowBg = Api.CreateColorFromRGB(245, 248, 252);
            
            // Escribir cabeceras multi-nivel
            if (columnHeaders && numHeaderRows > 1) {
                // Múltiples filas de cabecera
                for (var hRow = 0; hRow < numHeaderRows; hRow++) {
                    var headerData = columnHeaders[hRow];
                    var headerBg = (hRow === 0) ? headerBgPrimary : 
                                   (hRow === numHeaderRows - 1) ? headerBgLast : headerBgSecondary;
                    
                    for (var c = 0; c < headers.length; c++) {
                        var headerCell = oSheet.GetRangeByNumber(hRow, c);
                        var headerText = headerData[headers[c]] || '';
                        
                        // Para la última fila, añadir indicador ▶ si es ratio expandible
                        if (hRow === numHeaderRows - 1 && expandableRatios[headerText]) {
                            headerText = "▶ " + headerText;
                        }
                        
                        headerCell.SetValue(headerText);
                        headerCell.SetBold(true);
                        headerCell.SetFillColor(headerBg);
                        headerCell.SetFontColor(headerFont);
                        headerCell.SetAlignHorizontal("center");
                    }
                }
            } else {
                // Una sola fila de cabecera (comportamiento original)
                for (var c = 0; c < headers.length; c++) {
                    var headerCell = oSheet.GetRangeByNumber(0, c);
                    var headerText = headers[c];
                    
                    if (expandableRatios[headerText]) {
                        headerText = "▶ " + headerText;
                    }
                    
                    headerCell.SetValue(headerText);
                    headerCell.SetBold(true);
                    headerCell.SetFillColor(headerBgPrimary);
                    headerCell.SetFontColor(headerFont);
                }
            }
            
            // Escribir datos con filas alternadas (offset por número de filas de cabecera)
            var dataStartRow = numHeaderRows;
            for (var r = 0; r < data.length; r++) {
                for (var c = 0; c < headers.length; c++) {
                    var cell = oSheet.GetRangeByNumber(r + dataStartRow, c);
                    var value = data[r][headers[c]];
                    
                    // Formatear números según configuración
                    if (isNumericValue(value)) {
                        cell.SetValue(formatNumber(value));
                        cell.SetAlignHorizontal("right");
                    } else {
                        cell.SetValue(value !== undefined && value !== null ? value : "");
                    }
                    
                    // Filas alternadas
                    if (r % 2 === 1) {
                        cell.SetFillColor(altRowBg);
                    }
                }
            }
            
            // Guardar metadata en hoja oculta (sheetName, rows, cols)
            if (metaSheet) {
                // Buscar o crear la fila para esta hoja
                var metaRow = -1;
                var emptyRow = -1;
                for (var i = 0; i < 100; i++) {
                    var storedSheet = metaSheet.GetRangeByNumber(i, 0).GetValue();
                    if (storedSheet === sheetName) {
                        metaRow = i;
                        break;
                    }
                    if ((!storedSheet || storedSheet === "") && emptyRow === -1) {
                        emptyRow = i;
                    }
                }
                
                // Si no encontramos la fila, usar la primera vacía
                if (metaRow === -1) metaRow = (emptyRow !== -1) ? emptyRow : 0;
                
                // Guardar: sheetName, rows, cols
                metaSheet.GetRangeByNumber(metaRow, 0).SetValue(sheetName);
                metaSheet.GetRangeByNumber(metaRow, 1).SetValue(numRows);
                metaSheet.GetRangeByNumber(metaRow, 2).SetValue(numCols);
            }
            
            // Seleccionar celda A1
            oSheet.GetRange("A1").Select();
            
            return { 
                success: true, 
                count: data.length, 
                columns: headers.length,
                sheetName: sheetName
            };
            
        }, false, true, function(result) {
            console.log(`[${PLUGIN_NAME}] Inserción completada:`, result);
            if (callback) callback(result || { success: true });
        });
    }

    // =========================================================================
    // UTILIDADES
    // =========================================================================

    /**
     * Crea una ventana modal con la configuración dada
     */
    function createWindow(config, onClose) {
        var win = new window.Asc.PluginWindow();
        
        win.attachEvent("onClose", onClose);
        
        win.show({
            url: config.url,
            description: config.description,
            isVisual: true,
            buttons: config.buttons,
            isModal: config.isModal,
            EditorsSupport: ["word", "cell", "slide", "pdf"],
            size: config.size
        });
        
        return win;
    }

    /**
     * Cierra una ventana si existe
     */
    function closeWindow(win) {
        if (win) {
            try { win.close(); } catch(e) {}
        }
    }

    /**
     * Envía mensaje de attachEvent al editor
     */
    function attachEvent(eventName) {
        if (!window.Asc?.plugin?.info) return;
        
        var info = window.Asc.plugin.info;
        info.type = "attachEvent";
        info.name = eventName;
        
        try {
            var message = JSON.stringify(info);
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(message, "*");
            }
            if (typeof window.plugin_sendMessage === 'function') {
                window.plugin_sendMessage(message);
            }
        } catch(e) {}
    }

    // =========================================================================
    // HANDLERS DE PLUGIN
    // =========================================================================

    /**
     * Handler de botones de ventanas modales
     */
    window.Asc.plugin.button = function(id, windowId) {
        if (!windowId) return;
        
        // Importar - NO cerrar aquí, dejar que la ventana maneje la inserción
        if (importWindow && windowId === importWindow.id) {
            if (id === 1) { // Solo cerrar en "Cancelar"
                importWindow.close();
                importWindow = null;
            }
            // El botón "Importar" (id=0) se maneja desde window.html
            return;
        }
        
        // Configuración
        if (settingsWindow && windowId === settingsWindow.id) {
            if (id === 0) {
                // TODO: Guardar configuración antes de cerrar
            }
            settingsWindow.close();
            settingsWindow = null;
            return;
        }
        
        // Panel de filtros
        if (filtersPanel && windowId === filtersPanel.id) {
            filtersPanel.close();
            filtersPanel = null;
        }
    };

    // Handlers requeridos (vacíos)
    window.Asc.plugin.onExternalMouseUp = function() {};
    window.Asc.plugin.onTranslate = function() {};

    // =========================================================================
    // JERARQUÍAS DE RATIOS
    // =========================================================================

    /**
     * Carga la jerarquía de ratios desde el servidor
     */
    async function loadRatioHierarchy(queryName) {
        try {
            const res = await fetch(`${SERVER_URL}/api/bw-query/ratio-hierarchy/${queryName}`);
            if (!res.ok) return;
            
            const data = await res.json();
            if (data.hierarchy) {
                lastQueryState.hierarchyMap = {};
                data.hierarchy.forEach(h => {
                    lastQueryState.hierarchyMap[h.uid] = {
                        expandable: h.expandable === 1 || h.hasChildren,
                        children: [],
                        parentUid: h.parent_uid || null,
                        caption: h.caption
                    };
                });
                // Asignar hijos a padres
                Object.keys(lastQueryState.hierarchyMap).forEach(uid => {
                    const parentUid = lastQueryState.hierarchyMap[uid].parentUid;
                    if (parentUid && lastQueryState.hierarchyMap[parentUid]) {
                        lastQueryState.hierarchyMap[parentUid].children.push(uid);
                    }
                });
            }
        } catch(e) {
            console.error(`[${PLUGIN_NAME}] Error cargando jerarquía:`, e.message);
        }
    }

    /**
     * Expande la jerarquía en la celda seleccionada
     */
    function expandHierarchyAtSelection() {
        window.Asc.plugin.callCommand(function() {
            var oSheet = Api.GetActiveSheet();
            var oRange = oSheet.GetSelection();
            var cellValue = oRange.GetValue();
            return { value: cellValue, row: 0, col: 0 };
        }, false, false, async function(result) {
            if (!result || !result.value) {
                console.log(`[${PLUGIN_NAME}] No hay valor en la celda seleccionada`);
                return;
            }
            
            // Buscar si el valor coincide con algún ratio expandible
            // Quitar el prefijo ▶ si existe
            let cellText = result.value.toString().trim();
            if (cellText.startsWith("▶ ")) {
                cellText = cellText.substring(2).trim();
            }
            
            let foundUid = null;
            
            for (const [uid, info] of Object.entries(lastQueryState.hierarchyMap)) {
                if (info.expandable && info.caption && info.caption.trim() === cellText) {
                    foundUid = uid;
                    break;
                }
            }
            
            if (foundUid) {
                await expandRatio(foundUid);
            } else {
                console.log(`[${PLUGIN_NAME}] "${cellText}" no es un ratio expandible`);
            }
        });
    }

    /**
     * Contrae la jerarquía en la celda seleccionada
     */
    function collapseHierarchyAtSelection() {
        window.Asc.plugin.callCommand(function() {
            var oSheet = Api.GetActiveSheet();
            var oRange = oSheet.GetSelection();
            var cellValue = oRange.GetValue();
            return { value: cellValue };
        }, false, false, async function(result) {
            if (!result || !result.value) return;
            
            // Quitar el prefijo ▶ si existe
            let cellText = result.value.toString().trim();
            if (cellText.startsWith("▶ ")) {
                cellText = cellText.substring(2).trim();
            }
            
            let foundUid = null;
            
            for (const [uid, info] of Object.entries(lastQueryState.hierarchyMap)) {
                if (info.expandable && info.caption && info.caption.trim() === cellText) {
                    foundUid = uid;
                    break;
                }
            }
            
            if (foundUid && lastQueryState.expandedRatios.has(foundUid)) {
                await collapseRatio(foundUid);
            }
        });
    }

    /**
     * Expande un ratio específico
     */
    async function expandRatio(uid) {
        if (!lastQueryState.queryName) {
            console.log(`[${PLUGIN_NAME}] No hay query activa`);
            return;
        }
        
        const info = lastQueryState.hierarchyMap[uid];
        if (!info || !info.expandable) return;
        
        console.log(`[${PLUGIN_NAME}] Expandiendo ratio: ${info.caption}`);
        
        // Añadir hijos a los key figures seleccionados
        lastQueryState.expandedRatios.add(uid);
        
        const newKeyFigures = [...lastQueryState.selectedKeyFigures];
        const uidIndex = newKeyFigures.indexOf(uid);
        
        if (uidIndex !== -1 && info.children.length > 0) {
            // Insertar hijos después del padre
            info.children.forEach((childUid, i) => {
                if (!newKeyFigures.includes(childUid)) {
                    newKeyFigures.splice(uidIndex + 1 + i, 0, childUid);
                }
            });
            
            lastQueryState.selectedKeyFigures = newKeyFigures;
            
            // Re-ejecutar la query con los nuevos key figures
            await reExecuteQuery();
        }
    }

    /**
     * Contrae un ratio específico
     */
    async function collapseRatio(uid) {
        const info = lastQueryState.hierarchyMap[uid];
        if (!info || !info.expandable) return;
        
        console.log(`[${PLUGIN_NAME}] Contrayendo ratio: ${info.caption}`);
        
        // Quitar hijos de los key figures seleccionados
        lastQueryState.expandedRatios.delete(uid);
        
        lastQueryState.selectedKeyFigures = lastQueryState.selectedKeyFigures.filter(
            kf => !info.children.includes(kf)
        );
        
        // Re-ejecutar la query
        await reExecuteQuery();
    }

    /**
     * Expande todas las jerarquías
     */
    async function expandAllHierarchies() {
        if (!lastQueryState.queryName) return;
        
        let changed = false;
        
        for (const [uid, info] of Object.entries(lastQueryState.hierarchyMap)) {
            if (info.expandable && !lastQueryState.expandedRatios.has(uid)) {
                lastQueryState.expandedRatios.add(uid);
                
                const uidIndex = lastQueryState.selectedKeyFigures.indexOf(uid);
                if (uidIndex !== -1) {
                    info.children.forEach((childUid, i) => {
                        if (!lastQueryState.selectedKeyFigures.includes(childUid)) {
                            lastQueryState.selectedKeyFigures.splice(uidIndex + 1 + i, 0, childUid);
                        }
                    });
                }
                changed = true;
            }
        }
        
        if (changed) {
            await reExecuteQuery();
        }
    }

    /**
     * Contrae todas las jerarquías
     */
    async function collapseAllHierarchies() {
        if (!lastQueryState.queryName) return;
        
        // Recolectar todos los hijos
        const allChildren = new Set();
        for (const [uid, info] of Object.entries(lastQueryState.hierarchyMap)) {
            if (info.expandable) {
                info.children.forEach(c => allChildren.add(c));
            }
        }
        
        // Quitar todos los hijos
        lastQueryState.selectedKeyFigures = lastQueryState.selectedKeyFigures.filter(
            kf => !allChildren.has(kf)
        );
        lastQueryState.expandedRatios.clear();
        
        await reExecuteQuery();
    }

    /**
     * Re-ejecuta la query con el estado actual
     */
    async function reExecuteQuery() {
        if (!lastQueryState.queryName) return;
        
        console.log(`[${PLUGIN_NAME}] Re-ejecutando query con ${lastQueryState.selectedKeyFigures.length} key figures`);
        
        try {
            const res = await fetch(`${SERVER_URL}/api/bw-query/execute-mdx`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    queryName: lastQueryState.queryName,
                    selectedKeyFigures: lastQueryState.selectedKeyFigures
                })
            });
            
            if (!res.ok) throw new Error('Error ejecutando query');
            
            const data = await res.json();
            
            if (data.data && data.data.length > 0) {
                insertDataToSheet(data.data, function(result) {
                    console.log(`[${PLUGIN_NAME}] Datos actualizados:`, result);
                });
            }
            
        } catch(e) {
            console.error(`[${PLUGIN_NAME}] Error:`, e.message);
        }
    }

    /**
     * Guarda el estado de la query después de una ejecución
     */
    function saveQueryState(queryName, selectedKeyFigures) {
        lastQueryState.queryName = queryName;
        lastQueryState.selectedKeyFigures = selectedKeyFigures || [];
        
        // Cargar jerarquía si no existe
        if (Object.keys(lastQueryState.hierarchyMap).length === 0) {
            loadRatioHierarchy(queryName);
        }
    }
    window.Asc.plugin.onThemeChanged = function() {};

    // =========================================================================
    // LISTENER DE MENSAJES
    // =========================================================================

    window.addEventListener('message', function(event) {
        try {
            var msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            
            // Eventos de menú
            if (msg.type === 'onEvent') {
                if (msg.eventName === 'onToolbarMenuClick') {
                    handleMenuClick(msg.eventData);
                } else if (msg.eventName === 'onContextMenuClick' && msg.eventData === "biw-ctx-import") {
                    openImportWindow();
                }
            }
        } catch(e) {}
    });

})(window);
