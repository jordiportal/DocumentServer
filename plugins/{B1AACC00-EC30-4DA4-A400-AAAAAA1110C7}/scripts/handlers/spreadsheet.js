var SpreadsheetHandlers = (function () {
    "use strict";

    var CELL_ERROR_PATTERNS = ["#NAME?", "#REF!", "#VALUE!", "#DIV/0!", "#NULL!", "#N/A", "#NUM!", "#SPILL!"];

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

    function extractFormulaSheetRefs(formula) {
        if (!formula || formula.charAt(0) !== "=") return [];
        var refs = {};
        var m;
        var re1 = /'([^']+)'!/g;
        while ((m = re1.exec(formula)) !== null) refs[m[1]] = true;
        var re2 = /([A-Za-z_][A-Za-z0-9_]*)!/g;
        while ((m = re2.exec(formula)) !== null) refs[m[1]] = true;
        return Object.keys(refs);
    }

    function colToLetter(col) {
        var s = "";
        var c = col + 1;
        while (c > 0) {
            c--;
            s = String.fromCharCode(65 + (c % 26)) + s;
            c = Math.floor(c / 26);
        }
        return s;
    }

    function parseCellAddress(addr) {
        var match = addr.match(/^([A-Za-z]+)(\d+)$/);
        if (!match) return null;
        var letters = match[1].toUpperCase();
        var row = parseInt(match[2], 10) - 1;
        var col = 0;
        for (var i = 0; i < letters.length; i++) {
            col = col * 26 + (letters.charCodeAt(i) - 64);
        }
        return { row: row, col: col - 1 };
    }

    function postValidateCells(sheetName, cellAddresses) {
        if (!cellAddresses || cellAddresses.length === 0) return Promise.resolve({ errors: [] });

        window.Asc.scope._checkSheet = sheetName || null;
        window.Asc.scope._checkCells = cellAddresses;

        return safeCallCommand(function () {
            try {
                var sheet = Asc.scope._checkSheet
                    ? Api.GetSheet(Asc.scope._checkSheet)
                    : Api.GetActiveSheet();
                if (!sheet) return { errors: [] };

                var EP = ["#NAME?", "#REF!", "#VALUE!", "#DIV/0!", "#NULL!", "#N/A", "#NUM!", "#SPILL!"];
                var cells = Asc.scope._checkCells;
                var errors = [];

                for (var i = 0; i < cells.length; i++) {
                    var c = sheet.GetRange(cells[i]);
                    if (!c) continue;
                    var v = String(c.GetValue() || "");
                    for (var j = 0; j < EP.length; j++) {
                        if (v.indexOf(EP[j]) === 0) {
                            errors.push({ cell: cells[i], value: v });
                            break;
                        }
                    }
                }
                return { errors: errors };
            } catch (e) {
                return { errors: [] };
            }
        }, false);
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
        var allSheetRefs = {};
        var formulaCellAddrs = [];
        var startAddr = parseCellAddress(params.startCell);

        for (var i = 0; i < params.values.length; i++) {
            var row = params.values[i];
            if (!Array.isArray(row)) {
                var sv = safeStr(row);
                safeValues.push([sv]);
                if (sv.charAt(0) === "=" && startAddr) {
                    formulaCellAddrs.push(colToLetter(startAddr.col) + (startAddr.row + i + 1));
                    var r1 = extractFormulaSheetRefs(sv);
                    for (var x = 0; x < r1.length; x++) allSheetRefs[r1[x]] = true;
                }
            } else {
                var safeRow = [];
                for (var j = 0; j < row.length; j++) {
                    var cv = safeStr(row[j]);
                    safeRow.push(cv);
                    if (cv.charAt(0) === "=" && startAddr) {
                        formulaCellAddrs.push(colToLetter(startAddr.col + j) + (startAddr.row + i + 1));
                        var r2 = extractFormulaSheetRefs(cv);
                        for (var y = 0; y < r2.length; y++) allSheetRefs[r2[y]] = true;
                    }
                }
                safeValues.push(safeRow);
            }
        }

        window.Asc.scope._values = safeValues;
        window.Asc.scope._sheetRefs = Object.keys(allSheetRefs);

        return safeCallCommand(function () {
            try {
                var sheet = Asc.scope._sheet
                    ? Api.GetSheet(Asc.scope._sheet)
                    : Api.GetActiveSheet();
                if (!sheet) return { error: "Sheet not found" };

                var refs = Asc.scope._sheetRefs;
                if (refs && refs.length > 0) {
                    var allSheets = Api.GetSheets();
                    var available = [];
                    for (var si = 0; si < allSheets.length; si++) available.push(allSheets[si].GetName());

                    var missing = [];
                    for (var rj = 0; rj < refs.length; rj++) {
                        var found = false;
                        for (var rk = 0; rk < available.length; rk++) {
                            if (available[rk] === refs[rj]) { found = true; break; }
                        }
                        if (!found) missing.push(refs[rj]);
                    }

                    if (missing.length > 0) {
                        return {
                            error: "Values contain formulas referencing non-existent sheet(s): [" + missing.join(", ") + "]. Available sheets: [" + available.join(", ") + "]. Fix the sheet name(s) and retry.",
                            missingSheets: missing,
                            availableSheets: available
                        };
                    }
                }

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
        }, true).then(function (writeResult) {
            if (writeResult && writeResult.error) return writeResult;
            if (formulaCellAddrs.length === 0) return writeResult;

            return postValidateCells(params.sheet || null, formulaCellAddrs).then(function (check) {
                if (check.errors && check.errors.length > 0) {
                    writeResult.cellErrors = check.errors;
                    writeResult.warning = "Some formulas produced errors: " +
                        check.errors.map(function (e) { return e.cell + " → " + e.value; }).join(", ") +
                        ". Review and fix the formulas.";
                }
                return writeResult;
            });
        });
    }

    function insertFormula(params) {
        if (!params.cell || !params.formula) return Promise.resolve({ error: "missing cell or formula" });

        var formula = params.formula;
        var sheetRefs = extractFormulaSheetRefs(formula);

        window.Asc.scope._cell = params.cell;
        window.Asc.scope._formula = formula;
        window.Asc.scope._sheet = params.sheet || null;
        window.Asc.scope._sheetRefs = sheetRefs;

        return safeCallCommand(function () {
            try {
                var sheet = Asc.scope._sheet
                    ? Api.GetSheet(Asc.scope._sheet)
                    : Api.GetActiveSheet();
                if (!sheet) return { error: "Sheet not found" };

                var refs = Asc.scope._sheetRefs;
                if (refs && refs.length > 0) {
                    var allSheets = Api.GetSheets();
                    var available = [];
                    for (var i = 0; i < allSheets.length; i++) available.push(allSheets[i].GetName());

                    var missing = [];
                    for (var j = 0; j < refs.length; j++) {
                        var found = false;
                        for (var k = 0; k < available.length; k++) {
                            if (available[k] === refs[j]) { found = true; break; }
                        }
                        if (!found) missing.push(refs[j]);
                    }

                    if (missing.length > 0) {
                        return {
                            error: "Formula references non-existent sheet(s): [" + missing.join(", ") + "]. Available sheets: [" + available.join(", ") + "]. Fix the sheet name(s) and retry.",
                            missingSheets: missing,
                            availableSheets: available
                        };
                    }
                }

                var cell = sheet.GetRange(Asc.scope._cell);
                if (!cell) return { error: "Invalid cell: " + Asc.scope._cell };
                cell.SetValue(Asc.scope._formula);
                return { cell: Asc.scope._cell, formula: Asc.scope._formula };
            } catch (e) {
                return { error: "insertFormula: " + e.message };
            }
        }, true).then(function (writeResult) {
            if (writeResult && writeResult.error) return writeResult;

            return postValidateCells(params.sheet || null, [params.cell]).then(function (check) {
                if (check.errors && check.errors.length > 0) {
                    writeResult.cellErrors = check.errors;
                    writeResult.warning = "Formula produced error(s): " +
                        check.errors.map(function (e) { return e.cell + " → " + e.value; }).join(", ") +
                        ". Consider fixing the formula.";
                }
                return writeResult;
            });
        });
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

    function listCharts() {
        return safeCallCommand(function () {
            try {
                var sheet = Api.GetActiveSheet();
                var drawings = [];
                try { drawings = sheet.GetAllDrawings(); } catch (e) {}
                if (!drawings) drawings = [];
                return { count: drawings.length, sheetName: sheet.GetName() };
            } catch (e) {
                return { error: "listCharts: " + e.message };
            }
        }, false);
    }

    function insertChart(params) {
        if (!params.dataRange) return Promise.resolve({ error: "missing dataRange" });

        window.Asc.scope._dataRange = params.dataRange;
        window.Asc.scope._chartType = params.chartType || "bar";
        window.Asc.scope._title = params.title || "";
        window.Asc.scope._position = params.position || null;

        return safeCallCommand(function () {
            try {
                var sheet = Api.GetActiveSheet();
                var typeMap = {
                    "bar": "bar", "line": "lineNormal", "pie": "pie",
                    "scatter": "scatter", "area": "areaNormal"
                };
                var cType = typeMap[Asc.scope._chartType] || "bar";

                var anchorCol = 7;
                var anchorRow = 0;

                if (Asc.scope._position) {
                    var posCell = sheet.GetRange(Asc.scope._position);
                    if (posCell) {
                        anchorCol = posCell.GetCol() - 1;
                        anchorRow = posCell.GetRow() - 1;
                        if (anchorCol < 0) anchorCol = 0;
                        if (anchorRow < 0) anchorRow = 0;
                    }
                }

                var chart = sheet.AddChart(
                    "'" + sheet.GetName() + "'!" + Asc.scope._dataRange,
                    true, cType, 2, 240 * 36000, 150 * 36000, anchorRow, 0, anchorCol, 0
                );
                if (chart && Asc.scope._title) {
                    chart.SetTitle(Asc.scope._title);
                }
                return {
                    inserted: true,
                    dataRange: Asc.scope._dataRange,
                    chartType: Asc.scope._chartType,
                    position: Asc.scope._position || ("Col" + anchorCol + " Row" + anchorRow)
                };
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
        spreadsheet_list_charts: listCharts,
        spreadsheet_insert_chart: insertChart,
        spreadsheet_format_range: formatRange,
        spreadsheet_list_sheets: listSheets,
        spreadsheet_add_sheet: addSheet,
        spreadsheet_set_active_sheet: setActiveSheet,
        spreadsheet_rename_sheet: renameSheet
    };
})();
