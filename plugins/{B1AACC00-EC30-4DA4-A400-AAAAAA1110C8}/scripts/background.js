/**
 * Data Analyzer — Background Service v2.1.0
 *
 * Registers the "Análisis" ribbon tab, dynamic context menu,
 * manages import / analysis panel / settings windows,
 * coordinates PivotConfig state, and persists to document properties.
 */

(function(window, undefined) {
    'use strict';

    var VERSION = '2.5.3';
    var PLUGIN_NAME = 'DataAnalyzer';

    var dsManager        = null;
    var importWindow      = null;
    var settingsWindow    = null;
    var filtersPanel      = null;
    var isInitialized     = false;
    var currentPivotConfig = null;
    var currentCellInfo    = null; // { row, col, value, sheetName }

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
        setTimeout(restoreConfigForCurrentSheet, 500);

    };

    // =====================================================================
    // UI REGISTRATION
    // =====================================================================

    function registerUI() {
        registerToolbar();
        registerContextMenu();
        registerEditorEvents();
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
                        text: 'Análisis',
                        hint: 'Panel de análisis (se puede fijar al lateral)',
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
        if (window.Asc.ButtonContextMenu) {
            registerContextMenuModern();
        } else {
            registerContextMenuLegacy();
        }
    }

    function registerContextMenuModern() {
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

        var btnPanel = new window.Asc.ButtonContextMenu(main);
        btnPanel.text = 'Panel de análisis';
        btnPanel.icons = icon('filter');
        btnPanel.addCheckers('All');
        btnPanel.attachOnClick(function() { openFiltersPanel(); });

        var btnRefresh = new window.Asc.ButtonContextMenu(main);
        btnRefresh.text = 'Actualizar datos';
        btnRefresh.icons = icon('refresh');
        btnRefresh.addCheckers('All');
        btnRefresh.attachOnClick(function() { refreshCurrentQuery(); });
    }

    function registerContextMenuLegacy() {
        window.Asc.plugin.executeMethod('AddContextMenuItem', [{
            guid: window.Asc.plugin.info.guid,
            items: [
                { id: 'da-ctx-import', text: 'Análisis - Importar datos' },
                { id: 'da-ctx-panel', text: 'Análisis - Panel de análisis' },
                { id: 'da-ctx-refresh', text: 'Análisis - Actualizar' }
            ]
        }]);
    }

    // =====================================================================
    // EDITOR EVENTS
    // =====================================================================

    function registerEditorEvents() {
        // Track cell selection changes
        try {
            window.Asc.plugin.attachEditorEvent('onTargetPositionChanged', function() {
                readCurrentCell();
            });
        } catch(e) {
            console.log('[' + PLUGIN_NAME + '] onTargetPositionChanged not available');
        }

        // Track sheet changes to restore config
        try {
            window.Asc.plugin.attachEditorEvent('onChangeCurrentSheet', function() {
                restoreConfigForCurrentSheet();
            });
        } catch(e) {
            console.log('[' + PLUGIN_NAME + '] onChangeCurrentSheet not available');
        }

        // Dynamic context menu
        try {
            window.Asc.plugin.attachEditorEvent('onContextMenuShow', function(options) {
                buildDynamicContextMenu(options);
            });
        } catch(e) {
            console.log('[' + PLUGIN_NAME + '] onContextMenuShow not available');
        }
    }

    var lastDrillCell = null;
    var drillInProgress = false;

    function readCurrentCell() {
        if (drillInProgress) return;
        window.Asc.plugin.callCommand(function() {
            var sheet = Api.GetActiveSheet();
            var cell = sheet.GetActiveCell();
            return {
                row: cell.GetRow(),
                col: cell.GetCol(),
                value: cell.GetValue(),
                sheetName: sheet.GetName()
            };
        }, false, false, function(result) {
            if (result) {
                currentCellInfo = result;
                checkDrillAction(result);
            }
        });
    }

    function checkDrillAction(cellInfo) {
        if (!currentPivotConfig || !cellInfo || cellInfo.row <= 1) return;

        var val = cellInfo.value;
        if (!val) return;

        var trimmed = val.replace(/^\s+/, '');
        var firstChar = trimmed.charAt(0);
        if (firstChar !== '\u25B6' && firstChar !== '\u25BC') return;

        // Avoid duplicate triggers for the same cell
        var cellKey = cellInfo.row + ':' + cellInfo.col;
        if (lastDrillCell === cellKey) return;
        lastDrillCell = cellKey;
        setTimeout(function() { lastDrillCell = null; }, 3000);

        // Read drill info from stored document properties
        window.Asc.plugin.callCommand(function() {
            var sheet = Api.GetActiveSheet();
            var props = Api.GetCustomProperties();
            var meta = props.Get('_DA_' + sheet.GetName());
            return meta || null;
        }, false, false, function(metaJSON) {
            if (!metaJSON) return;
            try {
                var meta = JSON.parse(metaJSON);
                if (!meta.drillInfo) return;
                var rowIdx = cellInfo.row - 2; // GetRow() is 1-based, header at row 1, data starts at row 2
                var drillItem = meta.drillInfo[rowIdx];
                if (!drillItem || !drillItem.hasChildren) return;

                executeDrill(drillItem.hierName, drillItem.nodePath);
            } catch(e) {
                console.error('[' + PLUGIN_NAME + '] drill parse error:', e);
            }
        });
    }

    function executeDrill(hierName, nodePath) {
        if (!currentPivotConfig) return;
        drillInProgress = true;
        var newState = currentPivotConfig.toggleNode(hierName, nodePath);
        console.log('[' + PLUGIN_NAME + '] drill: ' + hierName + '/' + nodePath + ' → ' + (newState ? 'expanded' : 'collapsed'));
        reExecuteWithCurrentConfig(function() {
            drillInProgress = false;
        });
    }

    function buildDynamicContextMenu(options) {
        var items = [];

        if (currentPivotConfig && currentCellInfo) {
            var rowDims = currentPivotConfig.rowFields || [];
            var numRowDims = rowDims.length;

            if (currentCellInfo.row === 0 && currentCellInfo.col < numRowDims) {
                items.push({ id: 'da-dyn-move-cols', text: 'Mover a Columnas' });
                items.push({ id: 'da-dyn-move-filter', text: 'Mover a Filtros' });
                items.push({ id: 'da-dyn-remove-field', text: 'Quitar campo' });
            } else if (currentCellInfo.row > 0 && currentCellInfo.col < numRowDims) {
                var val = currentCellInfo.value;
                if (val) {
                    items.push({
                        id: 'da-dyn-filter-value',
                        text: 'Filtrar por: ' + (val.length > 20 ? val.substring(0, 20) + '...' : val)
                    });
                }
            }
        }

        items.push({ id: 'da-ctx-panel', text: 'Panel de análisis' });
        items.push({ id: 'da-ctx-refresh', text: 'Actualizar datos' });

        window.Asc.plugin.executeMethod('AddContextMenuItem', [{
            guid: window.Asc.plugin.info.guid,
            items: items
        }]);
    }

    // =====================================================================
    // PERSISTENCE — RESTORE CONFIG
    // =====================================================================

    function restoreConfigForCurrentSheet() {
        window.Asc.plugin.callCommand(function() {
            var sheet = Api.GetActiveSheet();
            var sheetName = sheet.GetName();
            var props = Api.GetCustomProperties();
            var json = props.Get('_DA_' + sheetName);
            return json || null;
        }, false, false, function(result) {
            if (result && typeof result === 'string') {
                try {
                    var meta = JSON.parse(result);
                    currentPivotConfig = PivotConfig.fromJSON(meta.pivotConfig);
                    console.log('[' + PLUGIN_NAME + '] Config restored');
                    if (filtersPanel) {
                        filtersPanel.command('onConfigLoaded', currentPivotConfig.toJSON());
                    }
                } catch(e) { currentPivotConfig = null; }
            } else {
                currentPivotConfig = null;
            }
        });
    }

    // =====================================================================
    // EVENT HANDLERS
    // =====================================================================

    window.Asc.plugin.onToolbarMenuClick = function(id) { handleMenuClick(id); };

    window.Asc.plugin.onContextMenuClick = function(id) {
        switch (id) {
            case 'da-ctx-import':        openImportWindow(); break;
            case 'da-ctx-panel':         openFiltersPanel(); break;
            case 'da-ctx-refresh':       refreshCurrentQuery(); break;
            case 'da-dyn-move-cols':     dynMoveToColumns(); break;
            case 'da-dyn-move-filter':   dynMoveToFilter(); break;
            case 'da-dyn-remove-field':  dynRemoveField(); break;
            case 'da-dyn-filter-value':  dynFilterByValue(); break;
        }
    };

    function handleMenuClick(id) {
        switch (id) {
            case 'da-import':       openImportWindow(); break;
            case 'da-refresh':
            case 'da-refresh-all':  refreshCurrentQuery(); break;
            case 'da-filters':      openFiltersPanel(); break;
            case 'da-settings':     openSettingsWindow(); break;
        }
    }

    // =====================================================================
    // DYNAMIC CONTEXT MENU ACTIONS
    // =====================================================================

    function dynMoveToColumns() {
        if (!currentPivotConfig || !currentCellInfo) return;
        var colIdx = currentCellInfo.col;
        if (colIdx < currentPivotConfig.rowFields.length) {
            var fieldName = currentPivotConfig.rowFields[colIdx];
            currentPivotConfig.moveField(fieldName, 'rowFields', 'columnFields');
            reExecuteWithCurrentConfig();
        }
    }

    function dynMoveToFilter() {
        if (!currentPivotConfig || !currentCellInfo) return;
        var colIdx = currentCellInfo.col;
        if (colIdx < currentPivotConfig.rowFields.length) {
            var fieldName = currentPivotConfig.rowFields[colIdx];
            currentPivotConfig.moveField(fieldName, 'rowFields', 'filterFields');
            reExecuteWithCurrentConfig();
        }
    }

    function dynRemoveField() {
        if (!currentPivotConfig || !currentCellInfo) return;
        var colIdx = currentCellInfo.col;
        if (colIdx < currentPivotConfig.rowFields.length) {
            var fieldName = currentPivotConfig.rowFields[colIdx];
            currentPivotConfig.removeField(fieldName);
            reExecuteWithCurrentConfig();
        }
    }

    function dynFilterByValue() {
        if (!currentPivotConfig || !currentCellInfo) return;
        var colIdx = currentCellInfo.col;
        if (colIdx < currentPivotConfig.rowFields.length) {
            var fieldName = currentPivotConfig.rowFields[colIdx];
            var value = currentCellInfo.value;
            if (value) {
                var current = currentPivotConfig.filters[fieldName] || [];
                if (current.indexOf(value) === -1) {
                    current.push(value);
                }
                currentPivotConfig.setFilters(fieldName, current);
                reExecuteWithCurrentConfig();
            }
        }
    }

    function reExecuteWithCurrentConfig(onDone) {
        if (!currentPivotConfig || !currentPivotConfig.source) { if (onDone) onDone(); return; }

        var ds = dsManager.getActive();
        if (!ds) { if (onDone) onDone(); return; }

        ds.getMetadata(currentPivotConfig.source).then(function(meta) {
            var params = currentPivotConfig.getQueryParams(meta);
            return ds.executeQuery(params).then(function(result) {
                var cb = function(res) {
                    if (filtersPanel) {
                        filtersPanel.command('onConfigLoaded', currentPivotConfig.toJSON());
                    }
                    if (onDone) onDone();
                };

                if (currentPivotConfig.isCrossTab()) {
                    var crossTab = currentPivotConfig.buildCrossTab(meta, result.data);
                    SheetWriter.insertCrossTab(crossTab, {
                        pivotConfig: currentPivotConfig.toJSON(),
                        callback: cb
                    });
                } else if (currentPivotConfig.hasHierarchies(meta)) {
                    var hierData = currentPivotConfig.buildHierarchicalData(meta, result.data);
                    var columnFormats = currentPivotConfig.getColumnFormats(meta, true);
                    SheetWriter.insert(hierData.rows, {
                        columns: hierData.columns,
                        columnFormats: columnFormats,
                        drillInfo: hierData.drillInfo,
                        pivotConfig: currentPivotConfig.toJSON(),
                        callback: cb
                    });
                } else {
                    var columns = currentPivotConfig.getColumnOrder(meta);
                    var columnFormats = currentPivotConfig.getColumnFormats(meta);
                    SheetWriter.insert(result.data, {
                        columns: columns,
                        columnFormats: columnFormats,
                        pivotConfig: currentPivotConfig.toJSON(),
                        callback: cb
                    });
                }
            });
        }).catch(function(e) {
            console.error('[' + PLUGIN_NAME + '] reExecute error:', e);
        });
    }

    // =====================================================================
    // WINDOWS & PANELS
    // =====================================================================

    function openImportWindow() {
        if (!window.Asc.PluginWindow) return;
        closeWindow(importWindow);

        importWindow = new window.Asc.PluginWindow();

        importWindow.attachEvent('onInsertData', function(data) {
            if (!data) return;
            if (data.pivotConfig) {
                currentPivotConfig = PivotConfig.fromJSON(data.pivotConfig);
            }

            var afterInsert = function(result) {
                if (importWindow) importWindow.command('onInsertComplete', result);
                if (!filtersPanel && currentPivotConfig) {
                    setTimeout(openFiltersPanel, 300);
                }
            };

            if (data.crossTab) {
                SheetWriter.insertCrossTab(data.crossTab, {
                    pivotConfig: data.pivotConfig || null,
                    callback: afterInsert
                });
            } else if (data.rows) {
                SheetWriter.insert(data.rows, {
                    columns: data.columns || null,
                    columnFormats: data.columnFormats || null,
                    drillInfo: data.drillInfo || null,
                    pivotConfig: data.pivotConfig || null,
                    callback: afterInsert
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
            if (!data) return;
            if (data.pivotConfig) {
                currentPivotConfig = PivotConfig.fromJSON(data.pivotConfig);
            }
            if (data.crossTab) {
                SheetWriter.insertCrossTab(data.crossTab, {
                    pivotConfig: data.pivotConfig || null
                });
            } else if (data.rows) {
                SheetWriter.insert(data.rows, {
                    columns: data.columns || null,
                    columnFormats: data.columnFormats || null,
                    drillInfo: data.drillInfo || null,
                    pivotConfig: data.pivotConfig || null
                });
            }
        });

        // Receive pivot config changes (for persistence, even without auto-execute)
        filtersPanel.attachEvent('onPivotChange', function(configJSON) {
            currentPivotConfig = PivotConfig.fromJSON(configJSON);
        });

        filtersPanel.attachEvent('onDockedChanged', function(newType) {
            try { localStorage.setItem('da_filters_placement', newType); } catch(e) {}
            window.Asc.plugin.executeMethod('OnWindowDockChangedCallback', [filtersPanel.id]);
        });

        filtersPanel.attachEvent('onClose', function() { filtersPanel = null; });

        filtersPanel.show({
            url: 'filters.html',
            description: 'Panel de Análisis',
            isVisual: true,
            buttons: [],
            isModal: false,
            isCanDocked: true,
            type: savedType,
            EditorsSupport: ['cell'],
            size: [350, 550]
        });

        // Send current config after a short delay to let the panel init
        if (currentPivotConfig) {
            setTimeout(function() {
                if (filtersPanel) {
                    filtersPanel.command('onConfigLoaded', currentPivotConfig.toJSON());
                }
            }, 600);
        }
    }

    // =====================================================================
    // ACTIONS
    // =====================================================================

    function refreshCurrentQuery() {
        if (currentPivotConfig) {
            reExecuteWithCurrentConfig();
        } else {
            window.Asc.plugin.callCommand(function() {
                var oSheet = Api.GetActiveSheet();
                var oCell = oSheet.GetActiveCell();
                oCell.SetValue('Actualizado: ' + new Date().toLocaleTimeString());
            }, true, true);
        }
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
                    window.Asc.plugin.onContextMenuClick(msg.eventData);
                }
            }
        } catch(e) {}
    });

})(window);
