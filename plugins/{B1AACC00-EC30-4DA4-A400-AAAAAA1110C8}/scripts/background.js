/**
 * Data Analyzer — Background Service v1.0.0
 *
 * Registers the "Análisis" ribbon tab, context menu,
 * and manages import / filters / settings windows.
 */

(function(window, undefined) {
    'use strict';

    var VERSION = '1.0.0';
    var PLUGIN_NAME = 'DataAnalyzer';

    var dsManager = null;
    var importWindow = null;
    var settingsWindow = null;
    var filtersPanel = null;
    var isInitialized = false;

    // =====================================================================
    // INIT
    // =====================================================================

    window.Asc.plugin.init = function() {
        if (isInitialized) return;
        isInitialized = true;

        console.log('[' + PLUGIN_NAME + '] v' + VERSION + ' inicializado');

        dsManager = new DataSourceManager();
        if (dsManager.list().length === 0) {
            dsManager.register(new MockDataSource());
        }

        attachEvent('onToolbarMenuClick');
        attachEvent('onContextMenuClick');
        setTimeout(registerUI, 100);
    };

    // =====================================================================
    // UI REGISTRATION
    // =====================================================================

    function registerUI() {
        registerToolbar();
        registerContextMenu();
    }

    function registerToolbar() {
        var icon = function(name) {
            return 'resources/icons/%theme-type%(light|dark)/' + name + '.svg';
        };

        window.Asc.plugin.executeMethod('AddToolbarMenuItem', [{
            guid: window.Asc.plugin.info.guid,
            tabs: [{
                id: 'DATab',
                text: 'Análisis',
                items: [
                    {
                        id: 'da-import',
                        type: 'button',
                        text: 'Importar Datos',
                        hint: 'Importar datos desde un origen',
                        icons: icon('import')
                    },
                    {
                        id: 'da-refresh-btn',
                        type: 'button',
                        text: 'Actualizar',
                        hint: 'Actualiza los datos importados',
                        icons: icon('refresh'),
                        split: true,
                        items: [
                            { id: 'da-refresh', text: 'Actualizar Query Actual' },
                            { id: 'da-refresh-all', text: 'Actualizar Todas' }
                        ]
                    },
                    {
                        id: 'da-filters',
                        type: 'button',
                        text: 'Filtros',
                        hint: 'Panel de filtros (se puede fijar al lateral)',
                        icons: icon('filter')
                    },
                    {
                        id: 'da-settings',
                        type: 'button',
                        text: 'Configuración',
                        hint: 'Configuración de orígenes de datos',
                        icons: icon('settings')
                    }
                ]
            }]
        }]);
    }

    function registerContextMenu() {
        if (!window.Asc.ButtonContextMenu) {
            registerContextMenuLegacy();
            return;
        }

        var icon = function(name) {
            return 'resources/icons/%theme-type%(light|dark)/' + name + '.svg';
        };

        var main = new window.Asc.ButtonContextMenu();
        main.text = 'Análisis';
        main.icons = icon('import');
        main.addCheckers('All');

        var btnImport = new window.Asc.ButtonContextMenu(main);
        btnImport.text = 'Importar datos';
        btnImport.icons = icon('import');
        btnImport.addCheckers('All');
        btnImport.attachOnClick(function() { openImportWindow(); });

        var btnFilters = new window.Asc.ButtonContextMenu(main);
        btnFilters.text = 'Editar filtros';
        btnFilters.icons = icon('filter');
        btnFilters.addCheckers('All');
        btnFilters.attachOnClick(function() { openFiltersPanel(); });

        var btnRefresh = new window.Asc.ButtonContextMenu(main);
        btnRefresh.text = 'Actualizar';
        btnRefresh.icons = icon('refresh');
        btnRefresh.addCheckers('All');
        btnRefresh.attachOnClick(function() { refreshData(); });
    }

    function registerContextMenuLegacy() {
        window.Asc.plugin.executeMethod('AddContextMenuItem', [{
            guid: window.Asc.plugin.info.guid,
            items: [
                { id: 'da-ctx-import', text: '📊 Análisis - Importar datos' },
                { id: 'da-ctx-filters', text: '🔍 Análisis - Filtros' }
            ]
        }]);
    }

    // =====================================================================
    // EVENT HANDLERS
    // =====================================================================

    window.Asc.plugin.onToolbarMenuClick = function(id) { handleMenuClick(id); };

    window.Asc.plugin.onContextMenuClick = function(id) {
        if (id === 'da-ctx-import') openImportWindow();
        else if (id === 'da-ctx-filters') openFiltersPanel();
    };

    function handleMenuClick(id) {
        switch (id) {
            case 'da-import':       openImportWindow(); break;
            case 'da-refresh':
            case 'da-refresh-all':  refreshData(); break;
            case 'da-filters':      openFiltersPanel(); break;
            case 'da-settings':     openSettingsWindow(); break;
        }
    }

    // =====================================================================
    // WINDOWS & PANELS
    // =====================================================================

    function openImportWindow() {
        if (!window.Asc.PluginWindow) return;
        closeWindow(importWindow);

        importWindow = new window.Asc.PluginWindow();

        importWindow.attachEvent('onInsertData', function(data) {
            if (data && data.rows) {
                if (data.numberFormat) {
                    try { localStorage.setItem('da_number_format', data.numberFormat); } catch(e) {}
                }
                var columns = data.columns || null;
                SheetWriter.insert(data.rows, {
                    columns: columns,
                    numberFormat: data.numberFormat,
                    callback: function(result) {
                        if (importWindow) importWindow.command('onInsertComplete', result);
                    }
                });
            }
        });

        importWindow.attachEvent('onClose', function() { importWindow = null; });

        importWindow.show({
            url: 'import.html',
            description: 'Importar Datos',
            isVisual: true,
            buttons: [
                { text: 'Importar', primary: true },
                { text: 'Cancelar', primary: false }
            ],
            isModal: true,
            EditorsSupport: ['cell'],
            size: [640, 580]
        });
    }

    function openSettingsWindow() {
        if (!window.Asc.PluginWindow) return;
        closeWindow(settingsWindow);

        settingsWindow = createWindow({
            url: 'settings.html',
            description: 'Configuración Análisis',
            buttons: [
                { text: 'Guardar', primary: true },
                { text: 'Cancelar', primary: false }
            ],
            isModal: true,
            size: [480, 420]
        }, function() { settingsWindow = null; });
    }

    function openFiltersPanel() {
        if (!window.Asc.PluginWindow) return;
        closeWindow(filtersPanel);

        var savedType = 'window';
        try { savedType = localStorage.getItem('da_filters_placement') || 'window'; } catch(e) {}

        filtersPanel = new window.Asc.PluginWindow();

        filtersPanel.attachEvent('onInsertData', function(data) {
            if (data && data.rows) {
                if (data.numberFormat) {
                    try { localStorage.setItem('da_number_format', data.numberFormat); } catch(e) {}
                }
                SheetWriter.insert(data.rows, {
                    columns: data.columns || null,
                    numberFormat: data.numberFormat
                });
            }
        });

        filtersPanel.attachEvent('onDockedChanged', function(newType) {
            try { localStorage.setItem('da_filters_placement', newType); } catch(e) {}
            window.Asc.plugin.executeMethod('OnWindowDockChangedCallback', [filtersPanel.id]);
        });

        filtersPanel.attachEvent('onClose', function() { filtersPanel = null; });

        filtersPanel.show({
            url: 'filters.html',
            description: 'Filtros de Datos',
            isVisual: true,
            buttons: [],
            isModal: false,
            isCanDocked: true,
            type: savedType,
            EditorsSupport: ['cell'],
            size: [350, 500]
        });
    }

    // =====================================================================
    // ACTIONS
    // =====================================================================

    function refreshData() {
        window.Asc.plugin.callCommand(function() {
            var oSheet = Api.GetActiveSheet();
            var oCell = oSheet.GetActiveCell();
            oCell.SetValue('Actualizado: ' + new Date().toLocaleTimeString());
        }, true, true);
    }

    // =====================================================================
    // HELPERS
    // =====================================================================

    function createWindow(config, onClose) {
        var win = new window.Asc.PluginWindow();
        win.attachEvent('onClose', onClose);
        win.show({
            url: config.url,
            description: config.description,
            isVisual: true,
            buttons: config.buttons,
            isModal: config.isModal,
            EditorsSupport: ['cell'],
            size: config.size
        });
        return win;
    }

    function closeWindow(win) {
        if (win) { try { win.close(); } catch(e) {} }
    }

    function attachEvent(eventName) {
        if (!window.Asc || !window.Asc.plugin || !window.Asc.plugin.info) return;
        var info = window.Asc.plugin.info;
        info.type = 'attachEvent';
        info.name = eventName;
        try {
            var message = JSON.stringify(info);
            if (window.parent && window.parent !== window) window.parent.postMessage(message, '*');
            if (typeof window.plugin_sendMessage === 'function') window.plugin_sendMessage(message);
        } catch(e) {}
    }

    // =====================================================================
    // BUTTON & MISC HANDLERS
    // =====================================================================

    window.Asc.plugin.button = function(id, windowId) {
        if (!windowId) return;

        if (importWindow && windowId === importWindow.id) {
            if (id === 1) { importWindow.close(); importWindow = null; }
            return;
        }
        if (settingsWindow && windowId === settingsWindow.id) {
            settingsWindow.close(); settingsWindow = null;
            return;
        }
        if (filtersPanel && windowId === filtersPanel.id) {
            filtersPanel.close(); filtersPanel = null;
        }
    };

    window.Asc.plugin.onExternalMouseUp = function() {};
    window.Asc.plugin.onTranslate = function() {};
    window.Asc.plugin.onThemeChanged = function() {};

    // =====================================================================
    // MESSAGE LISTENER
    // =====================================================================

    window.addEventListener('message', function(event) {
        try {
            var msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            if (msg.type === 'onEvent') {
                if (msg.eventName === 'onToolbarMenuClick') handleMenuClick(msg.eventData);
                else if (msg.eventName === 'onContextMenuClick') {
                    if (msg.eventData === 'da-ctx-import') openImportWindow();
                    else if (msg.eventData === 'da-ctx-filters') openFiltersPanel();
                }
            }
        } catch(e) {}
    });

})(window);
