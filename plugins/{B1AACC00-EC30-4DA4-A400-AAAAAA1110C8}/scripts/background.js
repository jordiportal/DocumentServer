/**
 * Data Analyzer — Background Service v3.0
 *
 * Registers the "Análisis" ribbon tab, dynamic context menu,
 * manages import / analysis panel / settings windows,
 * coordinates PivotConfig state with multi-report support per sheet.
 */

(function(window, undefined) {
    'use strict';

    var VERSION = '3.0.0';
    var PLUGIN_NAME = 'DataAnalyzer';

    var dsManager        = null;
    var importWindow      = null;
    var settingsWindow    = null;
    var filtersPanel      = null;
    var isInitialized     = false;

    // Multi-report state
    var currentReports     = [];   // Array of report slots for current sheet
    var currentReportId    = null; // Active report id
    var currentPivotConfig = null;
    var currentCellInfo    = null; // { row, col, value, sheetName }

    // =====================================================================
    // MULTI-REPORT HELPERS
    // =====================================================================

    function generateReportId() {
        return 'r' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    }

    function findReportAtCell(row, col, reports) {
        if (!reports || !reports.length) return null;
        for (var i = 0; i < reports.length; i++) {
            var r = reports[i];
            if (row >= r.startRow && row < r.startRow + r.rows &&
                col >= r.startCol && col < r.startCol + r.cols) {
                return r;
            }
        }
        return null;
    }

    function getActiveReport() {
        if (!currentReportId || !currentReports.length) return null;
        for (var i = 0; i < currentReports.length; i++) {
            if (currentReports[i].id === currentReportId) return currentReports[i];
        }
        return null;
    }

    function parseMeta(metaJSON) {
        if (!metaJSON) return [];
        try {
            var parsed = JSON.parse(metaJSON);
            if (parsed.reports && Array.isArray(parsed.reports)) {
                return parsed.reports;
            }
            // Legacy migration
            if (parsed.rows) {
                return [{
                    id: 'legacy',
                    startRow: 0,
                    startCol: 0,
                    rows: parsed.rows,
                    cols: parsed.cols,
                    pivotConfig: parsed.pivotConfig || '',
                    drillInfo: parsed.drillInfo || []
                }];
            }
        } catch(e) {}
        return [];
    }

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
        attachEvent('onTargetPositionChanged');
        attachEvent('onChangeCurrentSheet');
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
        // Register via attachEditorEvent (some SDK versions)
        try {
            if (window.Asc.plugin.attachEditorEvent) {
                window.Asc.plugin.attachEditorEvent('onTargetPositionChanged', function() {
                    readCurrentCell();
                });
                window.Asc.plugin.attachEditorEvent('onChangeCurrentSheet', function() {
                    restoreConfigForCurrentSheet();
                });
                window.Asc.plugin.attachEditorEvent('onContextMenuShow', function(options) {
                    buildDynamicContextMenu(options);
                });
            }
        } catch(e) {}

        // Register via executeMethod (alternative approach)
        try {
            window.Asc.plugin.executeMethod('AttachEvent', ['onTargetPositionChanged']);
            window.Asc.plugin.executeMethod('AttachEvent', ['onChangeCurrentSheet']);
            window.Asc.plugin.executeMethod('AttachEvent', ['onContextMenuShow']);
        } catch(e) {}
    }

    var lastDrillCell = null;
    var drillInProgress = false;

    function readCurrentCell() {
        if (drillInProgress) return;
        window.Asc.plugin.callCommand(function() {
            var sheet = Api.GetActiveSheet();
            var cell = sheet.GetActiveCell();
            var sheetName = sheet.GetName();
            var props = Api.GetCustomProperties();
            var metaJSON = props.Get('_DA_' + sheetName) || '';
            return JSON.stringify({
                row: cell.GetRow(),
                col: cell.GetCol(),
                value: cell.GetValue(),
                sheetName: sheetName,
                metaJSON: metaJSON
            });
        }, false, false, function(resultStr) {
            if (!resultStr) return;
            var result;
            try { result = JSON.parse(resultStr); } catch(e) { return; }
            currentCellInfo = result;

            // Refresh reports from stored document meta
            if (result.metaJSON) {
                currentReports = parseMeta(result.metaJSON);
            }

            // Detect active report based on cursor position (1-based from API → 0-based)
            var cellRow0 = result.row - 1;
            var cellCol0 = result.col - 1;
            var report = findReportAtCell(cellRow0, cellCol0, currentReports);
            if (report && report.id !== currentReportId) {
                currentReportId = report.id;
                var cfg = report.pivotConfig;
                if (cfg) {
                    currentPivotConfig = PivotConfig.fromJSON(cfg);
                    if (filtersPanel) {
                        filtersPanel.command('onConfigLoaded', currentPivotConfig.toJSON());
                    }
                }
            }
            checkDrillAction(result);
        });
    }

    // =====================================================================
    // DRILL-DOWN (with report offset)
    // =====================================================================

    function checkDrillAction(cellInfo) {
        if (!currentPivotConfig || !cellInfo) return;

        var val = cellInfo.value;
        if (!val) return;

        var trimmed = val.replace(/^\s+/, '');
        var firstChar = trimmed.charAt(0);
        if (firstChar !== '\u25B6' && firstChar !== '\u25BC') return;

        var cellKey = cellInfo.row + ':' + cellInfo.col;
        if (lastDrillCell === cellKey) return;
        lastDrillCell = cellKey;
        setTimeout(function() { lastDrillCell = null; }, 3000);

        // Find the report this cell belongs to
        var cellRow0 = cellInfo.row - 1;
        var cellCol0 = cellInfo.col - 1;
        var report = findReportAtCell(cellRow0, cellCol0, currentReports);
        if (!report || !report.drillInfo) return;

        // Calculate relative row index within the report (subtract header row and startRow)
        var relRow = cellRow0 - report.startRow - 1; // -1 for header
        if (relRow < 0 || relRow >= report.drillInfo.length) return;

        var drillItem = report.drillInfo[relRow];
        if (!drillItem || !drillItem.hasChildren) return;

        executeDrill(drillItem.hierName, drillItem.nodePath);
    }

    function executeDrill(hierName, nodePath) {
        if (!currentPivotConfig) return;
        drillInProgress = true;
        currentPivotConfig.toggleNode(hierName, nodePath);
        reExecuteWithCurrentConfig(function() {
            drillInProgress = false;
        });
    }

    // =====================================================================
    // DYNAMIC CONTEXT MENU
    // =====================================================================

    function buildDynamicContextMenu(options) {
        var items = [];

        if (currentPivotConfig && currentCellInfo) {
            var rowDims = currentPivotConfig.rowFields || [];
            var numRowDims = rowDims.length;
            var report = getActiveReport();
            var relCol = report ? (currentCellInfo.col - 1 - report.startCol) : (currentCellInfo.col - 1);
            var relRow = report ? (currentCellInfo.row - 1 - report.startRow) : (currentCellInfo.row - 1);

            if (relRow === 0 && relCol >= 0 && relCol < numRowDims) {
                items.push({ id: 'da-dyn-move-cols', text: 'Mover a Columnas' });
                items.push({ id: 'da-dyn-move-filter', text: 'Mover a Filtros' });
                items.push({ id: 'da-dyn-remove-field', text: 'Quitar campo' });
            } else if (relRow > 0 && relCol >= 0 && relCol < numRowDims) {
                var v = currentCellInfo.value;
                if (v) {
                    items.push({
                        id: 'da-dyn-filter-value',
                        text: 'Filtrar por: ' + (v.length > 20 ? v.substring(0, 20) + '...' : v)
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
            var cell = sheet.GetActiveCell();
            var props = Api.GetCustomProperties();
            var json = props.Get('_DA_' + sheetName) || '';
            return JSON.stringify({
                metaJSON: json,
                row: cell.GetRow(),
                col: cell.GetCol()
            });
        }, false, false, function(resultStr) {
            if (!resultStr) { currentReports = []; currentReportId = null; currentPivotConfig = null; return; }
            var data;
            try { data = JSON.parse(resultStr); } catch(e) { currentReports = []; currentReportId = null; currentPivotConfig = null; return; }

            if (data.metaJSON) {
                var reports = parseMeta(data.metaJSON);
                currentReports = reports;
                if (reports.length > 0) {
                    var cellRow0 = data.row - 1;
                    var cellCol0 = data.col - 1;
                    var activeSlot = findReportAtCell(cellRow0, cellCol0, reports) || reports[0];
                    currentReportId = activeSlot.id;
                    currentPivotConfig = PivotConfig.fromJSON(activeSlot.pivotConfig);
                    console.log('[' + PLUGIN_NAME + '] Config restored (report: ' + currentReportId + ', total: ' + reports.length + ')');
                    if (filtersPanel && currentPivotConfig) {
                        filtersPanel.command('onConfigLoaded', currentPivotConfig.toJSON());
                    }
                } else {
                    currentReportId = null;
                    currentPivotConfig = null;
                }
            } else {
                currentReports = [];
                currentReportId = null;
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
        var report = getActiveReport();
        var relCol = report ? (currentCellInfo.col - 1 - report.startCol) : (currentCellInfo.col - 1);
        if (relCol >= 0 && relCol < currentPivotConfig.rowFields.length) {
            var fieldName = currentPivotConfig.rowFields[relCol];
            currentPivotConfig.moveField(fieldName, 'rowFields', 'columnFields');
            reExecuteWithCurrentConfig();
        }
    }

    function dynMoveToFilter() {
        if (!currentPivotConfig || !currentCellInfo) return;
        var report = getActiveReport();
        var relCol = report ? (currentCellInfo.col - 1 - report.startCol) : (currentCellInfo.col - 1);
        if (relCol >= 0 && relCol < currentPivotConfig.rowFields.length) {
            var fieldName = currentPivotConfig.rowFields[relCol];
            currentPivotConfig.moveField(fieldName, 'rowFields', 'filterFields');
            reExecuteWithCurrentConfig();
        }
    }

    function dynRemoveField() {
        if (!currentPivotConfig || !currentCellInfo) return;
        var report = getActiveReport();
        var relCol = report ? (currentCellInfo.col - 1 - report.startCol) : (currentCellInfo.col - 1);
        if (relCol >= 0 && relCol < currentPivotConfig.rowFields.length) {
            var fieldName = currentPivotConfig.rowFields[relCol];
            currentPivotConfig.removeField(fieldName);
            reExecuteWithCurrentConfig();
        }
    }

    function dynFilterByValue() {
        if (!currentPivotConfig || !currentCellInfo) return;
        var report = getActiveReport();
        var relCol = report ? (currentCellInfo.col - 1 - report.startCol) : (currentCellInfo.col - 1);
        if (relCol >= 0 && relCol < currentPivotConfig.rowFields.length) {
            var fieldName = currentPivotConfig.rowFields[relCol];
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

    // =====================================================================
    // RE-EXECUTE (uses active report's offset)
    // =====================================================================

    function reExecuteWithCurrentConfig(onDone) {
        if (!currentPivotConfig || !currentPivotConfig.source) { if (onDone) onDone(); return; }

        var ds = dsManager.getActive();
        if (!ds) { if (onDone) onDone(); return; }

        var report = getActiveReport();
        var sRow = report ? report.startRow : 0;
        var sCol = report ? report.startCol : 0;
        var rId = currentReportId || generateReportId();
        var clearArea = report ? { startRow: report.startRow, startCol: report.startCol, rows: report.rows, cols: report.cols } : null;

        ds.getMetadata(currentPivotConfig.source).then(function(meta) {
            var params = currentPivotConfig.getQueryParams(meta);
            return ds.executeQuery(params).then(function(result) {
                var cb = function(res) {
                    // Update local reports array with new dimensions
                    if (res && res.reportId) {
                        var updated = false;
                        for (var i = 0; i < currentReports.length; i++) {
                            if (currentReports[i].id === res.reportId) {
                                currentReports[i].rows = res.numRows;
                                currentReports[i].cols = res.numCols;
                                updated = true;
                                break;
                            }
                        }
                    }
                    if (filtersPanel) {
                        filtersPanel.command('onConfigLoaded', currentPivotConfig.toJSON());
                    }
                    if (onDone) onDone();
                };

                var baseOpts = {
                    pivotConfig: currentPivotConfig.toJSON(),
                    startRow: sRow,
                    startCol: sCol,
                    reportId: rId,
                    clearArea: clearArea,
                    callback: cb
                };

                if (currentPivotConfig.isCrossTab()) {
                    var crossTab = currentPivotConfig.buildCrossTab(meta, result.data);
                    SheetWriter.insertCrossTab(crossTab, baseOpts);
                } else if (currentPivotConfig.hasHierarchies(meta)) {
                    var hierData = currentPivotConfig.buildHierarchicalData(meta, result.data);
                    var columnFormats = currentPivotConfig.getColumnFormats(meta, true);
                    baseOpts.columns = hierData.columns;
                    baseOpts.columnFormats = columnFormats;
                    baseOpts.drillInfo = hierData.drillInfo;
                    SheetWriter.insert(hierData.rows, baseOpts);
                } else {
                    var columns = currentPivotConfig.getColumnOrder(meta);
                    var columnFormats = currentPivotConfig.getColumnFormats(meta);
                    var totalData = currentPivotConfig.addTotalsToFlatData(meta, result.data, columns);
                    baseOpts.columns = columns;
                    baseOpts.columnFormats = columnFormats;
                    baseOpts.drillInfo = totalData.drillInfo;
                    SheetWriter.insert(totalData.rows, baseOpts);
                }
            });
        }).catch(function(e) {
            console.error('[' + PLUGIN_NAME + '] reExecute error:', e);
            if (onDone) onDone();
        });
    }

    // =====================================================================
    // INSERTION FLOW — determine startRow/startCol and handle overlap
    // =====================================================================

    function getInsertPosition(callback) {
        window.Asc.plugin.callCommand(function() {
            var sheet = Api.GetActiveSheet();
            var cell = sheet.GetActiveCell();
            return { row: cell.GetRow() - 1, col: cell.GetCol() - 1 };
        }, false, false, function(pos) {
            callback(pos || { row: 0, col: 0 });
        });
    }

    function performInsert(data, startRow, startCol, reportId, clearArea) {
        if (data.pivotConfig) {
            currentPivotConfig = PivotConfig.fromJSON(data.pivotConfig);
        }
        currentReportId = reportId;

        var baseOpts = {
            pivotConfig: data.pivotConfig || null,
            startRow: startRow,
            startCol: startCol,
            reportId: reportId,
            clearArea: clearArea,
            callback: function(result) {
                if (result && result.reportId) {
                    // Refresh local reports
                    restoreConfigForCurrentSheet();
                }
                if (importWindow) importWindow.command('onInsertComplete', result);
                if (!filtersPanel && currentPivotConfig) {
                    setTimeout(openFiltersPanel, 300);
                }
            }
        };

        if (data.crossTab) {
            SheetWriter.insertCrossTab(data.crossTab, baseOpts);
        } else if (data.rows) {
            baseOpts.columns = data.columns || null;
            baseOpts.columnFormats = data.columnFormats || null;
            baseOpts.drillInfo = data.drillInfo || null;
            SheetWriter.insert(data.rows, baseOpts);
        }
    }

    function handleInsertData(data, source) {
        if (!data) return;

        getInsertPosition(function(pos) {
            var overlap = findReportAtCell(pos.row, pos.col, currentReports);

            if (overlap) {
                // Ask user via the panel/window
                if (filtersPanel) {
                    filtersPanel.command('onOverlapConfirm', {
                        reportId: overlap.id,
                        startRow: pos.row,
                        startCol: pos.col
                    });
                    // Store pending insert data
                    pendingInsertData = data;
                    pendingInsertSource = source;
                    pendingOverlap = overlap;
                    pendingPos = pos;
                } else {
                    // No panel open — replace by default
                    var clearArea = { startRow: overlap.startRow, startCol: overlap.startCol, rows: overlap.rows, cols: overlap.cols };
                    performInsert(data, overlap.startRow, overlap.startCol, overlap.id, clearArea);
                }
            } else {
                var newId = generateReportId();
                performInsert(data, pos.row, pos.col, newId, null);
            }
        });
    }

    // Pending state for overlap confirmation
    var pendingInsertData = null;
    var pendingInsertSource = null;
    var pendingOverlap = null;
    var pendingPos = null;

    function handleOverlapResponse(response) {
        if (!pendingInsertData) return;
        var data = pendingInsertData;
        var overlap = pendingOverlap;
        var pos = pendingPos;
        pendingInsertData = null;
        pendingInsertSource = null;
        pendingOverlap = null;
        pendingPos = null;

        if (response === 'replace') {
            var clearArea = { startRow: overlap.startRow, startCol: overlap.startCol, rows: overlap.rows, cols: overlap.cols };
            performInsert(data, overlap.startRow, overlap.startCol, overlap.id, clearArea);
        } else {
            // 'new' — insert at cursor position as new report
            var newId = generateReportId();
            performInsert(data, pos.row, pos.col, newId, null);
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
            handleInsertData(data, 'import');
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
            handleInsertData(data, 'panel');
        });

        filtersPanel.attachEvent('onPivotChange', function(configJSON) {
            currentPivotConfig = PivotConfig.fromJSON(configJSON);
        });

        filtersPanel.attachEvent('onOverlapResponse', function(response) {
            handleOverlapResponse(response);
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

    // Editor event handlers (delivered via events array in config.json)
    window.Asc.plugin.onTargetPositionChanged = function() {
        readCurrentCell();
    };

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
                else if (msg.eventName === 'onTargetPositionChanged') {
                    readCurrentCell();
                }
                else if (msg.eventName === 'onChangeCurrentSheet') {
                    restoreConfigForCurrentSheet();
                }
            }
        } catch(e) {}
    });

})(window);
