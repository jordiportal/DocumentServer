/**
 * BIW Data Connector - Background Service v3.1.0
 * 
 * Plugin de fondo que registra la pestaña BIW en el ribbon
 * y gestiona las ventanas modales y el panel de filtros.
 */

(function(window, undefined) {
    'use strict';

    const VERSION = "3.9.6";
    const PLUGIN_NAME = "BIW";
    
    // Referencias a ventanas activas
    let importWindow = null;
    let settingsWindow = null;
    let filtersPanel = null;
    let isInitialized = false;

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
        window.Asc.plugin.executeMethod("AddContextMenuItem", [{
            guid: window.Asc.plugin.info.guid,
            items: [{
                id: "biw-ctx-import",
                text: "📊 Importar datos BIW"
            }]
        }]);
    }

    // =========================================================================
    // HANDLERS DE EVENTOS
    // =========================================================================

    window.Asc.plugin.onToolbarMenuClick = function(id) {
        handleMenuClick(id);
    };

    window.Asc.plugin.onContextMenuClick = function(id) {
        if (id === "biw-ctx-import") {
            openImportWindow();
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
                insertDataToSheet(data.rows, function(result) {
                    // Notificar a la ventana que la inserción terminó
                    if (importWindow) {
                        importWindow.command("onInsertComplete", result);
                    }
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
                insertDataToSheet(data.rows);
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
     * Usa Defined Names (nombres definidos ocultos) para guardar el rango usado en el archivo Excel
     * @param {Array} rows - Filas de datos a insertar
     * @param {Function} callback - Callback después de insertar
     */
    function insertDataToSheet(rows, callback) {
        if (!rows || rows.length === 0) {
            console.log(`[${PLUGIN_NAME}] Sin datos para insertar`);
            if (callback) callback({ error: "Sin datos" });
            return;
        }
        
        console.log(`[${PLUGIN_NAME}] Insertando ${rows.length} filas...`);
        
        // Guardar datos en scope para el comando
        window.Asc.scope.insertRows = rows;
        
        window.Asc.plugin.callCommand(function() {
            var oSheet = Api.GetActiveSheet();
            var sheetName = oSheet.GetName();
            var data = Asc.scope.insertRows;
            
            if (!data || data.length === 0) {
                return { error: "Sin datos en scope" };
            }
            
            var headers = Object.keys(data[0]);
            var numRows = data.length + 1; // +1 para headers
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
            
            // Colores
            var headerBg = Api.CreateColorFromRGB(30, 58, 95);
            var headerFont = Api.CreateColorFromRGB(255, 255, 255);
            var altRowBg = Api.CreateColorFromRGB(245, 248, 252);
            
            // Escribir headers con formato
            for (var c = 0; c < headers.length; c++) {
                var headerCell = oSheet.GetRangeByNumber(0, c);
                headerCell.SetValue(headers[c]);
                headerCell.SetBold(true);
                headerCell.SetFillColor(headerBg);
                headerCell.SetFontColor(headerFont);
            }
            
            // Escribir datos con filas alternadas
            for (var r = 0; r < data.length; r++) {
                for (var c = 0; c < headers.length; c++) {
                    var cell = oSheet.GetRangeByNumber(r + 1, c);
                    var value = data[r][headers[c]];
                    cell.SetValue(value !== undefined && value !== null ? value : "");
                    
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
