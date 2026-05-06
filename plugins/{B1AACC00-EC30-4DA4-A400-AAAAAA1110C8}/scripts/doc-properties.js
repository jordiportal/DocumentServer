/**
 * DocProperties — Persist PivotConfig in the document via ApiCustomProperties.
 *
 * Uses callCommand to read/write custom string properties embedded in the .xlsx.
 * Key format: "DA_CONFIG_{sheetName}"
 *
 * This ensures configuration travels with the file and survives close/reopen.
 */

(function(window) {
    'use strict';

    var PREFIX = 'DA_CONFIG_';

    var DocProperties = {

        /**
         * Save a PivotConfig for the given sheet into the document's custom properties.
         * @param {string}      sheetName
         * @param {PivotConfig} pivotConfig
         * @param {Function}    [callback]  — called with {success:boolean}
         */
        save: function(sheetName, pivotConfig, callback) {
            window.Asc.scope._dp_sheetName = sheetName;
            window.Asc.scope._dp_value = JSON.stringify(pivotConfig.toJSON());

            window.Asc.plugin.callCommand(function() {
                var name = Asc.scope._dp_sheetName;
                var value = Asc.scope._dp_value;
                var metaSheet = Api.GetSheet('_AnalysisMeta');
                if (!metaSheet) { Api.AddSheet('_AnalysisMeta'); metaSheet = Api.GetSheet('_AnalysisMeta'); if (metaSheet) metaSheet.SetVisible(false); }
                if (!metaSheet) return { success: false, error: '_AnalysisMeta not available' };
                var metaRow = -1, emptyRow = -1;
                for (var i = 0; i < 100; i++) {
                    var s = metaSheet.GetRangeByNumber(i, 0).GetValue();
                    if (s === name) { metaRow = i; break; }
                    if ((!s || s === '') && emptyRow === -1) emptyRow = i;
                }
                if (metaRow === -1) metaRow = (emptyRow !== -1) ? emptyRow : 0;
                metaSheet.GetRangeByNumber(metaRow, 0).SetValue(name);
                metaSheet.GetRangeByNumber(metaRow, 3).SetValue(value);
                return { success: true };
            }, false, false, function(result) {
                if (callback) callback(result || { success: true });
            });
        },

        /**
         * Load a PivotConfig for the given sheet from _AnalysisMeta sheet.
         * @param {string}   sheetName
         * @param {Function} callback — called with PivotConfig instance or null
         */
        load: function(sheetName, callback) {
            window.Asc.scope._dp_sheetName = sheetName;

            window.Asc.plugin.callCommand(function() {
                var name = Asc.scope._dp_sheetName;
                var metaSheet = Api.GetSheet('_AnalysisMeta');
                if (!metaSheet) return null;
                for (var i = 0; i < 100; i++) {
                    var s = metaSheet.GetRangeByNumber(i, 0).GetValue();
                    if (s === name) {
                        return metaSheet.GetRangeByNumber(i, 3).GetValue() || null;
                    }
                    if (!s || s === '') break;
                }
                return null;
            }, false, false, function(result) {
                var config = null;
                if (result && typeof result === 'string') {
                    try { config = PivotConfig.fromJSON(result); } catch(e) {}
                }
                if (callback) callback(config);
            });
        },

        /**
         * Remove stored config for a sheet.
         * @param {string}   sheetName
         * @param {Function} [callback]
         */
        remove: function(sheetName, callback) {
            var key = PREFIX + sheetName;
            window.Asc.scope._dp_key = key;

            window.Asc.plugin.callCommand(function() {
                var props = Api.GetCustomProperties();
                if (props) props.AddStringProperty(Asc.scope._dp_key, '');
                return { success: true };
            }, false, false, function(result) {
                if (callback) callback(result);
            });
        },

        /**
         * Get the current active sheet name.
         * @param {Function} callback — called with sheet name string
         */
        getCurrentSheetName: function(callback) {
            window.Asc.plugin.callCommand(function() {
                return Api.GetActiveSheet().GetName();
            }, false, false, function(result) {
                if (callback) callback(result || 'Sheet1');
            });
        }
    };

    window.DocProperties = DocProperties;

})(window);
