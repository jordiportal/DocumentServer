var SpreadsheetHandlers = (function () {
    "use strict";

    function getContext(params) {
        return new Promise(function (resolve) {
            var sampleRows = (params && params.sampleRows) || 5;
            window.Asc.scope._sampleRows = sampleRows;

            window.Asc.plugin.callCommand(function () {
                var sheet = Api.GetActiveSheet();
                var sheetName = sheet.GetName();
                var usedRange = sheet.GetUsedRange();
                var rowCount = usedRange.GetRowsCount();
                var colCount = usedRange.GetColumnsCount();

                var sampleN = Asc.scope._sampleRows;
                var headers = [];
                for (var c = 0; c < colCount; c++) {
                    var val = usedRange.GetCells(0, c).GetValue();
                    headers.push(val !== null && val !== undefined ? String(val) : "");
                }

                var topRows = [];
                var endIdx = Math.min(sampleN + 1, rowCount);
                for (var r = 1; r < endIdx; r++) {
                    var row = [];
                    for (var cc = 0; cc < colCount; cc++) {
                        var v = usedRange.GetCells(r, cc).GetValue();
                        row.push(v !== null && v !== undefined ? String(v) : "");
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
                            brow.push(vb !== null && vb !== undefined ? String(vb) : "");
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
            }, false, false, function (result) {
                resolve(result);
            });
        });
    }

    function readRange(params) {
        return new Promise(function (resolve) {
            window.Asc.scope._range = params.range;
            window.Asc.scope._sheet = params.sheet || null;

            window.Asc.plugin.callCommand(function () {
                var sheet = Asc.scope._sheet
                    ? Api.GetSheet(Asc.scope._sheet)
                    : Api.GetActiveSheet();
                var range = sheet.GetRange(Asc.scope._range);
                var values = range.GetValue();
                return {
                    range: Asc.scope._range,
                    sheetName: sheet.GetName(),
                    values: values
                };
            }, false, false, function (result) {
                resolve(result);
            });
        });
    }

    function readSelection() {
        return new Promise(function (resolve) {
            window.Asc.plugin.callCommand(function () {
                var sheet = Api.GetActiveSheet();
                var sel = sheet.GetSelection();
                var values = sel.GetValue();
                var addr = sel.GetAddress(false, false, "xlA1", false);
                return {
                    address: addr,
                    sheetName: sheet.GetName(),
                    values: values
                };
            }, false, false, function (result) {
                resolve(result);
            });
        });
    }

    function writeValues(params) {
        return new Promise(function (resolve) {
            window.Asc.scope._startCell = params.startCell;
            window.Asc.scope._values = params.values;
            window.Asc.scope._sheet = params.sheet || null;

            window.Asc.plugin.callCommand(function () {
                var sheet = Asc.scope._sheet
                    ? Api.GetSheet(Asc.scope._sheet)
                    : Api.GetActiveSheet();
                var startCell = sheet.GetRange(Asc.scope._startCell);
                var startRow = startCell.GetRow() - 1;
                var startCol = startCell.GetCol() - 1;
                var data = Asc.scope._values;
                var written = 0;

                for (var r = 0; r < data.length; r++) {
                    for (var c = 0; c < data[r].length; c++) {
                        var cell = sheet.GetRangeByNumber(startRow + r, startCol + c);
                        cell.SetValue(data[r][c]);
                        written++;
                    }
                }
                return { written: written, startCell: Asc.scope._startCell };
            }, true, false, function (result) {
                resolve(result);
            });
        });
    }

    function insertFormula(params) {
        return new Promise(function (resolve) {
            window.Asc.scope._cell = params.cell;
            window.Asc.scope._formula = params.formula;
            window.Asc.scope._sheet = params.sheet || null;

            window.Asc.plugin.callCommand(function () {
                var sheet = Asc.scope._sheet
                    ? Api.GetSheet(Asc.scope._sheet)
                    : Api.GetActiveSheet();
                var cell = sheet.GetRange(Asc.scope._cell);
                cell.SetValue(Asc.scope._formula);
                return { cell: Asc.scope._cell, formula: Asc.scope._formula };
            }, true, false, function (result) {
                resolve(result);
            });
        });
    }

    function getFormulas(params) {
        return new Promise(function (resolve) {
            window.Asc.scope._range = params.range;
            window.Asc.scope._sheet = params.sheet || null;

            window.Asc.plugin.callCommand(function () {
                var sheet = Asc.scope._sheet
                    ? Api.GetSheet(Asc.scope._sheet)
                    : Api.GetActiveSheet();
                var range = sheet.GetRange(Asc.scope._range);
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
            }, false, false, function (result) {
                resolve(result);
            });
        });
    }

    function insertChart(params) {
        return new Promise(function (resolve) {
            window.Asc.scope._dataRange = params.dataRange;
            window.Asc.scope._chartType = params.chartType || "bar";
            window.Asc.scope._title = params.title || "";

            window.Asc.plugin.callCommand(function () {
                var sheet = Api.GetActiveSheet();
                var typeMap = {
                    "bar": "bar",
                    "line": "lineNormal",
                    "pie": "pie",
                    "scatter": "scatter",
                    "area": "areaNormal"
                };
                var cType = typeMap[Asc.scope._chartType] || "bar";
                var chart = sheet.AddChart("'" + sheet.GetName() + "'!" + Asc.scope._dataRange, true, cType, 2, 240 * 36000, 150 * 36000, 0, 0, 7, 0);
                if (chart && Asc.scope._title) {
                    chart.SetTitle(Asc.scope._title);
                }
                return { inserted: true, dataRange: Asc.scope._dataRange, chartType: Asc.scope._chartType };
            }, true, false, function (result) {
                resolve(result);
            });
        });
    }

    function formatRange(params) {
        return new Promise(function (resolve) {
            window.Asc.scope._fmtParams = JSON.parse(JSON.stringify(params));

            window.Asc.plugin.callCommand(function () {
                var p = Asc.scope._fmtParams;
                var sheet = Api.GetActiveSheet();
                var range = sheet.GetRange(p.range);

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
            }, true, false, function (result) {
                resolve(result);
            });
        });
    }

    return {
        spreadsheet_get_context: getContext,
        spreadsheet_read_range: readRange,
        spreadsheet_read_selection: readSelection,
        spreadsheet_write_values: writeValues,
        spreadsheet_insert_formula: insertFormula,
        spreadsheet_get_formulas: getFormulas,
        spreadsheet_insert_chart: insertChart,
        spreadsheet_format_range: formatRange
    };
})();
