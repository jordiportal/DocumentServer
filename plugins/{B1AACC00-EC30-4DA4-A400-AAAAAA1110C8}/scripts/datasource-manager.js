/**
 * DataSourceManager — Registry of DataSource instances.
 * Handles active source selection and persists configuration to localStorage.
 */

(function(window) {
    'use strict';

    const STORAGE_KEY = 'data_analyzer_sources';
    const ACTIVE_KEY  = 'data_analyzer_active';

    class DataSourceManager {
        constructor() {
            this._sources = new Map();
            this._active = null;
            this._restore();
        }

        /** Register a DataSource instance. */
        register(ds) {
            this._sources.set(ds.config.name, ds);
        }

        /** Unregister by name. */
        unregister(name) {
            this._sources.delete(name);
            if (this._active && this._active.config.name === name) {
                this._active = null;
            }
        }

        /** Set the active DataSource by name. */
        setActive(name) {
            const ds = this._sources.get(name);
            if (!ds) throw new Error('DataSource not found: ' + name);
            this._active = ds;
            this._persist();
            return ds;
        }

        /** Get the currently active DataSource, fallback to first if none selected. */
        getActive() {
            if (this._active) return this._active;
            const first = this._sources.values().next().value;
            if (first) {
                this._active = first;
                return first;
            }
            return null;
        }

        /** Get a source by name. */
        get(name) {
            return this._sources.get(name) || null;
        }

        /** List all registered source configs. */
        list() {
            const result = [];
            this._sources.forEach((ds) => {
                result.push({
                    name: ds.config.name,
                    type: ds.config.type,
                    baseUrl: ds.config.baseUrl || '',
                    apiKey: ds.config.apiKey ? '••••' : ''
                });
            });
            return result;
        }

        /** Persist source configs (not instances) to localStorage. */
        _persist() {
            try {
                const configs = [];
                this._sources.forEach((ds) => {
                    configs.push({
                        name: ds.config.name,
                        type: ds.config.type,
                        baseUrl: ds.config.baseUrl || '',
                        apiKey: ds.config.apiKey || ''
                    });
                });
                localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
                if (this._active) {
                    localStorage.setItem(ACTIVE_KEY, this._active.config.name);
                }
            } catch (e) {
                // localStorage may be unavailable in sandboxed contexts
            }
        }

        /** Restore configs from localStorage, rebuild instances. */
        _restore() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) return;
                const configs = JSON.parse(raw);
                configs.forEach(cfg => {
                    if (cfg.type === 'mock') {
                        this.register(new MockDataSource(cfg));
                    }
                    // Future types will be registered here:
                    // else if (cfg.type === 'biw')        → new BiwDataSource(cfg)
                    // else if (cfg.type === 'databricks')  → new DatabricksDataSource(cfg)
                });
                const activeName = localStorage.getItem(ACTIVE_KEY);
                if (activeName && this._sources.has(activeName)) {
                    this._active = this._sources.get(activeName);
                }
            } catch (e) {
                // ignore corrupt data
            }
        }

        /** Save current state (call after config edits). */
        save() {
            this._persist();
        }

        /** Update a registered source's config (for settings edits). */
        updateConfig(name, newConfig) {
            const ds = this._sources.get(name);
            if (!ds) throw new Error('DataSource not found: ' + name);
            Object.assign(ds.config, newConfig);
            this._persist();
        }
    }

    window.DataSourceManager = DataSourceManager;

})(window);
