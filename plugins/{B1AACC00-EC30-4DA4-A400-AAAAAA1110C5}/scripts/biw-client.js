/**
 * BIW Client - Cliente HTTP para conectar con el proxy SAP BIW
 * Maneja todas las comunicaciones con el backend proxy-btp
 */

(function(window) {
    'use strict';

    const DEFAULT_CONFIG = {
        baseUrl: 'http://localhost:3001',
        timeout: 30000,
        language: 'S'  // S=español, E=inglés, D=alemán
    };

    /**
     * Cliente para el proxy BIW
     */
    class BiwClient {
        constructor(config = {}) {
            this.config = { ...DEFAULT_CONFIG, ...config };
            this.isConnected = false;
            this.lastError = null;
            this.endpoints = [];
        }

        /**
         * Configura la URL base del proxy
         * @param {string} url - URL del proxy BIW
         */
        setBaseUrl(url) {
            this.config.baseUrl = url.replace(/\/$/, ''); // Eliminar trailing slash
        }

        /**
         * Obtiene la configuración actual
         * @returns {Object} Configuración actual
         */
        getConfig() {
            return { ...this.config };
        }

        /**
         * Realiza una petición HTTP al proxy
         * @param {string} endpoint - Endpoint de la API
         * @param {Object} options - Opciones de fetch
         * @returns {Promise<Object>} Respuesta del servidor
         */
        async _fetch(endpoint, options = {}) {
            const url = `${this.config.baseUrl}${endpoint}`;
            
            const defaultOptions = {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: this.config.timeout
            };

            const fetchOptions = {
                ...defaultOptions,
                ...options,
                headers: {
                    ...defaultOptions.headers,
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
         * @returns {Promise<boolean>} true si está conectado
         */
        async checkConnection() {
            try {
                const response = await this._fetch('/health');
                this.isConnected = response.status === 'ok' || response.success === true;
                return this.isConnected;
            } catch (error) {
                this.isConnected = false;
                this.lastError = error.message;
                return false;
            }
        }

        /**
         * Obtiene la lista de endpoints BW disponibles
         * @param {boolean} includeDisabled - Incluir endpoints deshabilitados
         * @returns {Promise<Array>} Lista de endpoints
         */
        async getEndpoints(includeDisabled = false) {
            try {
                const queryParam = includeDisabled ? '?all=true' : '';
                const response = await this._fetch(`/api/bw-endpoints/list${queryParam}`);
                
                if (response.success && response.endpoints) {
                    this.endpoints = response.endpoints;
                    return this.endpoints;
                }
                
                return [];
            } catch (error) {
                console.error('[BiwClient] Error obteniendo endpoints:', error);
                throw error;
            }
        }

        /**
         * Obtiene los detalles de un endpoint específico
         * @param {string} name - Nombre del endpoint
         * @returns {Promise<Object>} Detalles del endpoint
         */
        async getEndpoint(name) {
            try {
                const response = await this._fetch(`/api/bw-endpoints/${name}`);
                return response.endpoint || null;
            } catch (error) {
                console.error('[BiwClient] Error obteniendo endpoint:', error);
                throw error;
            }
        }

        /**
         * Obtiene información de una query BW
         * @param {string} queryName - Nombre técnico de la query
         * @returns {Promise<Object>} Información de la query
         */
        async getQueryInfo(queryName) {
            try {
                const response = await this._fetch(`/api/bw-query/info/${queryName}`);
                return response;
            } catch (error) {
                console.error('[BiwClient] Error obteniendo info de query:', error);
                throw error;
            }
        }

        /**
         * Obtiene los miembros de una dimensión
         * @param {string} queryName - Nombre de la query
         * @param {string} dimensionName - Nombre de la dimensión
         * @returns {Promise<Object>} Miembros de la dimensión
         */
        async getDimensionMembers(queryName, dimensionName) {
            try {
                const response = await this._fetch(
                    `/api/bw-query/dimension-members/${queryName}/${dimensionName}`
                );
                return response;
            } catch (error) {
                console.error('[BiwClient] Error obteniendo miembros:', error);
                throw error;
            }
        }

        /**
         * Obtiene las dimensiones y medidas disponibles de una query
         * @param {string} queryName - Nombre técnico de la query
         * @returns {Promise<Object>} Dimensiones y medidas disponibles
         */
        async getDimensions(queryName) {
            try {
                const response = await this._fetch(`/api/bw-query/dimensions/${queryName}`);
                return {
                    success: response.success,
                    dimensions: response.dimensions || [],
                    keyFigures: response.keyFigures || []
                };
            } catch (error) {
                console.error('[BiwClient] Error obteniendo dimensiones:', error);
                throw error;
            }
        }

        /**
         * Ejecuta una query BW
         * @param {string} queryName - Nombre técnico de la query
         * @param {Object} options - Opciones de ejecución
         * @returns {Promise<Object>} Resultado de la query
         */
        async executeQuery(queryName, options = {}) {
            try {
                const payload = {
                    queryName,
                    language: options.language || this.config.language,
                    rowDimensions: options.rowDimensions || [],
                    columnDimensions: options.columnDimensions || [],
                    selectedKeyFigures: options.selectedKeyFigures || [],
                    variables: options.variables || []
                };

                console.log('[BiwClient] Ejecutando query:', queryName, payload);

                const response = await this._fetch('/api/bw-query/execute', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                if (response.success) {
                    return {
                        success: true,
                        data: response.data || [],
                        dimensions: response.dimensions || [],
                        rowLabels: response.rowLabels || [],
                        colLabels: response.colLabels || [],
                        metadata: response.metadata || {},
                        queryName: response.queryName
                    };
                }

                throw new Error(response.error || 'Error desconocido al ejecutar query');

            } catch (error) {
                console.error('[BiwClient] Error ejecutando query:', error);
                throw error;
            }
        }

        /**
         * Ejecuta una query BW con layout MDX dinámico
         * @param {string} queryName - Nombre técnico de la query
         * @param {Object} options - Opciones de layout
         * @returns {Promise<Object>} Resultado de la query
         */
        async executeQueryMDX(queryName, options = {}) {
            try {
                const payload = {
                    queryName,
                    rowDimensions: options.rowDimensions || [],
                    columnDimensions: options.columnDimensions || [],
                    measuresOnRows: options.measuresOnRows || false,
                    selectedKeyFigures: options.selectedKeyFigures || [],
                    filters: options.filters || [],
                    dimensionHierarchies: options.dimensionHierarchies || {}
                };

                console.log('[BiwClient] Ejecutando MDX:', queryName, payload);

                const response = await this._fetch('/api/bw-query/execute-mdx', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                if (response.success) {
                    return {
                        success: true,
                        data: response.data || [],
                        dimensions: response.dimensions || [],
                        rowLabels: response.rowLabels || [],
                        colLabels: response.colLabels || [],
                        metadata: response.metadata || {},
                        queryName: response.queryName
                    };
                }

                throw new Error(response.error || 'Error desconocido al ejecutar MDX');

            } catch (error) {
                console.error('[BiwClient] Error ejecutando MDX:', error);
                throw error;
            }
        }

        /**
         * Ejecuta un endpoint preconfigurado
         * @param {string} endpointName - Nombre del endpoint
         * @param {Object} overrideOptions - Opciones para sobrescribir la config por defecto
         * @returns {Promise<Object>} Resultado de la query
         */
        async executeEndpoint(endpointName, overrideOptions = {}) {
            try {
                // Obtener configuración del endpoint
                const endpoint = await this.getEndpoint(endpointName);
                
                if (!endpoint) {
                    throw new Error(`Endpoint no encontrado: ${endpointName}`);
                }

                if (!endpoint.enabled) {
                    throw new Error(`Endpoint deshabilitado: ${endpointName}`);
                }

                // Usar configuración por defecto del endpoint
                const defaultConfig = endpoint.defaultConfig || {};
                
                // Solo sobrescribir si hay valores seleccionados (arrays no vacíos)
                const options = {
                    rowDimensions: (overrideOptions.rowDimensions && overrideOptions.rowDimensions.length > 0) 
                        ? overrideOptions.rowDimensions 
                        : (defaultConfig.rowDimensions || []),
                    columnDimensions: (overrideOptions.columnDimensions && overrideOptions.columnDimensions.length > 0) 
                        ? overrideOptions.columnDimensions 
                        : (defaultConfig.columnDimensions || []),
                    selectedKeyFigures: (overrideOptions.selectedKeyFigures && overrideOptions.selectedKeyFigures.length > 0) 
                        ? overrideOptions.selectedKeyFigures 
                        : (defaultConfig.selectedKeyFigures || []),
                    filters: overrideOptions.filters || defaultConfig.filters || [],
                    variables: overrideOptions.variables || defaultConfig.variables || [],
                    language: overrideOptions.language || defaultConfig.language || 'ES'
                };

                console.log('[BiwClient] Ejecutando endpoint con opciones:', options);

                // Usar MDX para tener control real del layout
                return await this.executeQueryMDX(endpoint.queryName, options);

            } catch (error) {
                console.error('[BiwClient] Error ejecutando endpoint:', error);
                throw error;
            }
        }

        /**
         * Obtiene el último error registrado
         * @returns {string|null} Mensaje del último error
         */
        getLastError() {
            return this.lastError;
        }

        /**
         * Guarda la configuración en localStorage
         */
        saveConfig() {
            try {
                localStorage.setItem('biw-connector-config', JSON.stringify(this.config));
            } catch (e) {
                console.warn('[BiwClient] No se pudo guardar la configuración:', e);
            }
        }

        /**
         * Carga la configuración desde localStorage
         */
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

    // Exportar al scope global
    window.BiwClient = BiwClient;

})(window);
