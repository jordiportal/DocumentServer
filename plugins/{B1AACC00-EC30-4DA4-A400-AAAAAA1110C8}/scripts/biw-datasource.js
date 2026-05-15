/**
 * BiwDataSource — Connects to proxy-biw (SAP BW) via HTTP REST API.
 * Implements the DataSource contract for real SAP BW data access.
 */

(function(window) {
    'use strict';

    class BiwDataSource extends DataSource {
        constructor(config) {
            super(Object.assign({ name: 'SAP BW', type: 'biw' }, config));
            this._metadataCache = {};
        }

        async _fetch(path, options) {
            var url = (this.config.baseUrl || '').replace(/\/$/, '') + path;
            var headers = { 'Content-Type': 'application/json' };
            if (this.config.apiKey) {
                headers['Authorization'] = 'Bearer ' + this.config.apiKey;
            }
            var fetchOpts = Object.assign({ headers: headers }, options || {});

            var response = await fetch(url, fetchOpts);
            if (!response.ok) {
                var errBody;
                try { errBody = await response.json(); } catch(e) { errBody = {}; }
                throw new Error(errBody.error || errBody.details || ('HTTP ' + response.status));
            }
            return response.json();
        }

        async getInfo() {
            try {
                var data = await this._fetch('/bi/info');
                return {
                    name: data.name || this.config.name,
                    type: data.type || 'biw',
                    version: data.version || '1.0.0',
                    status: data.status || 'healthy'
                };
            } catch(e) {
                return {
                    name: this.config.name,
                    type: 'biw',
                    version: '1.0.0',
                    status: 'error'
                };
            }
        }

        async listSources(filter) {
            var path = '/bi/queries';
            var params = [];
            if (filter) params.push('filter=' + encodeURIComponent(filter));
            if (params.length) path += '?' + params.join('&');

            var data = await this._fetch(path);
            return (data.queries || []).map(function(q) {
                return {
                    name: q.name,
                    description: q.description || q.name,
                    catalog: q.catalog || '',
                    lastUpdate: q.lastDataUpdate || ''
                };
            });
        }

        async listCatalogs() {
            var data = await this._fetch('/bi/catalogs');
            return (data.catalogs || []).map(function(c) {
                return {
                    name: c.name,
                    caption: c.name,
                    count: c.queryCount || 0
                };
            });
        }

        async getMetadata(sourceName) {
            if (this._metadataCache[sourceName]) {
                return this._metadataCache[sourceName];
            }
            var encoded = encodeURIComponent(sourceName);
            var metaData = await this._fetch('/bi/queries/' + encoded + '/metadata');

            var dimensions = (metaData.dimensions || []).map(function(d) {
                return { name: d.name, caption: d.caption || d.name };
            });

            var measures = (metaData.measures || []).map(function(m) {
                var decimals = 2;
                if (m.dataType === 'I' || m.dataType === 'INT') decimals = 0;
                var rawUnit = m.units && m.units !== 'None' ? m.units : null;
                return {
                    name: m.name,
                    caption: m.caption || m.name,
                    dataType: m.dataType || 'N',
                    unit: rawUnit,
                    decimals: decimals
                };
            });

            var result = { dimensions: dimensions, measures: measures };

            // Derive initialFilters from SAP variables
            try {
                var varsData = await this._fetch('/bi/queries/' + encoded + '/variables');
                var variables = varsData.variables || [];
                var initFilters = [];
                for (var i = 0; i < variables.length; i++) {
                    var v = variables[i];
                    if (v.entryType >= 1) {
                        var refDim = (v.refDim || '').replace(/^\[|\]$/g, '');
                        var dim = dimensions.find(function(d) { return d.name === refDim; });
                        initFilters.push({
                            dimension: refDim,
                            caption: dim ? dim.caption : (v.caption || refDim),
                            required: v.entryType === 2
                        });
                    }
                }
                if (initFilters.length > 0) {
                    result.initialFilters = initFilters;
                }
            } catch(e) {
                // Variables endpoint may not be available; skip
            }

            this._metadataCache[sourceName] = result;
            return result;
        }

        async getDimensionValues(sourceName, dimensionName) {
            var encoded = encodeURIComponent(sourceName);
            var dimEncoded = encodeURIComponent(dimensionName);
            var data = await this._fetch('/bi/queries/' + encoded + '/dimension-values/' + dimEncoded);
            return (data.values || []).map(function(v) {
                return { code: v.code, caption: v.caption || v.code };
            });
        }

        async executeQuery(params) {
            // Get cached metadata for caption resolution
            var meta = this._metadataCache[params.source];
            if (!meta) {
                try { meta = await this.getMetadata(params.source); } catch(e) { meta = null; }
            }

            // Transform filters from plugin format to proxy format
            var proxyFilters = {};
            if (params.filters && params.filters.length > 0) {
                params.filters.forEach(function(f) {
                    if (f.values && f.values.length === 1) {
                        proxyFilters[f.dimension] = f.values[0];
                    } else if (f.values && f.values.length > 1) {
                        proxyFilters[f.dimension] = f.values;
                    }
                });
            }

            var body = {
                query: params.source,
                dimensions: params.dimensions || [],
                measures: params.measures || [],
                filters: proxyFilters
            };

            var data = await this._fetch('/bi/query', {
                method: 'POST',
                body: JSON.stringify(body)
            });

            // Build caption lookup from metadata
            var dimCaptionMap = {};
            var measCaptionMap = {};
            if (meta) {
                (meta.dimensions || []).forEach(function(d) { dimCaptionMap[d.name] = d.caption; });
                (meta.measures || []).forEach(function(m) { measCaptionMap[m.name] = m.caption; });
            }

            // Update metadata cache with units from query response
            if (meta && data.columns) {
                data.columns.forEach(function(c) {
                    if (c.type === 'measure' && c.units) {
                        var meas = meta.measures.find(function(m) { return m.name === c.name; });
                        if (meas && !meas.unit) {
                            meas.unit = c.units;
                        }
                    }
                });
            }

            // Transform response columns with real captions
            var columns = (data.columns || []).map(function(c) {
                var caption;
                if (c.type === 'dimension') {
                    caption = dimCaptionMap[c.name] || c.caption || c.name;
                } else {
                    caption = measCaptionMap[c.name] || c.caption || c.name;
                }
                return { name: c.name, caption: caption, type: c.type || 'measure', units: c.units || null };
            });

            // Transform data rows: keys are dimension/measure captions
            var rows = (data.data || []).map(function(row) {
                var newRow = {};
                for (var i = 0; i < columns.length; i++) {
                    var col = columns[i];
                    if (col.type === 'dimension') {
                        newRow[col.caption] = row[col.name + '_caption'] || row[col.name] || '';
                    } else {
                        newRow[col.caption] = row[col.name] != null ? row[col.name] : 0;
                    }
                }
                return newRow;
            });

            return {
                columns: columns,
                data: rows,
                totalRows: data.totalRows || rows.length
            };
        }
    }

    window.BiwDataSource = BiwDataSource;

})(window);
