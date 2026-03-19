var BiwHandlers = (function () {
    "use strict";

    var META_SHEET_NAME = "_BIWMeta";

    function getBiwMetadata() {
        return new Promise(function (resolve) {
            window.Asc.plugin.callCommand(function () {
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
                    sheets.push({
                        sheetName: sheetName,
                        rowCount: rowCount,
                        colCount: colCount
                    });
                }

                return {
                    hasBiwData: true,
                    metaSheetFound: true,
                    sheetsWithBiwData: sheets,
                    hint: "This spreadsheet was populated by the BIW Data Connector plugin from SAP BW. " +
                          "Columns typically include SAP dimensions (characteristics) and key figures (measures). " +
                          "Multi-level headers may be present."
                };
            }, false, false, function (result) {
                resolve(result);
            });
        });
    }

    function analyzeBiwData(params) {
        return new Promise(function (resolve) {
            window.Asc.scope._sheetName = params.sheet || null;

            window.Asc.plugin.callCommand(function () {
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
                        if (!isNaN(parseFloat(v))) {
                            numericCount++;
                        } else {
                            textCount++;
                        }
                        if (sampleValues.length < 5) sampleValues.push(String(v));
                    }

                    var colInfo = {
                        index: col,
                        name: colName,
                        sampleValues: sampleValues
                    };

                    if (numericCount > textCount && numericCount > 0) {
                        colInfo.type = "keyFigure";
                        keyFigures.push(colInfo);
                    } else {
                        colInfo.type = "dimension";
                        dimensions.push(colInfo);
                    }
                }

                var hasBiwMeta = !!Api.GetSheet("_BIWMeta");

                return {
                    sheetName: sheetName,
                    totalRows: rowCount,
                    totalColumns: colCount,
                    headerRowCount: headerRowCount,
                    headers: headers,
                    dimensions: dimensions,
                    keyFigures: keyFigures,
                    dataRowCount: rowCount - headerRowCount,
                    hasBiwMeta: hasBiwMeta,
                    analysisHint: "Dimensions are SAP BW characteristics (categories). " +
                                  "Key figures are SAP BW measures (numeric values). " +
                                  "If you need more data from SAP BW, ask the user or delegate to sap_analyst."
                };
            }, false, false, function (result) {
                resolve(result);
            });
        });
    }

    return {
        spreadsheet_get_biw_metadata: getBiwMetadata,
        spreadsheet_analyze_biw_data: analyzeBiwData
    };
})();
