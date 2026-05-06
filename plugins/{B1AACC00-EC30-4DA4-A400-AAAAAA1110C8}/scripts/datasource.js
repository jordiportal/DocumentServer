/**
 * DataSource — Base contract that every data provider must implement.
 *
 * Methods:
 *   getInfo()                                  → { name, type, version, status }
 *   listSources(filter?)                       → [{ name, description, catalog?, lastUpdate? }]
 *   getMetadata(sourceName)                    → { dimensions, measures }
 *   getDimensionValues(sourceName, dimName)     → [{ code, caption }]
 *   executeQuery({ source, dimensions, measures, filters? }) → { columns, data, totalRows }
 */

(function(window) {
    'use strict';

    class DataSource {
        /**
         * @param {Object} config
         * @param {string} config.name     — Display name (e.g. "Mock (Demo)")
         * @param {string} config.type     — Provider type: "mock" | "biw" | "databricks"
         * @param {string} [config.baseUrl]
         * @param {string} [config.apiKey]
         */
        constructor(config) {
            if (new.target === DataSource) {
                throw new Error('DataSource is abstract — use a concrete implementation');
            }
            this.config = Object.assign({ name: '', type: '', baseUrl: '', apiKey: '' }, config);
        }

        /** @returns {Promise<{name:string, type:string, version:string, status:"healthy"|"error"}>} */
        async getInfo() {
            throw new Error('getInfo() not implemented');
        }

        /**
         * @param {string} [filter] — Optional text filter on name/description
         * @returns {Promise<Array<{name:string, description:string, catalog?:string, lastUpdate?:string}>>}
         */
        async listSources(filter) {
            throw new Error('listSources() not implemented');
        }

        /**
         * @param {string} sourceName
         * @returns {Promise<{dimensions:Array<{name:string,caption:string}>, measures:Array<{name:string,caption:string,dataType?:string,unit?:string,decimals?:number}>}>}
         *
         * measure.unit     — Unit code: 'EUR'|'USD'|'GBP'|'%'|'uds'|'kg'|'h'|...
         * measure.decimals — Number of decimal places (default 2; use 0 for integers)
         */
        async getMetadata(sourceName) {
            throw new Error('getMetadata() not implemented');
        }

        /**
         * @param {string} sourceName
         * @param {string} dimensionName
         * @returns {Promise<Array<{code:string, caption:string}>>}
         */
        async getDimensionValues(sourceName, dimensionName) {
            throw new Error('getDimensionValues() not implemented');
        }

        /**
         * @param {Object} params
         * @param {string}   params.source     — Query / source name
         * @param {string[]} params.dimensions  — Dimension technical names to include
         * @param {string[]} params.measures    — Measure technical names to include
         * @param {Array<{dimension:string, values:string[]}>} [params.filters]
         * @returns {Promise<{columns:Array<{name:string,caption:string,type:string}>, data:Array<Object>, totalRows:number}>}
         */
        async executeQuery(params) {
            throw new Error('executeQuery() not implemented');
        }
    }

    window.DataSource = DataSource;

})(window);
