/**
 * BIW Charts Plugin - Background Service
 * Plugin para crear gráficos en Presentation desde datos de SAP BW
 */
(function(window, undefined) {
    'use strict';

    // =========================================================================
    // CONSTANTES
    // =========================================================================
    const PLUGIN_NAME = 'BIW Charts';
    const PLUGIN_GUID = 'asc.{B1AACC00-EC30-4DA4-A400-AAAAAA1110C6}';
    
    // Configuración
    let currentWindow = null;
    let chartData = null;

    // =========================================================================
    // ICONOS SVG
    // =========================================================================
    
    // Icono para tema claro
    const ICON_LIGHT = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="#444" stroke-width="1.5"/>
        <rect x="6" y="14" width="3" height="5" fill="#446893"/>
        <rect x="10.5" y="10" width="3" height="9" fill="#5a9fd4"/>
        <rect x="15" y="6" width="3" height="13" fill="#7ab8e8"/>
    </svg>`;

    // Icono para tema oscuro
    const ICON_DARK = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="#ccc" stroke-width="1.5"/>
        <rect x="6" y="14" width="3" height="5" fill="#5a9fd4"/>
        <rect x="10.5" y="10" width="3" height="9" fill="#7ab8e8"/>
        <rect x="15" y="6" width="3" height="13" fill="#a8d4f0"/>
    </svg>`;

    // =========================================================================
    // INICIALIZACIÓN DEL PLUGIN
    // =========================================================================

    window.Asc.plugin.init = function() {
        console.log('[BIW Charts] Background service iniciado');
        registerToolbar();
    };

    // =========================================================================
    // REGISTRO DE TOOLBAR
    // =========================================================================

    function registerToolbar() {
        console.log('[BIW Charts] Registrando toolbar...');

        // Patrón de iconos con soporte para temas light/dark
        const iconPattern = 'resources/icon.svg';

        // Usar executeMethod("AddToolbarMenuItem") que es compatible con todos los editores
        window.Asc.plugin.executeMethod("AddToolbarMenuItem", [{
            guid: PLUGIN_GUID,
            tabs: [{
                id: "BIWChartsTab",
                text: "BIW Charts",
                items: [
                    {
                        id: "biw_charts_import",
                        type: "button",
                        text: "Insertar Gráfico",
                        hint: "Crear gráfico desde datos BIW",
                        icons: iconPattern,
                        lockInViewMode: true
                    }
                ]
            }]
        }], function(result) {
            console.log('[BIW Charts] Toolbar registrado:', result);
        });
    }

    // =========================================================================
    // EVENTOS DE TOOLBAR
    // =========================================================================

    window.Asc.plugin.onToolbarMenuClick = function(item) {
        console.log('[BIW Charts] Toolbar click:', item);

        if (!item || !item.id) return;

        switch(item.id) {
            case 'biw_charts_import':
                openImportWindow();
                break;
        }
    };

    // =========================================================================
    // GESTIÓN DE VENTANAS
    // =========================================================================

    function openImportWindow() {
        console.log('[BIW Charts] Abriendo ventana de importación...');

        if (currentWindow) {
            try { currentWindow.close(); } catch(e) {}
        }

        currentWindow = new window.Asc.PluginWindow();

        currentWindow.attachEvent("onClose", function() {
            console.log('[BIW Charts] Ventana cerrada');
            currentWindow = null;
        });

        currentWindow.show({
            url: './index.html',
            description: 'Insertar Gráfico BIW',
            isVisual: true,
            buttons: [],
            isModal: false,
            EditorsSupport: ["slide"],
            size: [400, 680]
        });
    }

    // =========================================================================
    // EVENTO DE INSERCIÓN DE GRÁFICO
    // =========================================================================

    window.Asc.plugin.attachEvent("onInsertChart", function(data) {
        console.log('[BIW Charts] Recibido evento onInsertChart:', data);

        if (!data || !data.series || !data.categories) {
            console.error('[BIW Charts] Datos inválidos para crear gráfico');
            return;
        }

        insertChartToSlide(data);
    });

    // =========================================================================
    // INSERCIÓN DE GRÁFICO EN SLIDE
    // =========================================================================

    function insertChartToSlide(data) {
        console.log('[BIW Charts] Insertando gráfico en slide...');

        // Preparar datos para el scope
        Asc.scope.chartType = data.chartType || 'bar';
        Asc.scope.series = JSON.stringify(data.series);
        Asc.scope.seriesNames = JSON.stringify(data.seriesNames || []);
        Asc.scope.categories = JSON.stringify(data.categories);
        Asc.scope.chartTitle = data.title || 'Gráfico BIW';
        Asc.scope.chartWidth = data.width || 7200000;  // EMU (200mm aprox)
        Asc.scope.chartHeight = data.height || 4320000; // EMU (120mm aprox)
        Asc.scope.styleIndex = data.styleIndex || 2;

        window.Asc.plugin.callCommand(function() {
            var chartType = Asc.scope.chartType;
            var series = JSON.parse(Asc.scope.series);
            var seriesNames = JSON.parse(Asc.scope.seriesNames);
            var categories = JSON.parse(Asc.scope.categories);
            var chartTitle = Asc.scope.chartTitle;
            var chartWidth = Asc.scope.chartWidth;
            var chartHeight = Asc.scope.chartHeight;
            var styleIndex = Asc.scope.styleIndex;

            // Obtener presentación y slide actual
            var oPresentation = Api.GetPresentation();
            var oSlide = oPresentation.GetCurrentSlide();

            if (!oSlide) {
                console.error('No hay slide activo');
                return { success: false, error: 'No hay slide activo' };
            }

            // Crear el gráfico
            // Api.CreateChart(sType, aSeries, aSeriesNames, aCatNames, nWidth, nHeight, nStyleIndex)
            var oChart = Api.CreateChart(
                chartType,
                series,
                seriesNames,
                categories,
                chartWidth,
                chartHeight,
                styleIndex
            );

            if (!oChart) {
                console.error('Error creando gráfico');
                return { success: false, error: 'Error creando gráfico' };
            }

            // Configurar título si es necesario
            if (chartTitle) {
                oChart.SetTitle(chartTitle, 12, false);
            }

            // Posicionar el gráfico centrado en el slide
            // Los slides estándar son 9144000 EMU x 6858000 EMU (254mm x 190.5mm)
            var slideWidth = 9144000;
            var slideHeight = 6858000;
            var posX = (slideWidth - chartWidth) / 2;
            var posY = (slideHeight - chartHeight) / 2;

            oChart.SetPosition(posX, posY);

            // Añadir el gráfico al slide
            var result = oSlide.AddObject(oChart);

            return { success: result, message: 'Gráfico insertado' };

        }, false, false, function(result) {
            console.log('[BIW Charts] Resultado inserción:', result);
            
            if (currentWindow) {
                currentWindow.command("insertComplete", result);
            }
        });
    }

    // =========================================================================
    // UTILIDADES
    // =========================================================================

    function checkDarkTheme() {
        if (window.Asc && window.Asc.plugin && window.Asc.plugin.theme) {
            var theme = window.Asc.plugin.theme;
            return theme.type === 'dark' || 
                   (theme.name && theme.name.toLowerCase().includes('dark'));
        }
        return false;
    }

    // Actualizar toolbar cuando cambie el tema
    window.Asc.plugin.onThemeChanged = function(theme) {
        console.log('[BIW Charts] Tema cambiado');
        registerToolbar();
    };

    // =========================================================================
    // BUTTON HANDLER
    // =========================================================================

    window.Asc.plugin.button = function(id) {
        // No hay botones en el background
    };

})(window);
