/**
 * MockDataSource — Implements the DataSource contract using static data from mock-data.js.
 * Adds a small artificial delay to simulate network latency.
 */

(function(window) {
    'use strict';

    const LATENCY_MS = 50;

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms || LATENCY_MS));
    }

    class MockDataSource extends DataSource {
        constructor(config) {
            super(Object.assign({ name: 'Mock (Demo)', type: 'mock' }, config));
        }

        async getInfo() {
            await delay();
            return {
                name: this.config.name,
                type: this.config.type,
                version: '1.0.0',
                status: 'healthy'
            };
        }

        async listSources(filter) {
            await delay();
            let sources = MockData.SOURCES.slice();
            if (filter) {
                const lc = filter.toLowerCase();
                sources = sources.filter(s =>
                    s.name.toLowerCase().includes(lc) ||
                    s.description.toLowerCase().includes(lc) ||
                    (s.catalog && s.catalog.toLowerCase().includes(lc))
                );
            }
            return sources;
        }

        async getMetadata(sourceName) {
            await delay();
            const meta = MockData.METADATA[sourceName];
            if (!meta) {
                throw new Error('Source not found: ' + sourceName);
            }
            return {
                dimensions: meta.dimensions.slice(),
                measures: meta.measures.slice()
            };
        }

        async getDimensionValues(sourceName, dimensionName) {
            await delay();
            const srcDims = MockData.DIMENSION_VALUES[sourceName];
            if (!srcDims) throw new Error('Source not found: ' + sourceName);
            const values = srcDims[dimensionName];
            if (!values) throw new Error('Dimension not found: ' + dimensionName);
            return values.slice();
        }

        async executeQuery(params) {
            await delay(80);
            const { source, dimensions, measures, filters } = params;
            if (!MockData.METADATA[source]) {
                throw new Error('Source not found: ' + source);
            }
            const columns = MockData.generateColumns(source, dimensions, measures);
            const data = MockData.generateQueryData(source, dimensions, measures, filters);
            return {
                columns: columns,
                data: data,
                totalRows: data.length
            };
        }
    }

    window.MockDataSource = MockDataSource;

})(window);
