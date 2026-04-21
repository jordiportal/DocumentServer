/**
 * SheetWriter — Writes query results into the active spreadsheet.
 * Extracted and generalised from the BIW plugin's insertDataToSheet logic.
 *
 * Usage (from background.js):
 *   SheetWriter.insert(rows, { columns, numberFormat, callback });
 */

(function(window) {
    'use strict';

    const META_SHEET = '_AnalysisMeta';

    /**
     * Insert rows into the active OnlyOffice sheet.
     * @param {Array<Object>}  rows     — Data rows (flat objects)
     * @param {Object}         options
     * @param {string[]}       [options.columns]   — Ordered column keys (defaults to Object.keys of first row)
     * @param {string}         [options.numberFormat] — "EU" (1.234,56) or "US" (1,234.56)
     * @param {Function}       [options.callback]  — Called with {success,count,columns,sheetName}
     */
    function insert(rows, options) {
        options = options || {};
        var numFormat = options.numberFormat || localStorage.getItem('da_number_format') || 'EU';

        if (!rows || rows.length === 0) {
            if (options.callback) options.callback({ error: 'Sin datos' });
            return;
        }

        window.Asc.scope.insertRows = rows;
        window.Asc.scope.numberFormat = numFormat;
        window.Asc.scope.columns = options.columns || null;

        window.Asc.plugin.callCommand(function() {
            var oSheet = Api.GetActiveSheet();
            var sheetName = oSheet.GetName();
            var data = Asc.scope.insertRows;
            var numFormat = Asc.scope.numberFormat || 'EU';
            var columns = Asc.scope.columns || null;

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
                var letter = '';
                var temp = col;
                while (temp >= 0) {
                    letter = String.fromCharCode((temp % 26) + 65) + letter;
                    temp = Math.floor(temp / 26) - 1;
                }
                return letter;
            }

            var headers = columns || Object.keys(data[0]);
            var numRows = data.length + 1;
            var numCols = headers.length;

            var metaSheetName = '_AnalysisMeta';
            var metaSheet = Api.GetSheet(metaSheetName);
            if (!metaSheet) {
                Api.AddSheet(metaSheetName);
                metaSheet = Api.GetSheet(metaSheetName);
                if (metaSheet) metaSheet.SetVisible(false);
            }

            var prevRows = 0, prevCols = 0;
            if (metaSheet) {
                for (var i = 0; i < 100; i++) {
                    var s = metaSheet.GetRangeByNumber(i, 0).GetValue();
                    if (s === sheetName) {
                        prevRows = parseInt(metaSheet.GetRangeByNumber(i, 1).GetValue()) || 0;
                        prevCols = parseInt(metaSheet.GetRangeByNumber(i, 2).GetValue()) || 0;
                        break;
                    }
                    if (!s || s === '') break;
                }
            }

            if (prevRows > 0 && prevCols > 0) {
                var clearRange = oSheet.GetRange('A1:' + colToLetter(prevCols - 1) + prevRows);
                if (clearRange) {
                    clearRange.SetValue('');
                    clearRange.SetFillColor('No Fill');
                    clearRange.SetFontColor(Api.CreateColorFromRGB(0, 0, 0));
                    clearRange.SetBold(false);
                }
            }

            var headerBg = Api.CreateColorFromRGB(30, 58, 95);
            var headerFont = Api.CreateColorFromRGB(255, 255, 255);
            var altRowBg = Api.CreateColorFromRGB(245, 248, 252);

            for (var c = 0; c < headers.length; c++) {
                var hCell = oSheet.GetRangeByNumber(0, c);
                hCell.SetValue(headers[c]);
                hCell.SetBold(true);
                hCell.SetFillColor(headerBg);
                hCell.SetFontColor(headerFont);
            }

            for (var r = 0; r < data.length; r++) {
                for (var c = 0; c < headers.length; c++) {
                    var cell = oSheet.GetRangeByNumber(r + 1, c);
                    var value = data[r][headers[c]];
                    if (isNum(value)) {
                        cell.SetValue(formatNumber(value));
                        cell.SetAlignHorizontal('right');
                    } else {
                        cell.SetValue(value !== undefined && value !== null ? value : '');
                    }
                    if (r % 2 === 1) cell.SetFillColor(altRowBg);
                }
            }

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
            }

            oSheet.GetRange('A1').Select();

            return { success: true, count: data.length, columns: headers.length, sheetName: sheetName };

        }, false, true, function(result) {
            if (options.callback) options.callback(result || { success: true });
        });
    }

    window.SheetWriter = { insert: insert };

})(window);
