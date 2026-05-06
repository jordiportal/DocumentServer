/**
 * SheetWriter — Writes query results into the active spreadsheet.
 * v2.1: Cross-tab (pivot) support, extended metadata, auto-persistence, sort.
 *
 * Usage (from background.js):
 *   SheetWriter.insert(rows, { columns, numberFormat, pivotConfig, callback });
 *   SheetWriter.insertCrossTab(crossTab, { numberFormat, pivotConfig, callback });
 */

(function(window) {
    'use strict';

    // Shared helpers used inside callCommand (must be self-contained)
    var HELPERS_SRC = [
        'function formatNumber(value, numFormat) {',
        '    if (value === null || value === undefined || value === "") return "";',
        '    var num = parseFloat(value);',
        '    if (isNaN(num)) return value;',
        '    if (numFormat === "EU") {',
        '        var parts = num.toFixed(2).split(".");',
        '        parts[0] = parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ".");',
        '        return parts.join(",");',
        '    }',
        '    return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });',
        '}',
        'function isNum(v) {',
        '    if (v === null || v === undefined || v === "") return false;',
        '    return !isNaN(parseFloat(v)) && isFinite(v);',
        '}',
        'function colToLetter(col) {',
        '    var letter = "";',
        '    var temp = col;',
        '    while (temp >= 0) {',
        '        letter = String.fromCharCode((temp % 26) + 65) + letter;',
        '        temp = Math.floor(temp / 26) - 1;',
        '    }',
        '    return letter;',
        '}'
    ].join('\n');

    // =====================================================================
    // CLEAR + META helpers (executed inside callCommand context)
    // =====================================================================

    function clearPreviousArea(oSheet, metaSheet, sheetName) {
        if (!metaSheet) return;
        var prevRows = 0, prevCols = 0;
        for (var i = 0; i < 100; i++) {
            var s = metaSheet.GetRangeByNumber(i, 0).GetValue();
            if (s === sheetName) {
                prevRows = parseInt(metaSheet.GetRangeByNumber(i, 1).GetValue()) || 0;
                prevCols = parseInt(metaSheet.GetRangeByNumber(i, 2).GetValue()) || 0;
                break;
            }
            if (!s || s === '') break;
        }
        if (prevRows > 0 && prevCols > 0) {
            var letter = '';
            var temp = prevCols - 1;
            while (temp >= 0) {
                letter = String.fromCharCode((temp % 26) + 65) + letter;
                temp = Math.floor(temp / 26) - 1;
            }
            var clearRange = oSheet.GetRange('A1:' + letter + prevRows);
            if (clearRange) {
                clearRange.SetValue('');
                clearRange.SetFillColor('No Fill');
                clearRange.SetFontColor(Api.CreateColorFromRGB(0, 0, 0));
                clearRange.SetBold(false);
                clearRange.SetItalic(false);
            }
        }
    }

    function writeMeta(metaSheet, sheetName, numRows, numCols, pivotJSON) {
        if (!metaSheet) return;
        var metaRow = -1, emptyRow = -1;
        for (var i = 0; i < 100; i++) {
            var s = metaSheet.GetRangeByNumber(i, 0).GetValue();
            if (s === sheetName) { metaRow = i; break; }
            if ((!s || s === '') && emptyRow === -1) emptyRow = i;
        }
        if (metaRow === -1) metaRow = (emptyRow !== -1) ? emptyRow : 0;
        metaSheet.GetRangeByNumber(metaRow, 0).SetValue(sheetName);
        metaSheet.GetRangeByNumber(metaRow, 1).SetValue(numRows);
        metaSheet.GetRangeByNumber(metaRow, 2).SetValue(numCols);
        metaSheet.GetRangeByNumber(metaRow, 3).SetValue(pivotJSON);
    }

    function persistDocProps(sheetName, pivotJSON) {
        // Persistence handled via _AnalysisMeta sheet
    }

    function getOrCreateMetaSheet() {
        var metaSheet = Api.GetSheet('_AnalysisMeta');
        if (!metaSheet) {
            Api.AddSheet('_AnalysisMeta');
            metaSheet = Api.GetSheet('_AnalysisMeta');
            if (metaSheet) metaSheet.SetVisible(false);
        }
        return metaSheet;
    }

    // =====================================================================
    // FLAT TABLE INSERT
    // =====================================================================

    function insert(rows, options) {
        options = options || {};
        var numFormat = options.numberFormat || 'EU';
        try { numFormat = numFormat || localStorage.getItem('da_number_format') || 'EU'; } catch(e) {}

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

        window.Asc.scope.insertRows = sortedRows;
        window.Asc.scope.numberFormat = numFormat;
        window.Asc.scope.columns = options.columns || null;
        window.Asc.scope.pivotConfigJSON = options.pivotConfig ? JSON.stringify(options.pivotConfig) : '';

        window.Asc.plugin.callCommand(function() {
            var oSheet = Api.GetActiveSheet();
            var sheetName = oSheet.GetName();
            var data = Asc.scope.insertRows;
            var numFormat = Asc.scope.numberFormat || 'EU';
            var columns = Asc.scope.columns || null;
            var pivotJSON = Asc.scope.pivotConfigJSON || '';

            if (!data || data.length === 0) return { error: 'Sin datos en scope' };

            function formatNumber(value) {
                if (value === null || value === undefined || value === '') return '';
                var num = parseFloat(value);
                if (isNaN(num)) return value;
                if (numFormat === 'EU') {
                    var parts = num.toFixed(2).split('.');
                    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                    return parts.join(',');
                }
                return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }

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

            var metaSheet = Api.GetSheet('_AnalysisMeta');
            if (!metaSheet) { Api.AddSheet('_AnalysisMeta'); metaSheet = Api.GetSheet('_AnalysisMeta'); if (metaSheet) metaSheet.SetVisible(false); }

            // Clear previous
            if (metaSheet) {
                for (var i = 0; i < 100; i++) {
                    var s = metaSheet.GetRangeByNumber(i, 0).GetValue();
                    if (s === sheetName) {
                        var pR = parseInt(metaSheet.GetRangeByNumber(i, 1).GetValue()) || 0;
                        var pC = parseInt(metaSheet.GetRangeByNumber(i, 2).GetValue()) || 0;
                        if (pR > 0 && pC > 0) {
                            var cr = oSheet.GetRange('A1:' + colToLetter(pC - 1) + pR);
                            if (cr) { cr.SetValue(''); cr.SetFillColor('No Fill'); cr.SetFontColor(Api.CreateColorFromRGB(0,0,0)); cr.SetBold(false); }
                        }
                        break;
                    }
                    if (!s || s === '') break;
                }
            }

            var headerBg = Api.CreateColorFromRGB(30, 58, 95);
            var headerFont = Api.CreateColorFromRGB(255, 255, 255);
            var altRowBg = Api.CreateColorFromRGB(245, 248, 252);

            var colWidths = [];
            for (var c = 0; c < headers.length; c++) {
                colWidths[c] = String(headers[c]).length + 2;
                var hCell = oSheet.GetRangeByNumber(0, c);
                hCell.SetValue(headers[c]); hCell.SetBold(true);
                hCell.SetFillColor(headerBg); hCell.SetFontColor(headerFont);
            }

            for (var r = 0; r < data.length; r++) {
                for (var c = 0; c < headers.length; c++) {
                    var cell = oSheet.GetRangeByNumber(r + 1, c);
                    var value = data[r][headers[c]];
                    var display;
                    if (isNum(value)) { display = formatNumber(value); cell.SetValue(display); cell.SetAlignHorizontal('right'); }
                    else { display = (value !== undefined && value !== null ? String(value) : ''); cell.SetValue(display); }
                    if (display.length > colWidths[c]) colWidths[c] = display.length;
                    if (r % 2 === 1) cell.SetFillColor(altRowBg);
                }
            }

            for (var c = 0; c < headers.length; c++) {
                var charW = Math.min(Math.max(Math.ceil(colWidths[c] * 1.2) + 2, 10), 65);
                oSheet.SetColumnWidth(c, charW);
            }

            // Meta
            if (metaSheet) {
                var metaRow = -1, emptyRow = -1;
                for (var i = 0; i < 100; i++) {
                    var s = metaSheet.GetRangeByNumber(i, 0).GetValue();
                    if (s === sheetName) { metaRow = i; break; }
                    if ((!s || s === '') && emptyRow === -1) emptyRow = i;
                }
                if (metaRow === -1) metaRow = (emptyRow !== -1) ? emptyRow : 0;
                metaSheet.GetRangeByNumber(metaRow, 0).SetValue(sheetName);
                metaSheet.GetRangeByNumber(metaRow, 1).SetValue(numRows);
                metaSheet.GetRangeByNumber(metaRow, 2).SetValue(numCols);
                metaSheet.GetRangeByNumber(metaRow, 3).SetValue(pivotJSON);
            }

            oSheet.GetRange('A1').Select();
            return { success: true, count: data.length, columns: headers.length, sheetName: sheetName };

        }, false, true, function(result) {
            if (options.callback) options.callback(result || { success: true });
        });
    }

    // =====================================================================
    // CROSS-TAB INSERT
    // =====================================================================

    function insertCrossTab(crossTab, options) {
        options = options || {};
        var numFormat = options.numberFormat || 'EU';
        try { numFormat = numFormat || localStorage.getItem('da_number_format') || 'EU'; } catch(e) {}

        if (!crossTab || !crossTab.dataRows || crossTab.dataRows.length === 0) {
            console.error('[SheetWriter] insertCrossTab: no data rows');
            if (options.callback) options.callback({ error: 'Sin datos cross-tab' });
            return;
        }

        // Validate data before passing to scope
        if (!crossTab.headerRows || !Array.isArray(crossTab.headerRows)) {
            console.error('[SheetWriter] insertCrossTab: invalid headerRows', crossTab);
            if (options.callback) options.callback({ error: 'Cabeceras inválidas' });
            return;
        }

        window.Asc.scope.ctHeaderRows = crossTab.headerRows;
        window.Asc.scope.ctDataRows = crossTab.dataRows;
        window.Asc.scope.ctTotalCols = crossTab.totalCols;
        window.Asc.scope.numberFormat = numFormat;
        window.Asc.scope.pivotConfigJSON = options.pivotConfig ? JSON.stringify(options.pivotConfig) : '';

        window.Asc.plugin.callCommand(function() {
            var oSheet = Api.GetActiveSheet();
            var sheetName = oSheet.GetName();
            var headerRows = Asc.scope.ctHeaderRows;
            var dataRows = Asc.scope.ctDataRows;
            var totalCols = Asc.scope.ctTotalCols;
            var numFormat = Asc.scope.numberFormat || 'EU';
            var pivotJSON = Asc.scope.pivotConfigJSON || '';

            function formatNumber(value) {
                if (value === null || value === undefined || value === '') return '';
                var num = parseFloat(value);
                if (isNaN(num)) return value;
                if (numFormat === 'EU') {
                    var parts = num.toFixed(2).split('.');
                    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                    return parts.join(',');
                }
                return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }

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

            // Meta sheet
            var metaSheet = Api.GetSheet('_AnalysisMeta');
            if (!metaSheet) { Api.AddSheet('_AnalysisMeta'); metaSheet = Api.GetSheet('_AnalysisMeta'); if (metaSheet) metaSheet.SetVisible(false); }

            // Clear previous area
            if (metaSheet) {
                for (var i = 0; i < 100; i++) {
                    var s = metaSheet.GetRangeByNumber(i, 0).GetValue();
                    if (s === sheetName) {
                        var pR = parseInt(metaSheet.GetRangeByNumber(i, 1).GetValue()) || 0;
                        var pC = parseInt(metaSheet.GetRangeByNumber(i, 2).GetValue()) || 0;
                        if (pR > 0 && pC > 0) {
                            var cr = oSheet.GetRange('A1:' + colToLetter(pC - 1) + pR);
                            if (cr) { cr.SetValue(''); cr.SetFillColor('No Fill'); cr.SetFontColor(Api.CreateColorFromRGB(0,0,0)); cr.SetBold(false); cr.SetItalic(false); }
                        }
                        break;
                    }
                    if (!s || s === '') break;
                }
            }

            // Colors
            var headerBg = Api.CreateColorFromRGB(30, 58, 95);
            var headerFont = Api.CreateColorFromRGB(255, 255, 255);
            var subHeaderBg = Api.CreateColorFromRGB(55, 90, 130);
            var altRowBg = Api.CreateColorFromRGB(245, 248, 252);

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
                for (var c = 0; c < row.length; c++) {
                    var cell = oSheet.GetRangeByNumber(numHeaderRows + r, c);
                    var value = row[c];
                    var display;
                    if (isNum(value)) {
                        display = formatNumber(value);
                        cell.SetValue(display);
                        cell.SetAlignHorizontal('right');
                    } else {
                        display = (value !== undefined && value !== null ? String(value) : '');
                        cell.SetValue(display);
                    }
                    if (display.length > colWidths[c]) colWidths[c] = display.length;
                    if (r % 2 === 1) cell.SetFillColor(altRowBg);
                }
            }

            // Auto-fit columns
            for (var c = 0; c < totalCols; c++) {
                var charW = Math.min(Math.max(Math.ceil(colWidths[c] * 1.2) + 2, 10), 65);
                oSheet.SetColumnWidth(c, charW);
            }

            // Update meta
            if (metaSheet) {
                var metaRow = -1, emptyRow = -1;
                for (var i = 0; i < 100; i++) {
                    var s = metaSheet.GetRangeByNumber(i, 0).GetValue();
                    if (s === sheetName) { metaRow = i; break; }
                    if ((!s || s === '') && emptyRow === -1) emptyRow = i;
                }
                if (metaRow === -1) metaRow = (emptyRow !== -1) ? emptyRow : 0;
                metaSheet.GetRangeByNumber(metaRow, 0).SetValue(sheetName);
                metaSheet.GetRangeByNumber(metaRow, 1).SetValue(totalRows);
                metaSheet.GetRangeByNumber(metaRow, 2).SetValue(totalCols);
                metaSheet.GetRangeByNumber(metaRow, 3).SetValue(pivotJSON);
            }

            oSheet.GetRange('A1').Select();
            return { success: true, count: dataRows.length, columns: totalCols, sheetName: sheetName, crossTab: true };

        }, false, true, function(result) {
            if (options.callback) options.callback(result || { success: true });
        });
    }

    window.SheetWriter = { insert: insert, insertCrossTab: insertCrossTab };

})(window);
