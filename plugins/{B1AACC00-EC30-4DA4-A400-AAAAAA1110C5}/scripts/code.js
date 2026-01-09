/**
 * BIW Data Connector - Plugin Principal v2.1.0
 * Plugin visual que importa datos desde SAP BIW
 */

(function(window, undefined) {
    'use strict';

    // Estado global
    let biwClient = null;
    let pivotBuilder = null;
    let selectedEndpoint = null;
    let currentData = null;
    let currentHierarchy = null;
    let endpoints = [];
    let dimensions = [];
    let measures = [];

    /**
     * Inicialización del plugin
     */
    window.Asc.plugin.init = function(data) {
        console.log('[BIW v2.1.0] Plugin inicializado');
        
        // Crear instancias de servicios
        biwClient = new window.BiwClient();
        pivotBuilder = new window.PivotBuilder();
        
        // Inicializar UI
        initializeUI();
        
        // Cargar endpoints
        loadEndpoints();
    };

    /**
     * Inicializa los listeners de la UI
     */
    function initializeUI() {
        // Botón reconectar
        document.getElementById('btn-reconnect').addEventListener('click', function() {
            const url = document.getElementById('proxy-url').value;
            biwClient.setBaseUrl(url);
            loadEndpoints();
        });

        // Botón vista previa
        document.getElementById('btn-preview').addEventListener('click', loadPreview);

        // Botón insertar
        document.getElementById('btn-insert').addEventListener('click', insertData);
    }

    /**
     * Actualiza el indicador de estado de conexión
     */
    function updateConnectionStatus(status) {
        const indicator = document.getElementById('connection-status');
        switch(status) {
            case 'connected':
                indicator.textContent = '✅';
                indicator.className = 'status-indicator connected';
                break;
            case 'error':
                indicator.textContent = '❌';
                indicator.className = 'status-indicator error';
                break;
            case 'checking':
                indicator.textContent = '⏳';
                indicator.className = 'status-indicator checking';
                break;
        }
    }

    /**
     * Carga los endpoints disponibles
     */
    async function loadEndpoints() {
        updateConnectionStatus('checking');
        
        const listContainer = document.getElementById('endpoints-list');
        listContainer.innerHTML = '<div class="loading">⏳ Conectando al proxy...</div>';

        try {
            endpoints = await biwClient.listEndpoints();
            updateConnectionStatus('connected');
            
            if (endpoints.length === 0) {
                listContainer.innerHTML = '<div class="error">No hay endpoints configurados</div>';
                return;
            }

            // Renderizar lista de endpoints
            listContainer.innerHTML = endpoints.map(ep => `
                <div class="endpoint-item" data-name="${ep.name}">
                    <div class="endpoint-name">📊 ${ep.name}</div>
                    <div class="endpoint-query">${ep.queryName || 'Sin query'}</div>
                </div>
            `).join('');

            // Añadir listeners
            listContainer.querySelectorAll('.endpoint-item').forEach(item => {
                item.addEventListener('click', function() {
                    selectEndpoint(this.dataset.name);
                });
            });

        } catch (error) {
            console.error('[BIW] Error cargando endpoints:', error);
            updateConnectionStatus('error');
            listContainer.innerHTML = `<div class="error">Error: ${error.message}</div>`;
        }
    }

    /**
     * Selecciona un endpoint y carga sus dimensiones
     */
    async function selectEndpoint(name) {
        // Marcar como seleccionado
        document.querySelectorAll('.endpoint-item').forEach(el => {
            el.classList.toggle('selected', el.dataset.name === name);
        });

        selectedEndpoint = endpoints.find(ep => ep.name === name);
        if (!selectedEndpoint) return;

        console.log('[BIW] Endpoint seleccionado:', selectedEndpoint);

        // Mostrar sección de opciones
        document.getElementById('options-section').style.display = 'block';
        
        // Cargar dimensiones y medidas
        try {
            const info = await biwClient.getDimensions(name);
            dimensions = info.dimensions || [];
            measures = info.measures || [];

            // Poblar selectores
            populateSelect('select-rows', dimensions);
            populateSelect('select-values', measures);

        } catch (error) {
            console.error('[BIW] Error cargando dimensiones:', error);
        }
    }

    /**
     * Puebla un select con opciones
     */
    function populateSelect(selectId, items) {
        const select = document.getElementById(selectId);
        select.innerHTML = items.map(item => 
            `<option value="${item.name}">${item.text || item.name}</option>`
        ).join('');
    }

    /**
     * Obtiene los valores seleccionados de un multi-select
     */
    function getSelectedValues(selectId) {
        const select = document.getElementById(selectId);
        return Array.from(select.selectedOptions).map(opt => opt.value);
    }

    /**
     * Carga la vista previa de los datos
     */
    async function loadPreview() {
        if (!selectedEndpoint) {
            alert('Selecciona un endpoint primero');
            return;
        }

        const previewSection = document.getElementById('preview-section');
        const previewContainer = document.getElementById('data-preview');
        const previewInfo = document.getElementById('preview-info');
        const btnInsert = document.getElementById('btn-insert');

        previewSection.style.display = 'block';
        previewContainer.innerHTML = '<div class="loading">⏳ Cargando datos...</div>';
        btnInsert.disabled = true;

        try {
            const options = {
                rowDimensions: getSelectedValues('select-rows'),
                columnDimensions: [],
                selectedKeyFigures: getSelectedValues('select-values'),
                filterDimensions: []
            };

            console.log('[BIW] Ejecutando query con opciones:', options);

            const result = await biwClient.executeQueryMDX(selectedEndpoint.name, options);
            
            currentData = result.data || [];
            currentHierarchy = result.hierarchyInfo || { hierarchy: {}, parentColumns: [] };

            if (currentData.length === 0) {
                previewContainer.innerHTML = '<div class="error">No hay datos disponibles</div>';
                return;
            }

            // Mostrar info
            previewInfo.textContent = `📋 ${currentData.length} registros cargados`;

            // Generar tabla preview
            const headers = Object.keys(currentData[0]);
            const previewRows = currentData.slice(0, 10);
            
            let html = '<table class="preview-table"><thead><tr>';
            headers.forEach(h => { html += `<th>${h}</th>`; });
            html += '</tr></thead><tbody>';
            
            previewRows.forEach(row => {
                html += '<tr>';
                headers.forEach(h => {
                    const val = row[h];
                    html += `<td>${val !== null && val !== undefined ? val : ''}</td>`;
                });
                html += '</tr>';
            });
            
            html += '</tbody></table>';
            if (currentData.length > 10) {
                html += `<div style="padding:4px;color:#666;font-size:10px;">... y ${currentData.length - 10} registros más</div>`;
            }
            
            previewContainer.innerHTML = html;
            btnInsert.disabled = false;

        } catch (error) {
            console.error('[BIW] Error en preview:', error);
            previewContainer.innerHTML = `<div class="error">Error: ${error.message}</div>`;
        }
    }

    /**
     * Inserta los datos en una nueva hoja
     */
    async function insertData() {
        if (!currentData || currentData.length === 0) {
            alert('No hay datos para insertar');
            return;
        }

        const btnInsert = document.getElementById('btn-insert');
        btnInsert.disabled = true;
        btnInsert.innerHTML = '⏳ Insertando...';

        try {
            const timestamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, '');
            const sheetName = `BIW_${selectedEndpoint.name}_${timestamp}`.substring(0, 31);
            const enableHierarchy = document.getElementById('enable-hierarchy').checked;

            console.log('[BIW] Insertando datos:', {
                rows: currentData.length,
                sheetName: sheetName,
                hierarchy: enableHierarchy
            });

            // Usar pivot builder para insertar
            await pivotBuilder.insertInNewSheet(currentData, sheetName, 
                enableHierarchy ? currentHierarchy : null);

            btnInsert.innerHTML = '✅ ¡Insertado!';
            
            setTimeout(() => {
                btnInsert.innerHTML = '⬇️ Insertar en Nueva Hoja';
                btnInsert.disabled = false;
            }, 2000);

        } catch (error) {
            console.error('[BIW] Error insertando:', error);
            alert('Error al insertar: ' + error.message);
            btnInsert.innerHTML = '⬇️ Insertar en Nueva Hoja';
            btnInsert.disabled = false;
        }
    }

    /**
     * Manejador de eventos del toolbar
     */
    window.Asc.plugin.onToolbarMenuClick = function(id) {
        console.log('[BIW] Toolbar click:', id);
        // El plugin ya está visible como panel, no necesitamos hacer nada
    };

    /**
     * Manejador del menú contextual
     */
    window.Asc.plugin.onContextMenuClick = function(id) {
        console.log('[BIW] Context menu click:', id);
    };

    // Handlers requeridos
    window.Asc.plugin.button = function(id) {
        if (id === -1) {
            window.Asc.plugin.executeCommand("close", "");
        }
    };

    window.Asc.plugin.onExternalMouseUp = function() {};
    window.Asc.plugin.onTranslate = function() {};
    window.Asc.plugin.onThemeChanged = function() {};

})(window);
