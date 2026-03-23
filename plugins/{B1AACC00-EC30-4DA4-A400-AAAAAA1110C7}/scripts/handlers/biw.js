var BiwHandlers = (function () {
    "use strict";

    function safeCallCommand(fn) {
        return new Promise(function (resolve) {
            var timeout = setTimeout(function () {
                resolve({ error: "callCommand timeout (15s)" });
            }, 15000);

            try {
                window.Asc.plugin.callCommand(fn, false, false, function (result) {
                    clearTimeout(timeout);
                    resolve(result || { error: "empty result" });
                });
            } catch (e) {
                clearTimeout(timeout);
                resolve({ error: "callCommand exception: " + (e.message || String(e)) });
            }
        });
    }

    function getBiwMetadata() {
        return safeCallCommand(function () {
            try {
                var metaSheet = Api.GetSheet("_BIWMeta");
                if (!metaSheet) {
                    return { hasBiwData: false, message: "No _BIWMeta sheet found. This spreadsheet does not contain BIW data." };
                }

                var sheets = [];
                for (var i = 0; i < 100; i++) {
                    var sheetName = metaSheet.GetRangeByNumber(i, 0).GetValue();
                    if (!sheetName || sheetName === "") break;
                    var rowCount = parseInt(metaSheet.GetRangeByNumber(i, 1).GetValue()) || 0;
                    var colCount = parseInt(metaSheet.GetRangeByNumber(i, 2).GetValue()) || 0;
                    sheets.push({ sheetName: sheetName, rowCount: rowCount, colCount: colCount });
                }

                return {
                    hasBiwData: true,
                    metaSheetFound: true,
                    sheetsWithBiwData: sheets,
                    hint: "This spreadsheet was populated by the BIW Data Connector plugin from SAP BW."
                };
            } catch (e) {
                return { error: "getBiwMetadata: " + e.message };
            }
        });
    }

    function analyzeBiwData(params) {
        window.Asc.scope._sheetName = params.sheet || null;

        return safeCallCommand(function () {
            try {
                var sheet = Asc.scope._sheetName
                    ? Api.GetSheet(Asc.scope._sheetName)
                    : Api.GetActiveSheet();
                if (!sheet) return { error: "Sheet not found" };

                var sheetName = sheet.GetName();
                var usedRange = sheet.GetUsedRange();
                var rowCount = usedRange.GetRowsCount();
                var colCount = usedRange.GetColumnsCount();

                if (rowCount < 2 || colCount < 1) {
                    return { sheetName: sheetName, error: "Sheet appears empty or has insufficient data" };
                }

                var headerRowCount = 0;
                for (var r = 0; r < Math.min(5, rowCount); r++) {
                    var isNumericRow = false;
                    for (var c = 0; c < colCount; c++) {
                        var val = usedRange.GetCells(r, c).GetValue();
                        if (val && !isNaN(parseFloat(val)) && parseFloat(val) !== 0) {
                            isNumericRow = true;
                            break;
                        }
                    }
                    if (isNumericRow) {
                        headerRowCount = r;
                        break;
                    }
                }
                if (headerRowCount === 0) headerRowCount = 1;

                var headers = [];
                for (var h = 0; h < headerRowCount; h++) {
                    var row = [];
                    for (var hc = 0; hc < colCount; hc++) {
                        row.push(usedRange.GetCells(h, hc).GetValue() || "");
                    }
                    headers.push(row);
                }

                var dimensions = [];
                var keyFigures = [];
                var lastHeaderRow = headers[headers.length - 1];

                for (var col = 0; col < colCount; col++) {
                    var colName = lastHeaderRow[col] || ("Col" + col);
                    var numericCount = 0;
                    var textCount = 0;
                    var sampleValues = [];
                    var dataStart = headerRowCount;
                    var sampleEnd = Math.min(dataStart + 20, rowCount);

                    for (var sr = dataStart; sr < sampleEnd; sr++) {
                        var v = usedRange.GetCells(sr, col).GetValue();
                        if (v === null || v === undefined || v === "") continue;
                        if (!isNaN(parseFloat(v))) numericCount++;
                        else textCount++;
                        if (sampleValues.length < 5) sampleValues.push(String(v));
                    }

                    var colInfo = { index: col, name: colName, sampleValues: sampleValues };
                    if (numericCount > textCount && numericCount > 0) {
                        colInfo.type = "keyFigure";
                        keyFigures.push(colInfo);
                    } else {
                        colInfo.type = "dimension";
                        dimensions.push(colInfo);
                    }
                }

                return {
                    sheetName: sheetName,
                    totalRows: rowCount,
                    totalColumns: colCount,
                    headerRowCount: headerRowCount,
                    headers: headers,
                    dimensions: dimensions,
                    keyFigures: keyFigures,
                    dataRowCount: rowCount - headerRowCount,
                    hasBiwMeta: !!Api.GetSheet("_BIWMeta")
                };
            } catch (e) {
                return { error: "analyzeBiwData: " + e.message };
            }
        });
    }

    return {
        spreadsheet_get_biw_metadata: getBiwMetadata,
        spreadsheet_analyze_biw_data: analyzeBiwData
    };
})();
