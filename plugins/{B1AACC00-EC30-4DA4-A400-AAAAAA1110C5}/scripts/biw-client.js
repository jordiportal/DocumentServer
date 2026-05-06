/**
 * BIW Client - Cliente HTTP para conectar con el proxy SAP BIW
 * Maneja todas las comunicaciones con el backend proxy-biw
 */

(function(window) {
    'use strict';

    const DEFAULT_CONFIG = {
        baseUrl: 'http://localhost:3000',
        apiKey: '',
        timeout: 30000,
        language: 'S'
    };

    class BiwClient {
        constructor(config = {}) {
            this.config = { ...DEFAULT_CONFIG, ...config };
            this.isConnected = false;
            this.lastError = null;
            this.endpoints = [];
        }

        setBaseUrl(url) {
            this.config.baseUrl = url.replace(/\/$/, '');
        }

        setApiKey(key) {
            this.config.apiKey = key || '';
        }

        getConfig() {
            return { ...this.config };
        }

        /**
         * Petición HTTP al proxy con autenticación Bearer
         */
        async _fetch(endpoint, options = {}) {
            const url = `${this.config.baseUrl}${endpoint}`;

            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };

            if (this.config.apiKey) {
                headers['Authorization'] = `Bearer ${this.config.apiKey}`;
            }

            const fetchOptions = {
                ...options,
                headers: {
                    ...headers,
                    ...options.headers
                }
            };

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

                const response = await fetch(url, {
                    ...fetchOptions,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.details || errorData.error || `HTTP ${response.status}`);
                }

                return await response.json();

            } catch (error) {
                this.lastError = error.message;
                if (error.name === 'AbortError') {
                    throw new Error('Timeout: El servidor no respondió a tiempo');
                }
                throw error;
            }
        }

        /**
         * Verifica la conexión con el proxy
         */
        async checkConnection() {
            try {
                const response = await this._fetch('/health');
                this.isConnected = response.status === 'healthy';
                return this.isConnected;
            } catch (error) {
                this.isConnected = false;
                this.lastError = error.message;
                return false;
            }
        }

        /**
         * Obtiene info del servicio (health + servicios cargados)
         */
        async getServiceInfo() {
            return await this._fetch('/health');
        }

        /**
         * Lista catálogos BIW bajo ZKH_LLOREDA
         */
        async listCatalogs() {
            const response = await this._fetch('/api/bi/catalogs');
            return response.catalogs || [];
        }

        /**
         * Lista queries disponibles, opcionalmente filtradas por catálogo
         */
        async listQueries(catalog = null, filter = null) {
            const params = new URLSearchParams();
            if (catalog) params.set('catalog', catalog);
            if (filter) params.set('filter', filter);
            const qs = params.toString();
            const response = await this._fetch(`/api/bi/queries${qs ? '?' + qs : ''}`);
            return response.queries || [];
        }

        /**
         * Obtiene metadata de una query (dimensiones y medidas)
         * @param {string} queryName - Nombre completo (ej: ZBOKCOPA/MKT_CUENTA_RES_CP_OPT_DPCT)
         */
        async getQueryMetadata(queryName) {
            const encoded = encodeURIComponent(queryName);
            return await this._fetch(`/api/bi/queries/${encoded}/metadata`);
        }

        /**
         * Obtiene los valores de una dimensión
         */
        async getDimensionValues(queryName, dimensionName) {
            const qEncoded = encodeURIComponent(queryName);
            const dEncoded = encodeURIComponent(dimensionName);
            const response = await this._fetch(`/api/bi/queries/${qEncoded}/dimension-values/${dEncoded}`);
            return response.values || [];
        }

        /**
         * Obtiene las variables de una query
         */
        async getQueryVariables(queryName) {
            const encoded = encodeURIComponent(queryName);
            const response = await this._fetch(`/api/bi/queries/${encoded}/variables`);
            return response.variables || [];
        }

        /**
         * Ejecuta una query estructurada via BI Query Builder
         * @param {Object} params - { query, measures, dimension, filters, options }
         */
        async executeQuery(params) {
            const response = await this._fetch('/api/bi/query', {
                method: 'POST',
                body: JSON.stringify(params)
            });
            return response;
        }

        /**
         * Ejecuta una query MDX directa
         * @param {string} mdxQuery - Query MDX completa
         */
        async executeMDX(mdxQuery) {
            return await this._fetch('/api/bw/mdx/execute', {
                method: 'POST',
                body: JSON.stringify({ query: mdxQuery })
            });
        }

        /**
         * Limpia la caché del proxy
         */
        async clearCache() {
            return await this._fetch('/api/bi/cache/clear', { method: 'POST' });
        }

        getLastError() {
            return this.lastError;
        }

        saveConfig() {
            try {
                localStorage.setItem('biw-connector-config', JSON.stringify(this.config));
            } catch (e) {
                console.warn('[BiwClient] No se pudo guardar la configuración:', e);
            }
        }

        loadConfig() {
            try {
                const saved = localStorage.getItem('biw-connector-config');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    this.config = { ...DEFAULT_CONFIG, ...parsed };
                }
            } catch (e) {
                console.warn('[BiwClient] No se pudo cargar la configuración:', e);
            }
        }
    }

    window.BiwClient = BiwClient;

})(window);
