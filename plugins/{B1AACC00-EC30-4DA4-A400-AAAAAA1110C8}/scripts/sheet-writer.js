/**
 * SheetWriter — Writes query results into the active spreadsheet.
 * v2.2: Unit support via SetNumberFormat, real numeric cell values.
 *
 * Usage (from background.js):
 *   SheetWriter.insert(rows, { columns, columnFormats, pivotConfig, callback });
 *   SheetWriter.insertCrossTab(crossTab, { pivotConfig, callback });
 */

(function(window) {
    'use strict';

    /**
     * Build Excel format string from a column format definition.
     * Uses [$-C0A] locale prefix to force Spanish (European) number display.
     */
    function buildFmtStr(fmt) {
        var d = fmt.decimals != null ? fmt.decimals : 2;
        var dec = d > 0 ? '.' + new Array(d + 1).join('0') : '';
        var base = '[$-C0A]#,##0' + dec;
        if (!fmt.unit) return base;
        var sym = fmt.symbol || fmt.unit;
        return base + ' "' + sym + '"';
    }

    // =====================================================================
    // FLAT TABLE INSERT
    // =====================================================================

    function insert(rows, options) {
        options = options || {};

        if (!rows || rows.length === 0) {
            if (options.callback) options.callback({ error: 'Sin datos' });
            return;
        }

        // Sort if requested
        var sortedRows = rows;
        if (options.sortField || (options.pivotConfig && options.pivotConfig.sortField)) {
            var sf = options.sortField || options.pivotConfig.sortField;
            var sortField, sortDir;
            if (typeof sf === 'object') { sortField = sf.field; sortDir = sf.direction || 'asc'; }
            else { sortField = sf; sortDir = options.sortDirection || 'asc'; }
            if (sortField) {
                sortedRows = rows.slice().sort(function(a, b) {
                    var va = a[sortField], vb = b[sortField];
                    if (va == null) va = ''; if (vb == null) vb = '';
                    var na = parseFloat(va), nb = parseFloat(vb);
                    var cmp = (!isNaN(na) && !isNaN(nb)) ? na - nb : String(va).localeCompare(String(vb));
                    return sortDir === 'desc' ? -cmp : cmp;
                });
            }
        }

        // Pre-resolve format strings — pass as JSON string (more reliable for Asc.scope)
        var fmtArray = [];
        if (options.columnFormats) {
            for (var i = 0; i < options.columnFormats.length; i++) {
                var fmt = options.columnFormats[i];
                if (!fmt) { fmtArray.push(''); continue; }
                fmtArray.push(buildFmtStr(fmt));
            }
        }

        window.Asc.scope.insertRows = sortedRows;
        window.Asc.scope.columns = options.columns || null;
        window.Asc.scope.fmtJSON = fmtArray.length > 0 ? JSON.stringify(fmtArray) : '';
        window.Asc.scope.pivotConfigJSON = options.pivotConfig ? JSON.stringify(options.pivotConfig) : '';
        window.Asc.scope.drillInfoJSON = options.drillInfo ? JSON.stringify(options.drillInfo) : '';

        window.Asc.plugin.callCommand(function() {
            var oSheet = Api.GetActiveSheet();
            var sheetName = oSheet.GetName();
            var data = Asc.scope.insertRows;
            var columns = Asc.scope.columns || null;
            var fmtJSON = Asc.scope.fmtJSON || '';
            var pivotJSON = Asc.scope.pivotConfigJSON || '';

            var columnFormats = [];
            if (fmtJSON) { try { columnFormats = JSON.parse(fmtJSON); } catch(e) { columnFormats = []; } }

            var drillInfo = [];
            if (Asc.scope.drillInfoJSON) { try { drillInfo = JSON.parse(Asc.scope.drillInfoJSON); } catch(e) { drillInfo = []; } }

            if (!data || data.length === 0) return { error: 'Sin datos en scope' };

            function isNum(v) {
                if (v === null || v === undefined || v === '') return false;
                return !isNaN(parseFloat(v)) && isFinite(v);
            }

            function colToLetter(col) {
                var letter = ''; var temp = col;
                while (temp >= 0) { letter = String.fromCharCode((temp % 26) + 65) + letter; temp = Math.floor(temp / 26) - 1; }
                return letter;
            }

            var headers = columns || Object.keys(data[0]);
            var numRows = data.length + 1;
            var numCols = headers.length;

            // Clear previous area using stored dimensions from CustomProperties
            var props = Api.GetCustomProperties();
            var prevMeta = props.Get('_DA_' + sheetName);
            if (prevMeta) {
                try {
                    var pm = JSON.parse(prevMeta);
                    if (pm.rows > 0 && pm.cols > 0) {
                        var cr = oSheet.GetRange('A1:' + colToLetter(pm.cols - 1) + pm.rows);
                        if (cr) { cr.SetValue(''); cr.SetFillColor('No Fill'); cr.SetFontColor(Api.CreateColorFromRGB(0,0,0)); cr.SetBold(false); }
                    }
                } catch(e) {}
            }

            var headerBg = Api.CreateColorFromRGB(30, 58, 95);
            var headerFont = Api.CreateColorFromRGB(255, 255, 255);
            var altRowBg = Api.CreateColorFromRGB(245, 248, 252);
            var drillColor = Api.CreateColorFromRGB(0, 100, 180);
            var subtotalBg = Api.CreateColorFromRGB(220, 230, 241);
            var grandTotalBg = Api.CreateColorFromRGB(189, 205, 224);

            var colWidths = [];
            for (var c = 0; c < headers.length; c++) {
                colWidths[c] = String(headers[c]).length + 2;
                var hCell = oSheet.GetRangeByNumber(0, c);
                hCell.SetValue(headers[c]); hCell.SetBold(true);
                hCell.SetFillColor(headerBg); hCell.SetFontColor(headerFont);
            }

            for (var r = 0; r < data.length; r++) {
                var rowInfo = drillInfo[r] || null;
                var isTotalRow = rowInfo && (rowInfo.isTotal || rowInfo.isGrandTotal);

                for (var c = 0; c < headers.length; c++) {
                    var cell = oSheet.GetRangeByNumber(r + 1, c);
                    var value = data[r][headers[c]];
                    if (isNum(value)) {
                        cell.SetValue(parseFloat(value));
                        cell.SetAlignHorizontal('right');
                        var numStr = String(value);
                        if (numStr.length + 4 > colWidths[c]) colWidths[c] = numStr.length + 4;
                    } else {
                        var display = (value !== undefined && value !== null ? String(value) : '');
                        cell.SetValue(display);
                        if (display.length > colWidths[c]) colWidths[c] = display.length;
                    }

                    // Style total rows
                    if (isTotalRow) {
                        cell.SetBold(true);
                        if (rowInfo.isGrandTotal) {
                            cell.SetFillColor(grandTotalBg);
                        } else {
                            cell.SetFillColor(subtotalBg);
                        }
                    } else {
                        if (r % 2 === 1) cell.SetFillColor(altRowBg);
                        // Style drill cells with color to indicate clickability
                        if (c === 0 && rowInfo && rowInfo.hasChildren) {
                            cell.SetFontColor(drillColor);
                            cell.SetBold(true);
                        }
                    }
                }
            }

            // Apply number formats per column
            var formatsApplied = 0;
            if (columnFormats.length > 0) {
                for (var c = 0; c < columnFormats.length; c++) {
                    var fmtStr = columnFormats[c];
                    if (!fmtStr) continue;
                    var letter = colToLetter(c);
                    var rangeAddr = letter + '2:' + letter + (data.length + 1);
                    var range = oSheet.GetRange(rangeAddr);
                    if (range) {
                        range.SetNumberFormat(fmtStr);
                        formatsApplied++;
                    }
                    if (fmtStr.length + 4 > colWidths[c]) colWidths[c] = fmtStr.length + 4;
                }
            }

            for (var c = 0; c < headers.length; c++) {
                var charW = Math.min(Math.max(Math.ceil(colWidths[c] * 1.2) + 2, 10), 65);
                oSheet.SetColumnWidth(c, charW);
            }

            // Save meta + drillInfo to CustomProperties
            props.Add('_DA_' + sheetName, JSON.stringify({ rows: numRows, cols: numCols, pivotConfig: pivotJSON, drillInfo: drillInfo }));

            return { success: true, count: data.length, columns: headers.length, sheetName: sheetName, formatsApplied: formatsApplied, hasDrill: drillInfo.length > 0 };

        }, false, true, function(result) {
            if (options.callback) options.callback(result || { success: true });
        });
    }

    // =====================================================================
    // CROSS-TAB INSERT
    // =====================================================================

    function insertCrossTab(crossTab, options) {
        options = options || {};

        if (!crossTab || !crossTab.dataRows || crossTab.dataRows.length === 0) {
            console.error('[SheetWriter] insertCrossTab: no data rows');
            if (options.callback) options.callback({ error: 'Sin datos cross-tab' });
            return;
        }

        if (!crossTab.headerRows || !Array.isArray(crossTab.headerRows)) {
            console.error('[SheetWriter] insertCrossTab: invalid headerRows');
            if (options.callback) options.callback({ error: 'Cabeceras inválidas' });
            return;
        }

        // Pre-resolve format strings — pass as JSON string
        var fmtArray = [];
        if (crossTab.columnFormats) {
            for (var i = 0; i < crossTab.columnFormats.length; i++) {
                var fmt = crossTab.columnFormats[i];
                if (!fmt) { fmtArray.push(''); continue; }
                fmtArray.push(buildFmtStr(fmt));
            }
        }

        window.Asc.scope.ctHeaderRows = crossTab.headerRows;
        window.Asc.scope.ctDataRows = crossTab.dataRows;
        window.Asc.scope.ctTotalCols = crossTab.totalCols;
        window.Asc.scope.fmtJSON = fmtArray.length > 0 ? JSON.stringify(fmtArray) : '';
        window.Asc.scope.pivotConfigJSON = options.pivotConfig ? JSON.stringify(options.pivotConfig) : '';
        window.Asc.scope.ctDrillInfo = crossTab.drillInfo || null;

        window.Asc.plugin.callCommand(function() {
            var oSheet = Api.GetActiveSheet();
            var sheetName = oSheet.GetName();
            var headerRows = Asc.scope.ctHeaderRows;
            var dataRows = Asc.scope.ctDataRows;
            var totalCols = Asc.scope.ctTotalCols;
            var fmtJSON = Asc.scope.fmtJSON || '';
            var pivotJSON = Asc.scope.pivotConfigJSON || '';

            var columnFormats = [];
            if (fmtJSON) { try { columnFormats = JSON.parse(fmtJSON); } catch(e) { columnFormats = []; } }

            function isNum(v) {
                if (v === null || v === undefined || v === '') return false;
                return !isNaN(parseFloat(v)) && isFinite(v);
            }

            function colToLetter(col) {
                var letter = ''; var temp = col;
                while (temp >= 0) { letter = String.fromCharCode((temp % 26) + 65) + letter; temp = Math.floor(temp / 26) - 1; }
                return letter;
            }

            var numHeaderRows = headerRows.length;
            var totalRows = numHeaderRows + dataRows.length;

            // Clear previous area using stored dimensions from CustomProperties
            var props = Api.GetCustomProperties();
            var prevMeta = props.Get('_DA_' + sheetName);
            if (prevMeta) {
                try {
                    var pm = JSON.parse(prevMeta);
                    if (pm.rows > 0 && pm.cols > 0) {
                        var cr = oSheet.GetRange('A1:' + colToLetter(pm.cols - 1) + pm.rows);
                        if (cr) { cr.SetValue(''); cr.SetFillColor('No Fill'); cr.SetFontColor(Api.CreateColorFromRGB(0,0,0)); cr.SetBold(false); cr.SetItalic(false); }
                    }
                } catch(e) {}
            }

            // Colors
            var headerBg = Api.CreateColorFromRGB(30, 58, 95);
            var headerFont = Api.CreateColorFromRGB(255, 255, 255);
            var subHeaderBg = Api.CreateColorFromRGB(55, 90, 130);
            var altRowBg = Api.CreateColorFromRGB(245, 248, 252);
            var grandTotalBg = Api.CreateColorFromRGB(189, 195, 199);

            var drillInfo = Asc.scope.ctDrillInfo || null;

            var colWidths = [];
            for (var c = 0; c < totalCols; c++) colWidths[c] = 4;

            // Write header rows
            for (var hr = 0; hr < headerRows.length; hr++) {
                var row = headerRows[hr];
                var bg = hr === 0 ? headerBg : subHeaderBg;
                for (var c = 0; c < row.length; c++) {
                    var cell = oSheet.GetRangeByNumber(hr, c);
                    var val = row[c];
                    if (val !== '' && val !== null && val !== undefined) {
                        cell.SetValue(val);
                        cell.SetBold(true);
                        cell.SetFillColor(bg);
                        cell.SetFontColor(headerFont);
                        if (String(val).length > colWidths[c]) colWidths[c] = String(val).length;
                    } else {
                        cell.SetFillColor(bg);
                    }
                }
            }

            // Write data rows
            for (var r = 0; r < dataRows.length; r++) {
                var row = dataRows[r];
                var rowInfo = drillInfo && drillInfo[r] ? drillInfo[r] : null;
                var isGrand = rowInfo && rowInfo.isGrandTotal;
                for (var c = 0; c < row.length; c++) {
                    var cell = oSheet.GetRangeByNumber(numHeaderRows + r, c);
                    var value = row[c];
                    if (isNum(value)) {
                        cell.SetValue(parseFloat(value));
                        cell.SetAlignHorizontal('right');
                        var numStr = String(value);
                        if (numStr.length + 4 > colWidths[c]) colWidths[c] = numStr.length + 4;
                    } else {
                        var display = (value !== undefined && value !== null ? String(value) : '');
                        cell.SetValue(display);
                        if (display.length > colWidths[c]) colWidths[c] = display.length;
                    }
                    if (isGrand) {
                        cell.SetBold(true);
                        cell.SetFillColor(grandTotalBg);
                    } else if (r % 2 === 1) {
                        cell.SetFillColor(altRowBg);
                    }
                }
            }

            // Apply number formats per column
            if (columnFormats.length > 0) {
                var firstDataRow = numHeaderRows + 1;
                var lastDataRow = numHeaderRows + dataRows.length;
                for (var c = 0; c < columnFormats.length; c++) {
                    var fmtStr = columnFormats[c];
                    if (!fmtStr) continue;
                    var letter = colToLetter(c);
                    var rangeAddr = letter + firstDataRow + ':' + letter + lastDataRow;
                    var range = oSheet.GetRange(rangeAddr);
                    if (range) {
                        range.SetNumberFormat(fmtStr);
                    }
                    if (fmtStr.length + 4 > colWidths[c]) colWidths[c] = fmtStr.length + 4;
                }
            }

            // Auto-fit columns
            for (var c = 0; c < totalCols; c++) {
                var charW = Math.min(Math.max(Math.ceil(colWidths[c] * 1.2) + 2, 10), 65);
                oSheet.SetColumnWidth(c, charW);
            }

            // Save meta to CustomProperties
            props.Add('_DA_' + sheetName, JSON.stringify({ rows: totalRows, cols: totalCols, pivotConfig: pivotJSON }));

            oSheet.GetRange('A1').Select();
            return { success: true, count: dataRows.length, columns: totalCols, sheetName: sheetName, crossTab: true };

        }, false, true, function(result) {
            if (options.callback) options.callback(result || { success: true });
        });
    }

    window.SheetWriter = { insert: insert, insertCrossTab: insertCrossTab };

})(window);
