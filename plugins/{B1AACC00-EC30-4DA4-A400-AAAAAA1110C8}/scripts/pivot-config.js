/**
 * PivotConfig — Models the complete state of a data analysis view.
 *
 * Zones:
 *   rowFields    — dimension names displayed as row headers (leading columns)
 *   columnFields — dimension names whose values become dynamic column groups (cross-tab)
 *   filterFields — dimension names used to filter (not displayed in table)
 *   valueFields  — measure names displayed as data columns
 *
 * When columnFields is empty the layout is a flat table.
 * When columnFields has entries the layout becomes a cross-tab / pivot.
 */

(function(window) {
    'use strict';

    var ZONES = ['rowFields', 'columnFields', 'filterFields', 'valueFields'];

    function PivotConfig(init) {
        var cfg = init || {};
        this.source       = cfg.source       || '';
        this.sourceName   = cfg.sourceName   || '';
        this.rowFields    = (cfg.rowFields    || []).slice();
        this.columnFields = (cfg.columnFields || []).slice();
        this.filterFields = (cfg.filterFields || []).slice();
        this.valueFields  = (cfg.valueFields  || []).slice();
        this.filters      = {};
        this.sortField    = cfg.sortField    || null;

        if (cfg.filters) {
            for (var k in cfg.filters) {
                if (cfg.filters.hasOwnProperty(k)) {
                    this.filters[k] = cfg.filters[k].slice();
                }
            }
        }
    }

    PivotConfig.ZONES = ZONES;

    /**
     * Returns true when the layout is a cross-tab (has column dimensions).
     */
    PivotConfig.prototype.isCrossTab = function() {
        return this.columnFields.length > 0;
    };

    PivotConfig.prototype.moveField = function(name, fromZone, toZone) {
        if (fromZone && this[fromZone]) {
            var idx = this[fromZone].indexOf(name);
            if (idx !== -1) this[fromZone].splice(idx, 1);
        }
        if (toZone && this[toZone]) {
            if (this[toZone].indexOf(name) === -1) {
                this[toZone].push(name);
            }
        }
    };

    PivotConfig.prototype.removeField = function(name) {
        for (var i = 0; i < ZONES.length; i++) {
            var arr = this[ZONES[i]];
            var idx = arr.indexOf(name);
            if (idx !== -1) { arr.splice(idx, 1); return ZONES[i]; }
        }
        return null;
    };

    PivotConfig.prototype.findZone = function(name) {
        for (var i = 0; i < ZONES.length; i++) {
            if (this[ZONES[i]].indexOf(name) !== -1) return ZONES[i];
        }
        return null;
    };

    PivotConfig.prototype.setFilters = function(dimName, values) {
        if (!values || values.length === 0) {
            delete this.filters[dimName];
        } else {
            this.filters[dimName] = values.slice();
        }
    };

    /**
     * Build query parameters. columnFields are requested as dimensions too so the
     * DataSource returns the cartesian product needed for pivoting.
     */
    PivotConfig.prototype.getQueryParams = function() {
        var allDims = this.rowFields.concat(this.columnFields, this.filterFields);
        var filters = [];
        for (var dim in this.filters) {
            if (this.filters.hasOwnProperty(dim) && this.filters[dim].length > 0) {
                filters.push({ dimension: dim, values: this.filters[dim] });
            }
        }
        return {
            source: this.source,
            dimensions: allDims.length > 0 ? allDims : undefined,
            measures: this.valueFields.length > 0 ? this.valueFields : undefined,
            filters: filters.length > 0 ? filters : undefined
        };
    };

    /**
     * Get ordered column captions for flat layout (no cross-tab).
     * Row dims first, then measures.
     */
    PivotConfig.prototype.getColumnOrder = function(metadata) {
        var cols = [];

        this.rowFields.forEach(function(name) {
            var dim = metadata.dimensions.find(function(d) { return d.name === name; });
            cols.push(dim ? dim.caption : name);
        });

        this.valueFields.forEach(function(name) {
            var meas = metadata.measures.find(function(m) { return m.name === name; });
            cols.push(meas ? meas.caption : name);
        });

        return cols;
    };

    /**
     * Returns an array aligned with getColumnOrder():
     *   null for dimension columns, { unit, decimals, symbol } for measure columns.
     * `symbol` is the resolved display character (pre-resolved so callCommand doesn't need window access).
     */
    PivotConfig.prototype.getColumnFormats = function(metadata) {
        var formats = [];

        this.rowFields.forEach(function() {
            formats.push(null);
        });

        this.valueFields.forEach(function(name) {
            var meas = metadata.measures.find(function(m) { return m.name === name; });
            if (meas && meas.unit) {
                var sym = window.UnitFormatter ? window.UnitFormatter.displayLabel(meas.unit) : meas.unit;
                formats.push({ unit: meas.unit, decimals: meas.decimals != null ? meas.decimals : 2, symbol: sym });
            } else {
                formats.push(null);
            }
        });

        return formats;
    };

    /**
     * Build cross-tab header info and pivoted data matrix.
     * Returns { headerRows: string[][], dataRows: (string|number)[][] }
     *
     * @param {Object}   metadata — { dimensions[], measures[] }
     * @param {Object[]} flatData — raw rows from DataSource (flat objects keyed by caption)
     */
    PivotConfig.prototype.buildCrossTab = function(metadata, flatData) {
        var self = this;
        if (!this.isCrossTab()) return null;

        // Resolve captions
        function dimCaption(name) {
            var d = metadata.dimensions.find(function(x) { return x.name === name; });
            return d ? d.caption : name;
        }
        function measCaption(name) {
            var m = metadata.measures.find(function(x) { return x.name === name; });
            return m ? m.caption : name;
        }

        var rowCaptions = this.rowFields.map(dimCaption);
        var colCaptions = this.columnFields.map(dimCaption);
        var valCaptions = this.valueFields.map(measCaption);
        var numValues   = valCaptions.length || 1;

        // Extract unique combinations for column dimension values (ordered by appearance)
        var colCombos = [];
        var colComboSet = {};
        flatData.forEach(function(row) {
            var key = colCaptions.map(function(c) { return row[c] || ''; }).join('\x00');
            if (!colComboSet[key]) {
                colComboSet[key] = true;
                colCombos.push(colCaptions.map(function(c) { return row[c] || ''; }));
            }
        });

        // --- Build header rows ---
        // Row 0: row-dim labels (empty or dim name) + col-dim combo labels spanning numValues each
        // Row 1 (if >1 value): row-dim captions + measure captions repeated per combo
        var headerRow0 = rowCaptions.slice();
        var headerRow1 = rowCaptions.map(function() { return ''; }); // blanks under dim names
        var needsTwoHeaders = numValues > 1;

        colCombos.forEach(function(combo) {
            var label = combo.join(' / ');
            headerRow0.push(label);
            for (var v = 1; v < numValues; v++) headerRow0.push('');
            if (needsTwoHeaders) {
                valCaptions.forEach(function(vc) { headerRow1.push(vc); });
            }
        });

        // If only 1 value field, row 0 suffices and we put the measure name in the combo label
        if (!needsTwoHeaders && valCaptions.length === 1) {
            // Append measure name to each combo label for clarity
            var measName = valCaptions[0];
            var idx = rowCaptions.length;
            colCombos.forEach(function(combo) {
                headerRow0[idx] = combo.join(' / ') + ' - ' + measName;
                idx++;
            });
        }

        var headerRows = [headerRow0];
        if (needsTwoHeaders) headerRows.push(headerRow1);

        // --- Build data index for fast lookup ---
        // Key = rowValues joined, sub-key = colValues joined → row object
        var dataIndex = {};
        flatData.forEach(function(row) {
            var rowKey = rowCaptions.map(function(c) { return row[c] || ''; }).join('\x00');
            var colKey = colCaptions.map(function(c) { return row[c] || ''; }).join('\x00');
            if (!dataIndex[rowKey]) dataIndex[rowKey] = {};
            dataIndex[rowKey][colKey] = row;
        });

        // Unique row combos (ordered by appearance)
        var rowCombos = [];
        var rowComboSet = {};
        flatData.forEach(function(row) {
            var key = rowCaptions.map(function(c) { return row[c] || ''; }).join('\x00');
            if (!rowComboSet[key]) {
                rowComboSet[key] = true;
                rowCombos.push(rowCaptions.map(function(c) { return row[c] || ''; }));
            }
        });

        // --- Build data rows ---
        var dataRows = [];
        rowCombos.forEach(function(rowVals) {
            var rowKey = rowVals.join('\x00');
            var outRow = rowVals.slice(); // leading dim values
            colCombos.forEach(function(combo) {
                var colKey = combo.join('\x00');
                var srcRow = (dataIndex[rowKey] || {})[colKey];
                valCaptions.forEach(function(vc) {
                    outRow.push(srcRow ? (srcRow[vc] != null ? srcRow[vc] : '') : '');
                });
            });
            dataRows.push(outRow);
        });

        // --- Build columnFormats (aligned with headerRow0) ---
        var columnFormats = [];
        // Row-dim columns have no numeric format
        rowCaptions.forEach(function() { columnFormats.push(null); });
        // Each colCombo × each valueField
        colCombos.forEach(function() {
            self.valueFields.forEach(function(name) {
                var meas = metadata.measures.find(function(m) { return m.name === name; });
                if (meas && meas.unit) {
                    var sym = window.UnitFormatter ? window.UnitFormatter.displayLabel(meas.unit) : meas.unit;
                    columnFormats.push({ unit: meas.unit, decimals: meas.decimals != null ? meas.decimals : 2, symbol: sym });
                } else {
                    columnFormats.push(null);
                }
            });
        });

        return {
            headerRows: headerRows,
            dataRows: dataRows,
            totalCols: headerRow0.length,
            columnFormats: columnFormats
        };
    };

    PivotConfig.prototype.toJSON = function() {
        return {
            source:       this.source,
            sourceName:   this.sourceName,
            rowFields:    this.rowFields.slice(),
            columnFields: this.columnFields.slice(),
            filterFields: this.filterFields.slice(),
            valueFields:  this.valueFields.slice(),
            filters:      JSON.parse(JSON.stringify(this.filters)),
            sortField:    this.sortField
        };
    };

    PivotConfig.fromJSON = function(obj) {
        if (!obj) return null;
        if (typeof obj === 'string') {
            try { obj = JSON.parse(obj); } catch(e) { return null; }
        }
        return new PivotConfig(obj);
    };

    PivotConfig.prototype.equals = function(other) {
        if (!other) return false;
        return JSON.stringify(this.toJSON()) === JSON.stringify(other.toJSON());
    };

    PivotConfig.fromMetadata = function(source, sourceName, metadata) {
        var cfg = new PivotConfig({ source: source, sourceName: sourceName });
        if (metadata.dimensions && metadata.dimensions.length > 0) {
            cfg.rowFields.push(metadata.dimensions[0].name);
        }
        metadata.measures.forEach(function(m) {
            cfg.valueFields.push(m.name);
        });
        return cfg;
    };

    window.PivotConfig = PivotConfig;

})(window);
