var SpreadsheetHandlers = (function () {
    "use strict";

    function safeStr(v) {
        if (v === null || v === undefined) return "";
        if (typeof v === "object") return JSON.stringify(v);
        return String(v);
    }

    function safeCallCommand(fn, isWrite) {
        return new Promise(function (resolve) {
            var timeout = setTimeout(function () {
                resolve({ error: "callCommand timeout (15s)" });
            }, 15000);

            try {
                window.Asc.plugin.callCommand(
                    fn,
                    isWrite ? false : false,
                    isWrite ? true : false,
                    function (result) {
                        clearTimeout(timeout);
                        resolve(result || { error: "empty result" });
                    }
                );
            } catch (e) {
                clearTimeout(timeout);
                resolve({ error: "callCommand exception: " + (e.message || String(e)) });
            }
        });
    }

    function getContext(params) {
        var sampleRows = (params && params.sampleRows) || 5;
        window.Asc.scope._sampleRows = sampleRows;

        return safeCallCommand(function () {
            try {
                var sheet = Api.GetActiveSheet();
                var sheetName = sheet.GetName();
                var usedRange = sheet.GetUsedRange();
                var rowCount = usedRange.GetRowsCount();
                var colCount = usedRange.GetColumnsCount();
                var sampleN = Asc.scope._sampleRows;

                var headers = [];
                for (var c = 0; c < colCount; c++) {
                    var val = usedRange.GetCells(0, c).GetValue();
                    headers.push(val != null ? String(val) : "");
                }

                var topRows = [];
                var endIdx = Math.min(sampleN + 1, rowCount);
                for (var r = 1; r < endIdx; r++) {
                    var row = [];
                    for (var cc = 0; cc < colCount; cc++) {
                        var v = usedRange.GetCells(r, cc).GetValue();
                        row.push(v != null ? String(v) : "");
                    }
                    topRows.push(row);
                }

                var bottomRows = [];
                if (rowCount > sampleN + 1) {
                    var startBottom = Math.max(rowCount - sampleN, sampleN + 1);
                    for (var rb = startBottom; rb < rowCount; rb++) {
                        var brow = [];
                        for (var cb = 0; cb < colCount; cb++) {
                            var vb = usedRange.GetCells(rb, cb).GetValue();
                            brow.push(vb != null ? String(vb) : "");
                        }
                        bottomRows.push(brow);
                    }
                }

                return {
                    sheetName: sheetName,
                    totalRows: rowCount,
                    totalColumns: colCount,
                    headers: headers,
                    topRows: topRows,
                    bottomRows: bottomRows
                };
            } catch (e) {
                return { error: "getContext: " + e.message };
            }
        }, false);
    }

    function readRange(params) {
        window.Asc.scope._range = params.range;
        window.Asc.scope._sheet = params.sheet || null;

        return safeCallCommand(function () {
            try {
                var sheet = Asc.scope._sheet
                    ? Api.GetSheet(Asc.scope._sheet)
                    : Api.GetActiveSheet();
                if (!sheet) return { error: "Sheet not found: " + Asc.scope._sheet };
                var range = sheet.GetRange(Asc.scope._range);
                if (!range) return { error: "Invalid range: " + Asc.scope._range };
                var values = range.GetValue();
                return { range: Asc.scope._range, sheetName: sheet.GetName(), values: values };
            } catch (e) {
                return { error: "readRange: " + e.message };
            }
        }, false);
    }

    function readSelection() {
        return safeCallCommand(function () {
            try {
                var sheet = Api.GetActiveSheet();
                var sel = sheet.GetSelection();
                var values = sel.GetValue();
                var addr = sel.GetAddress(false, false, "xlA1", false);
                return { address: addr, sheetName: sheet.GetName(), values: values };
            } catch (e) {
                return { error: "readSelection: " + e.message };
            }
        }, false);
    }

    function writeValues(params) {
        if (!params.startCell) return Promise.resolve({ error: "missing startCell parameter" });
        if (!params.values || !Array.isArray(params.values)) return Promise.resolve({ error: "missing or invalid values parameter" });

        window.Asc.scope._startCell = params.startCell;
        window.Asc.scope._sheet = params.sheet || null;

        var safeValues = [];
        for (var i = 0; i < params.values.length; i++) {
            var row = params.values[i];
            if (!Array.isArray(row)) {
                safeValues.push([safeStr(row)]);
            } else {
                var safeRow = [];
                for (var j = 0; j < row.length; j++) {
                    safeRow.push(safeStr(row[j]));
                }
                safeValues.push(safeRow);
            }
        }
        window.Asc.scope._values = safeValues;

        return safeCallCommand(function () {
            try {
                var sheet = Asc.scope._sheet
                    ? Api.GetSheet(Asc.scope._sheet)
                    : Api.GetActiveSheet();
                if (!sheet) return { error: "Sheet not found" };

                var startCell = sheet.GetRange(Asc.scope._startCell);
                if (!startCell) return { error: "Invalid startCell: " + Asc.scope._startCell };

                var startRow = startCell.GetRow() - 1;
                var startCol = startCell.GetCol() - 1;
                if (startRow < 0) startRow = 0;
                if (startCol < 0) startCol = 0;

                var data = Asc.scope._values;
                var written = 0;

                for (var r = 0; r < data.length; r++) {
                    for (var c = 0; c < data[r].length; c++) {
                        var cell = sheet.GetRangeByNumber(startRow + r, startCol + c);
                        if (cell) {
                            cell.SetValue(String(data[r][c]));
                            written++;
                        }
                    }
                }
                return { written: written, startCell: Asc.scope._startCell };
            } catch (e) {
                return { error: "writeValues: " + e.message };
            }
        }, true);
    }

    function insertFormula(params) {
        if (!params.cell || !params.formula) return Promise.resolve({ error: "missing cell or formula" });

        window.Asc.scope._cell = params.cell;
        window.Asc.scope._formula = params.formula;
        window.Asc.scope._sheet = params.sheet || null;

        return safeCallCommand(function () {
            try {
                var sheet = Asc.scope._sheet
                    ? Api.GetSheet(Asc.scope._sheet)
                    : Api.GetActiveSheet();
                if (!sheet) return { error: "Sheet not found" };
                var cell = sheet.GetRange(Asc.scope._cell);
                if (!cell) return { error: "Invalid cell: " + Asc.scope._cell };
                cell.SetValue(Asc.scope._formula);
                return { cell: Asc.scope._cell, formula: Asc.scope._formula };
            } catch (e) {
                return { error: "insertFormula: " + e.message };
            }
        }, true);
    }

    function getFormulas(params) {
        if (!params.range) return Promise.resolve({ error: "missing range" });

        window.Asc.scope._range = params.range;
        window.Asc.scope._sheet = params.sheet || null;

        return safeCallCommand(function () {
            try {
                var sheet = Asc.scope._sheet
                    ? Api.GetSheet(Asc.scope._sheet)
                    : Api.GetActiveSheet();
                if (!sheet) return { error: "Sheet not found" };
                var range = sheet.GetRange(Asc.scope._range);
                if (!range) return { error: "Invalid range" };
                var rowCount = range.GetRowsCount();
                var colCount = range.GetColumnsCount();
                var formulas = [];

                for (var r = 0; r < rowCount; r++) {
                    var row = [];
                    for (var c = 0; c < colCount; c++) {
                        var cell = range.GetCells(r, c);
                        var formula = cell.GetFormula();
                        row.push(formula || cell.GetValue() || "");
                    }
                    formulas.push(row);
                }
                return { range: Asc.scope._range, formulas: formulas };
            } catch (e) {
                return { error: "getFormulas: " + e.message };
            }
        }, false);
    }

    function insertChart(params) {
        if (!params.dataRange) return Promise.resolve({ error: "missing dataRange" });

        window.Asc.scope._dataRange = params.dataRange;
        window.Asc.scope._chartType = params.chartType || "bar";
        window.Asc.scope._title = params.title || "";

        return safeCallCommand(function () {
            try {
                var sheet = Api.GetActiveSheet();
                var typeMap = {
                    "bar": "bar", "line": "lineNormal", "pie": "pie",
                    "scatter": "scatter", "area": "areaNormal"
                };
                var cType = typeMap[Asc.scope._chartType] || "bar";
                var chart = sheet.AddChart(
                    "'" + sheet.GetName() + "'!" + Asc.scope._dataRange,
                    true, cType, 2, 240 * 36000, 150 * 36000, 0, 0, 7, 0
                );
                if (chart && Asc.scope._title) {
                    chart.SetTitle(Asc.scope._title);
                }
                return { inserted: true, dataRange: Asc.scope._dataRange, chartType: Asc.scope._chartType };
            } catch (e) {
                return { error: "insertChart: " + e.message };
            }
        }, true);
    }

    function formatRange(params) {
        if (!params.range) return Promise.resolve({ error: "missing range" });

        window.Asc.scope._fmtParams = JSON.parse(JSON.stringify(params));

        return safeCallCommand(function () {
            try {
                var p = Asc.scope._fmtParams;
                var sheet = Api.GetActiveSheet();
                var range = sheet.GetRange(p.range);
                if (!range) return { error: "Invalid range: " + p.range };

                if (p.bold !== undefined) range.SetBold(p.bold);
                if (p.italic !== undefined) range.SetItalic(p.italic);
                if (p.fontSize) range.SetFontSize(p.fontSize);
                if (p.fontColor) {
                    var fc = Api.CreateColorFromRGB(
                        parseInt(p.fontColor.substr(1, 2), 16),
                        parseInt(p.fontColor.substr(3, 2), 16),
                        parseInt(p.fontColor.substr(5, 2), 16)
                    );
                    range.SetFontColor(fc);
                }
                if (p.fillColor) {
                    var bg = Api.CreateColorFromRGB(
                        parseInt(p.fillColor.substr(1, 2), 16),
                        parseInt(p.fillColor.substr(3, 2), 16),
                        parseInt(p.fillColor.substr(5, 2), 16)
                    );
                    range.SetFillColor(bg);
                }
                if (p.numberFormat) range.SetNumberFormat(p.numberFormat);
                if (p.horizontalAlign) range.SetAlignHorizontal(p.horizontalAlign);

                return { formatted: true, range: p.range };
            } catch (e) {
                return { error: "formatRange: " + e.message };
            }
        }, true);
    }

    function listSheets() {
        return safeCallCommand(function () {
            try {
                var sheets = Api.GetSheets();
                var result = [];
                var activeSheet = Api.GetActiveSheet();
                var activeName = activeSheet ? activeSheet.GetName() : "";

                for (var i = 0; i < sheets.length; i++) {
                    var s = sheets[i];
                    var name = s.GetName();
                    var visible = s.GetVisible !== undefined ? s.GetVisible() : true;
                    result.push({
                        index: i,
                        name: name,
                        isActive: name === activeName,
                        visible: visible
                    });
                }
                return { sheets: result, count: result.length };
            } catch (e) {
                return { error: "listSheets: " + e.message };
            }
        }, false);
    }

    function addSheet(params) {
        if (!params.name) return Promise.resolve({ error: "missing name parameter" });

        window.Asc.scope._sheetName = String(params.name);
        window.Asc.scope._setActive = params.setActive !== false;

        return safeCallCommand(function () {
            try {
                var existingSheets = Api.GetSheets();
                for (var i = 0; i < existingSheets.length; i++) {
                    if (existingSheets[i].GetName() === Asc.scope._sheetName) {
                        return { error: "Sheet '" + Asc.scope._sheetName + "' already exists" };
                    }
                }

                Api.AddSheet(Asc.scope._sheetName);
                var newSheet = Api.GetSheet(Asc.scope._sheetName);
                if (!newSheet) {
                    return { error: "Failed to create sheet '" + Asc.scope._sheetName + "'" };
                }

                if (Asc.scope._setActive) {
                    newSheet.SetActive();
                }

                return {
                    created: true,
                    name: Asc.scope._sheetName,
                    totalSheets: Api.GetSheets().length
                };
            } catch (e) {
                return { error: "addSheet: " + e.message };
            }
        }, true);
    }

    function setActiveSheet(params) {
        if (!params.name) return Promise.resolve({ error: "missing name parameter" });

        window.Asc.scope._sheetName = String(params.name);

        return safeCallCommand(function () {
            try {
                var sheet = Api.GetSheet(Asc.scope._sheetName);
                if (!sheet) {
                    return { error: "Sheet '" + Asc.scope._sheetName + "' not found" };
                }
                sheet.SetActive();
                return { activated: true, name: Asc.scope._sheetName };
            } catch (e) {
                return { error: "setActiveSheet: " + e.message };
            }
        }, false);
    }

    function renameSheet(params) {
        if (!params.currentName || !params.newName) return Promise.resolve({ error: "missing currentName or newName" });

        window.Asc.scope._currentName = String(params.currentName);
        window.Asc.scope._newName = String(params.newName);

        return safeCallCommand(function () {
            try {
                var sheet = Api.GetSheet(Asc.scope._currentName);
                if (!sheet) {
                    return { error: "Sheet '" + Asc.scope._currentName + "' not found" };
                }
                sheet.SetName(Asc.scope._newName);
                return { renamed: true, from: Asc.scope._currentName, to: Asc.scope._newName };
            } catch (e) {
                return { error: "renameSheet: " + e.message };
            }
        }, true);
    }

    return {
        spreadsheet_get_context: getContext,
        spreadsheet_read_range: readRange,
        spreadsheet_read_selection: readSelection,
        spreadsheet_write_values: writeValues,
        spreadsheet_insert_formula: insertFormula,
        spreadsheet_get_formulas: getFormulas,
        spreadsheet_insert_chart: insertChart,
        spreadsheet_format_range: formatRange,
        spreadsheet_list_sheets: listSheets,
        spreadsheet_add_sheet: addSheet,
        spreadsheet_set_active_sheet: setActiveSheet,
        spreadsheet_rename_sheet: renameSheet
    };
})();
