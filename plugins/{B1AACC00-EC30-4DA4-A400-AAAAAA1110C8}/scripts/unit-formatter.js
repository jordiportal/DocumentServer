(function () {
    'use strict';

    window.UnitFormatter = {
        SYMBOLS: {
            EUR: '\u20ac',
            USD: '$',
            GBP: '\u00a3',
            JPY: '\u00a5',
            '%': '%',
            uds: 'uds',
            kg: 'kg',
            g: 'g',
            t: 't',
            h: 'h',
            min: 'min'
        },

        /**
         * Converts a unit + decimals definition into an Excel-compatible number format string.
         * Percentages: data arrives as literal values (12.5 means 12.5%), so we use
         * a quoted "%" suffix instead of Excel's native % format (which would multiply by 100).
         */
        toExcelFormat: function (unit, decimals) {
            var d = decimals != null ? decimals : 2;
            var dec = d > 0 ? '.' + new Array(d + 1).join('0') : '';
            var base = '#,##0' + dec;
            if (!unit) return base;
            var sym = this.SYMBOLS[unit] || unit;
            return base + ' "' + sym + '"';
        },

        displayLabel: function (unit) {
            if (!unit) return '';
            return this.SYMBOLS[unit] || unit;
        }
    };
})();
