/**
 * BIW Charts - Panel de Importación
 * Permite seleccionar datos BIW y crear gráficos para Presentation
 */
(function() {
    'use strict';

    // =========================================================================
    // ESTADO
    // =========================================================================

    let currentData = null;
    let previewChart = null;
    let selectedChartType = 'bar';
    let selectedDimension = null;
    let selectedMetrics = [];

    // Queries disponibles
    const AVAILABLE_QUERIES = [
        {
            name: 'MKT_CUENTA_RES_CP_OPT_DPCT',
            displayName: 'Cuenta de Resultados',
            description: 'Márgenes comerciales por versión'
        }
    ];

    // =========================================================================
    // ELEMENTOS DOM
    // =========================================================================

    const $ = id => document.getElementById(id);
    const statusIndicator = $('statusIndicator');
    const statusText = $('statusText');
    const serverUrl = $('serverUrl');
    const querySelect = $('querySelect');
    const btnLoadData = $('btnLoadData');
    const dimensionSelect = $('dimensionSelect');
    const metricsContainer = $('metricsContainer');
    const chartPreview = $('chartPreview');
    const previewCanvas = $('previewCanvas');
    const btnRefreshPreview = $('btnRefreshPreview');
    const btnInsert = $('btnInsert');
    const loader = $('loader');
    const loaderText = $('loaderText');

    // =========================================================================
    // INICIALIZACIÓN
    // =========================================================================

    function init() {
        applyTheme();
        populateQueries();
        setupEventListeners();
        connect();
    }

    function applyTheme() {
        if (window.Asc && window.Asc.plugin) {
            const theme = window.Asc.plugin.theme;
            if (theme) {
                const isDark = theme.type === 'dark' || 
                               theme.name?.includes('dark') || 
                               theme.name?.includes('contrast');
                
                document.body.classList.remove('theme-light', 'theme-dark');
                document.body.classList.add(isDark ? 'theme-dark' : 'theme-light');

                if (theme.colors) {
                    const root = document.documentElement;
                    Object.entries(theme.colors).forEach(([key, value]) => {
                        root.style.setProperty('--' + key.replace(/_/g, '-'), value);
                    });
                }
            }
        }
    }

    function populateQueries() {
        querySelect.innerHTML = AVAILABLE_QUERIES.map(q => 
            `<option value="${q.name}">${q.displayName}</option>`
        ).join('');
    }

    function setupEventListeners() {
        // Conexión
        serverUrl.addEventListener('change', connect);
        
        // Cargar datos
        btnLoadData.addEventListener('click', loadData);
        
        // Tipo de gráfico
        document.querySelectorAll('.chart-type-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                selectedChartType = this.dataset.type;
                updatePreview();
            });
        });

        // Dimensión
        dimensionSelect.addEventListener('change', function() {
            selectedDimension = this.value;
            updatePreview();
        });

        // Actualizar preview
        btnRefreshPreview.addEventListener('click', updatePreview);

        // Insertar gráfico
        btnInsert.addEventListener('click', insertChart);

        // Tema
        if (window.Asc && window.Asc.plugin) {
            window.Asc.plugin.onThemeChanged = applyTheme;
        }
    }

    // =========================================================================
    // CONEXIÓN
    // =========================================================================

    async function connect() {
        const url = serverUrl.value.trim();
        statusIndicator.className = 'status-indicator';
        statusText.textContent = 'Conectando...';

        try {
            const response = await fetch(url + '/api/bw-query/service-info');
            if (!response.ok) throw new Error('Servicio no disponible');

            const info = await response.json();
            statusIndicator.className = 'status-indicator connected';
            statusText.textContent = 'Conectado - ' + info.name;

        } catch (error) {
            statusIndicator.className = 'status-indicator error';
            statusText.textContent = 'Sin conexión';
            console.error('[BIW Charts] Error conexión:', error);
        }
    }

    // =========================================================================
    // CARGA DE DATOS
    // =========================================================================

    async function loadData() {
        const queryName = querySelect.value;
        if (!queryName) return;

        showLoader('Cargando datos de BIW...');

        try {
            const url = serverUrl.value.trim();
            const response = await fetch(url + '/api/bw-query/execute-mdx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ queryName })
            });

            if (!response.ok) throw new Error('Error ' + response.status);

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Error ejecutando query');
            }

            currentData = result.data || [];
            
            if (currentData.length === 0) {
                hideLoader();
                alert('La query no devolvió datos');
                return;
            }

            // Poblar selectores
            populateSelectors();
            
            // Actualizar preview
            updatePreview();

            // Habilitar botones
            btnRefreshPreview.disabled = false;
            btnInsert.disabled = false;

        } catch (error) {
            console.error('[BIW Charts] Error cargando datos:', error);
            alert('Error: ' + error.message);
        }

        hideLoader();
    }

    function populateSelectors() {
        if (!currentData || currentData.length === 0) return;

        const columns = Object.keys(currentData[0]);
        
        // Separar dimensiones (texto) de métricas (números)
        const dimensions = [];
        const metrics = [];

        columns.forEach(col => {
            const firstValue = currentData[0][col];
            if (typeof firstValue === 'number') {
                metrics.push(col);
            } else {
                dimensions.push(col);
            }
        });

        // Poblar selector de dimensión
        dimensionSelect.innerHTML = '<option value="">Seleccionar categoría...</option>' +
            dimensions.map(d => `<option value="${d}">${d}</option>`).join('');

        // Poblar métricas con checkboxes
        metricsContainer.innerHTML = metrics.map(m => `
            <label style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; cursor: pointer;">
                <input type="checkbox" class="metric-checkbox" value="${m}" checked>
                <span style="font-size: 10px; color: var(--text-primary);">${m}</span>
            </label>
        `).join('');

        // Seleccionar primera dimensión por defecto
        if (dimensions.length > 0) {
            dimensionSelect.value = dimensions[0];
            selectedDimension = dimensions[0];
        }

        // Seleccionar primeras métricas
        selectedMetrics = metrics.slice(0, 3); // Máximo 3 por defecto

        // Event listeners para checkboxes
        document.querySelectorAll('.metric-checkbox').forEach((cb, idx) => {
            cb.checked = idx < 3; // Solo las 3 primeras
            cb.addEventListener('change', function() {
                updateSelectedMetrics();
                updatePreview();
            });
        });
    }

    function updateSelectedMetrics() {
        selectedMetrics = [];
        document.querySelectorAll('.metric-checkbox:checked').forEach(cb => {
            selectedMetrics.push(cb.value);
        });
    }

    // =========================================================================
    // VISTA PREVIA
    // =========================================================================

    function updatePreview() {
        if (!currentData || !selectedDimension || selectedMetrics.length === 0) {
            return;
        }

        // Preparar datos para Chart.js
        const categories = currentData.map(row => row[selectedDimension]);
        const datasets = selectedMetrics.map((metric, idx) => ({
            label: metric,
            data: currentData.map(row => row[metric] || 0),
            backgroundColor: getColor(idx, 0.7),
            borderColor: getColor(idx, 1),
            borderWidth: 1
        }));

        // Destruir gráfico anterior si existe
        if (previewChart) {
            previewChart.destroy();
        }

        // Configuración según tipo de gráfico
        const config = {
            type: selectedChartType === 'bar' ? 'bar' : selectedChartType,
            data: {
                labels: categories.slice(0, 10), // Limitar a 10 categorías en preview
                datasets: datasets.map(ds => ({
                    ...ds,
                    data: ds.data.slice(0, 10)
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: { size: 9 },
                            boxWidth: 12
                        }
                    }
                },
                scales: selectedChartType === 'pie' ? {} : {
                    x: {
                        ticks: { font: { size: 8 }, maxRotation: 45 }
                    },
                    y: {
                        ticks: { font: { size: 8 } }
                    }
                }
            }
        };

        // Crear gráfico
        const ctx = previewCanvas.getContext('2d');
        previewChart = new Chart(ctx, config);
    }

    function getColor(index, alpha) {
        const colors = [
            `rgba(68, 104, 147, ${alpha})`,
            `rgba(90, 159, 212, ${alpha})`,
            `rgba(122, 184, 232, ${alpha})`,
            `rgba(255, 152, 0, ${alpha})`,
            `rgba(76, 175, 80, ${alpha})`,
            `rgba(244, 67, 54, ${alpha})`
        ];
        return colors[index % colors.length];
    }

    // =========================================================================
    // INSERCIÓN DE GRÁFICO
    // =========================================================================

    function insertChart() {
        if (!currentData || !selectedDimension || selectedMetrics.length === 0) {
            alert('Configura el gráfico primero');
            return;
        }

        showLoader('Insertando gráfico...');

        // Preparar datos en formato para OnlyOffice
        const categories = currentData.map(row => String(row[selectedDimension]));
        const series = selectedMetrics.map(metric => 
            currentData.map(row => Number(row[metric]) || 0)
        );
        const seriesNames = selectedMetrics;

        // Mapear tipo de gráfico a OnlyOffice
        const chartTypeMap = {
            'bar': 'bar',
            'line': 'line',
            'pie': 'pie'
        };

        const chartType = chartTypeMap[selectedChartType] || 'bar';
        const chartTitle = querySelect.options[querySelect.selectedIndex]?.text || 'Gráfico BIW';

        console.log('[BIW Charts] Insertando gráfico:', { chartType, categories, series, seriesNames });

        // Guardar datos en scope para el callCommand
        Asc.scope.chartType = chartType;
        Asc.scope.series = JSON.stringify(series);
        Asc.scope.seriesNames = JSON.stringify(seriesNames);
        Asc.scope.categories = JSON.stringify(categories);
        Asc.scope.chartTitle = chartTitle;

        // Insertar gráfico directamente con callCommand
        window.Asc.plugin.callCommand(function() {
            var chartType = Asc.scope.chartType;
            var series = JSON.parse(Asc.scope.series);
            var seriesNames = JSON.parse(Asc.scope.seriesNames);
            var categories = JSON.parse(Asc.scope.categories);
            var chartTitle = Asc.scope.chartTitle;

            // Tamaños en EMU (English Metric Units)
            var chartWidth = 7200000;  // ~200mm
            var chartHeight = 4320000; // ~120mm

            // Obtener presentación y slide actual
            var oPresentation = Api.GetPresentation();
            var oSlide = oPresentation.GetCurrentSlide();

            if (!oSlide) {
                return { success: false, error: 'No hay slide activo' };
            }

            // Crear el gráfico
            var oChart = Api.CreateChart(
                chartType,
                series,
                seriesNames,
                categories,
                chartWidth,
                chartHeight,
                2 // styleIndex
            );

            if (!oChart) {
                return { success: false, error: 'Error creando gráfico' };
            }

            // Configurar título
            oChart.SetTitle(chartTitle, 12, false);

            // Centrar el gráfico en el slide
            var slideWidth = 9144000;
            var slideHeight = 6858000;
            var posX = (slideWidth - chartWidth) / 2;
            var posY = (slideHeight - chartHeight) / 2;
            oChart.SetPosition(posX, posY);

            // Añadir al slide
            oSlide.AddObject(oChart);

            return { success: true };

        }, false, false, function(result) {
            hideLoader();
            if (result && result.success) {
                console.log('[BIW Charts] Gráfico insertado correctamente');
            } else {
                console.error('[BIW Charts] Error:', result);
                alert('Error insertando gráfico: ' + (result?.error || 'desconocido'));
            }
        });
    }

    // =========================================================================
    // LOADER
    // =========================================================================

    function showLoader(text) {
        loaderText.textContent = text || 'Cargando...';
        loader.classList.remove('hidden');
    }

    function hideLoader() {
        loader.classList.add('hidden');
    }

    // =========================================================================
    // PLUGIN HOOKS
    // =========================================================================

    if (window.Asc && window.Asc.plugin) {
        window.Asc.plugin.init = function() {
            init();
        };

        window.Asc.plugin.button = function(id) {
            // id === 0 es el primer botón (Cerrar), -1 es cerrar
            if (id === -1 || id === 0) {
                window.Asc.plugin.executeMethod("CloseWindow");
            }
        };
    } else {
        // Modo desarrollo sin plugin
        document.addEventListener('DOMContentLoaded', init);
    }

})();
