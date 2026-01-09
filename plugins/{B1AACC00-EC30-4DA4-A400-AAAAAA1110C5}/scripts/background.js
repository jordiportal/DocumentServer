/**
 * BIW Data Connector - Background Service v3.1.0
 * 
 * Plugin de fondo que registra la pestaña BIW en el ribbon
 * y gestiona las ventanas modales y el panel de filtros.
 */

(function(window, undefined) {
    'use strict';

    const VERSION = "3.7.0";
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
        window.Asc.plugin.executeMethod("AddToolbarMenuItem", [{
            guid: window.Asc.plugin.info.guid,
            tabs: [{
                id: "BIWTab",
                text: "BIW",
                items: [
                    {
                        id: "biw-import-btn",
                        type: "button",
                        text: "Importar Datos",
                        hint: "Importar datos desde BIW",
                        icons: "resources/icons/import.svg",
                        split: true,
                        items: [
                            { id: "biw-import", text: "Importar desde Query" },
                            { id: "biw-import-file", text: "Importar desde Archivo" }
                        ]
                    },
                    {
                        id: "biw-refresh-btn",
                        type: "button",
                        text: "Actualizar",
                        hint: "Actualiza los datos importados",
                        icons: "resources/icons/refresh.svg",
                        items: [
                            { id: "biw-refresh", text: "Actualizar Todo" }
                        ]
                    },
                    {
                        id: "biw-filters-btn",
                        type: "button",
                        text: "Editar Filtros",
                        hint: "Panel de filtros (se puede fijar al lateral)",
                        icons: "resources/icons/settings.svg",
                        items: [
                            { id: "biw-filters", text: "Abrir Panel de Filtros" }
                        ]
                    },
                    {
                        id: "biw-settings-btn",
                        type: "button",
                        text: "Configuración",
                        hint: "Configuración del conector BIW",
                        icons: "resources/icons/settings.svg",
                        items: [
                            { id: "biw-settings", text: "Abrir Configuración" }
                        ]
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
            case "biw-import-file":
                openImportWindow();
                break;
            case "biw-refresh":
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
     * Limpia datos anteriores antes de insertar
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
            var data = Asc.scope.insertRows;
            
            if (!data || data.length === 0) {
                return { error: "Sin datos en scope" };
            }
            
            var headers = Object.keys(data[0]);
            var numRows = data.length + 1; // +1 para headers
            var numCols = headers.length;
            
            // LIMPIAR área anterior (hasta 200 filas x 100 columnas)
            var clearRange = oSheet.GetRange("A1:CV200");
            clearRange.SetValue("");
            clearRange.SetFillColor(Api.CreateColorFromRGB(255, 255, 255));
            clearRange.SetFontColor(Api.CreateColorFromRGB(0, 0, 0));
            clearRange.SetBold(false);
            
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
            
            // Seleccionar celda A1
            oSheet.GetRange("A1").Select();
            
            return { success: true, count: data.length, columns: headers.length };
            
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
