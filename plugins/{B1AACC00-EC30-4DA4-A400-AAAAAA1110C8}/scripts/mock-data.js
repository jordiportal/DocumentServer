/**
 * Mock Data — Static datasets for development and testing.
 * Two catalogs: "Ventas" (simulates BIW) and "Produccion" (simulates Databricks).
 */

(function(window) {
    'use strict';

    const MOCK_SOURCES = [
        {
            name: 'ventas/ventas_por_segmento',
            description: 'Ventas por Segmento de Mercado',
            catalog: 'Ventas',
            lastUpdate: '20260421'
        },
        {
            name: 'ventas/ventas_por_cliente',
            description: 'Ventas por Cliente',
            catalog: 'Ventas',
            lastUpdate: '20260421'
        },
        {
            name: 'produccion/produccion_mensual',
            description: 'Producción Mensual por Línea',
            catalog: 'Produccion',
            lastUpdate: '20260420'
        }
    ];

    const MOCK_METADATA = {
        'ventas/ventas_por_segmento': {
            dimensions: [
                { name: 'ZSEGMEN', caption: 'Segmento' },
                { name: 'ZPAIS', caption: 'País' },
                { name: 'ZREGION', caption: 'Región' },
                { name: 'ZCIUDAD', caption: 'Ciudad' },
                { name: '0CALYEAR', caption: 'Año' },
                { name: '0CALMONTH', caption: 'Mes' },
                { name: '0CALWEEK', caption: 'Semana' }
            ],
            measures: [
                { name: 'ZVNETAEST', caption: 'Venta Neta', dataType: 'N', unit: 'EUR', decimals: 2 },
                { name: 'ZMARGEN', caption: 'Margen', dataType: 'N', unit: 'EUR', decimals: 2 },
                { name: 'ZUNIDADES', caption: 'Unidades', dataType: 'I', unit: 'uds', decimals: 0 },
                { name: 'ZPCT_MARGEN', caption: '% Margen', dataType: 'N', unit: '%', decimals: 2 }
            ],
            hierarchies: [
                {
                    name: 'HGEO',
                    caption: 'Geografía',
                    levels: [
                        { name: 'ZREGION', caption: 'Región', dimensionRef: 'ZREGION' },
                        { name: 'ZPAIS', caption: 'País', dimensionRef: 'ZPAIS' },
                        { name: 'ZCIUDAD', caption: 'Ciudad', dimensionRef: 'ZCIUDAD' }
                    ]
                },
                {
                    name: 'HTIME',
                    caption: 'Tiempo',
                    levels: [
                        { name: '0CALYEAR', caption: 'Año', dimensionRef: '0CALYEAR' },
                        { name: '0CALMONTH', caption: 'Mes', dimensionRef: '0CALMONTH' },
                        { name: '0CALWEEK', caption: 'Semana', dimensionRef: '0CALWEEK' }
                    ]
                }
            ],
            dimensionGroups: [
                {
                    name: 'TIME',
                    caption: 'Tiempo',
                    icon: 'calendar',
                    fields: [
                        { name: '0CALYEAR', caption: 'Año', type: 'level' },
                        { name: '0CALMONTH', caption: 'Mes', type: 'level' },
                        { name: '0CALWEEK', caption: 'Semana', type: 'level' }
                    ],
                    hierarchy: { name: 'HTIME', caption: 'Tiempo', levels: ['0CALYEAR', '0CALMONTH', '0CALWEEK'] }
                },
                {
                    name: 'GEO',
                    caption: 'Geografía',
                    icon: 'globe',
                    fields: [
                        { name: 'ZREGION', caption: 'Región', type: 'level' },
                        { name: 'ZPAIS', caption: 'País', type: 'level' },
                        { name: 'ZCIUDAD', caption: 'Ciudad', type: 'level' }
                    ],
                    hierarchy: { name: 'HGEO', caption: 'Geografía', levels: ['ZREGION', 'ZPAIS', 'ZCIUDAD'] }
                },
                {
                    name: 'MARKET',
                    caption: 'Mercado',
                    icon: 'tag',
                    fields: [
                        { name: 'ZSEGMEN', caption: 'Segmento', type: 'attribute' }
                    ]
                }
            ],
            initialFilters: [
                { dimension: '0CALYEAR', caption: 'Año', required: true },
                { dimension: 'ZREGION', caption: 'Región', required: false }
            ]
        },
        'ventas/ventas_por_cliente': {
            dimensions: [
                { name: 'ZCLIENTE', caption: 'Cliente' },
                { name: 'ZSEGMEN', caption: 'Segmento' },
                { name: '0CALMONTH', caption: 'Mes' }
            ],
            measures: [
                { name: 'ZVNETAEST', caption: 'Venta Neta', dataType: 'N', unit: 'EUR', decimals: 2 },
                { name: 'ZDESCUENTO', caption: 'Descuento', dataType: 'N', unit: '%', decimals: 2 },
                { name: 'ZMARGEN', caption: 'Margen', dataType: 'N', unit: 'EUR', decimals: 2 }
            ],
            initialFilters: [
                { dimension: 'ZSEGMEN', caption: 'Segmento', required: true },
                { dimension: '0CALMONTH', caption: 'Mes', required: false }
            ]
        },
        'produccion/produccion_mensual': {
            dimensions: [
                { name: 'ZLINEA', caption: 'Línea Producción' },
                { name: 'ZMES', caption: 'Mes' },
                { name: 'ZTURNO', caption: 'Turno' }
            ],
            measures: [
                { name: 'ZUNID_PROD', caption: 'Unidades Producidas', dataType: 'I', unit: 'uds', decimals: 0 },
                { name: 'ZCOSTE', caption: 'Coste Total', dataType: 'N', unit: 'EUR', decimals: 2 },
                { name: 'ZEFICIENCIA', caption: 'Eficiencia %', dataType: 'N', unit: '%', decimals: 2 },
                { name: 'ZMERMA', caption: 'Merma %', dataType: 'N', unit: '%', decimals: 2 }
            ],
            initialFilters: [
                { dimension: 'ZLINEA', caption: 'Línea Producción', required: true },
                { dimension: 'ZMES', caption: 'Mes', required: false }
            ]
        }
    };

    const MOCK_DIMENSION_VALUES = {
        'ventas/ventas_por_segmento': {
            ZSEGMEN: [
                { code: 'NAC', caption: 'Nacional' },
                { code: 'INT', caption: 'Internacional' },
                { code: 'ONL', caption: 'Online' },
                { code: 'IND', caption: 'Industrial' }
            ],
            ZPAIS: [
                { code: 'ES', caption: 'España' },
                { code: 'FR', caption: 'Francia' },
                { code: 'DE', caption: 'Alemania' },
                { code: 'UK', caption: 'Reino Unido' },
                { code: 'US', caption: 'Estados Unidos' },
                { code: 'CA', caption: 'Canadá' },
                { code: 'MX', caption: 'México' },
                { code: 'BR', caption: 'Brasil' },
                { code: 'JP', caption: 'Japón' },
                { code: 'CN', caption: 'China' }
            ],
            ZREGION: [
                { code: 'EUR', caption: 'Europa' },
                { code: 'NAM', caption: 'Norteamérica' },
                { code: 'LATAM', caption: 'Latinoamérica' },
                { code: 'APAC', caption: 'Asia-Pacífico' }
            ],
            ZCIUDAD: [
                { code: 'MAD', caption: 'Madrid' },
                { code: 'BCN', caption: 'Barcelona' },
                { code: 'PAR', caption: 'París' },
                { code: 'LYO', caption: 'Lyon' },
                { code: 'BER', caption: 'Berlín' },
                { code: 'MUN', caption: 'Múnich' },
                { code: 'LON', caption: 'Londres' },
                { code: 'MAN', caption: 'Manchester' },
                { code: 'NYC', caption: 'Nueva York' },
                { code: 'LAX', caption: 'Los Ángeles' },
                { code: 'TOR', caption: 'Toronto' },
                { code: 'VAN', caption: 'Vancouver' },
                { code: 'MEX', caption: 'Ciudad de México' },
                { code: 'GDL', caption: 'Guadalajara' },
                { code: 'SAO', caption: 'São Paulo' },
                { code: 'RIO', caption: 'Río de Janeiro' },
                { code: 'TKY', caption: 'Tokio' },
                { code: 'OSK', caption: 'Osaka' },
                { code: 'SHA', caption: 'Shanghái' },
                { code: 'BEI', caption: 'Pekín' }
            ],
            '0CALYEAR': [
                { code: '2024', caption: '2024' },
                { code: '2025', caption: '2025' },
                { code: '2026', caption: '2026' }
            ],
            '0CALMONTH': [
                { code: '202601', caption: 'Enero 2026' },
                { code: '202602', caption: 'Febrero 2026' },
                { code: '202603', caption: 'Marzo 2026' },
                { code: '202604', caption: 'Abril 2026' }
            ],
            '0CALWEEK': [
                { code: '202601', caption: 'Sem 01' },
                { code: '202602', caption: 'Sem 02' },
                { code: '202603', caption: 'Sem 03' },
                { code: '202604', caption: 'Sem 04' },
                { code: '202610', caption: 'Sem 10' },
                { code: '202615', caption: 'Sem 15' }
            ]
        },
        'ventas/ventas_por_cliente': {
            ZCLIENTE: [
                { code: 'C001', caption: 'Industrias García S.L.' },
                { code: 'C002', caption: 'Distribuciones López' },
                { code: 'C003', caption: 'Comercial Martínez' },
                { code: 'C004', caption: 'Grupo Fernández' },
                { code: 'C005', caption: 'Export Trading Co.' },
                { code: 'C006', caption: 'Almacenes del Norte' },
                { code: 'C007', caption: 'Suministros Técnicos' },
                { code: 'C008', caption: 'Cadena Sur' },
                { code: 'C009', caption: 'BioProducts Int.' },
                { code: 'C010', caption: 'EcoDistribución' }
            ],
            ZSEGMEN: [
                { code: 'NAC', caption: 'Nacional' },
                { code: 'INT', caption: 'Internacional' },
                { code: 'ONL', caption: 'Online' }
            ],
            '0CALMONTH': [
                { code: '202601', caption: 'Enero 2026' },
                { code: '202602', caption: 'Febrero 2026' },
                { code: '202603', caption: 'Marzo 2026' },
                { code: '202604', caption: 'Abril 2026' }
            ]
        },
        'produccion/produccion_mensual': {
            ZLINEA: [
                { code: 'L1', caption: 'Línea Líquidos' },
                { code: 'L2', caption: 'Línea Sólidos' },
                { code: 'L3', caption: 'Línea Aerosoles' },
                { code: 'L4', caption: 'Línea Envasado' }
            ],
            ZMES: [
                { code: '01', caption: 'Enero' },
                { code: '02', caption: 'Febrero' },
                { code: '03', caption: 'Marzo' },
                { code: '04', caption: 'Abril' },
                { code: '05', caption: 'Mayo' },
                { code: '06', caption: 'Junio' },
                { code: '07', caption: 'Julio' },
                { code: '08', caption: 'Agosto' },
                { code: '09', caption: 'Septiembre' },
                { code: '10', caption: 'Octubre' },
                { code: '11', caption: 'Noviembre' },
                { code: '12', caption: 'Diciembre' }
            ],
            ZTURNO: [
                { code: 'M', caption: 'Mañana' },
                { code: 'T', caption: 'Tarde' },
                { code: 'N', caption: 'Noche' }
            ]
        }
    };

    // Parent-child relationships for hierarchies
    const HIERARCHY_RELATIONS = {
        'ventas/ventas_por_segmento': {
            // ZREGION → ZPAIS (which countries belong to which region)
            'ZREGION>ZPAIS': {
                'EUR': ['ES', 'FR', 'DE', 'UK'],
                'NAM': ['US', 'CA'],
                'LATAM': ['MX', 'BR'],
                'APAC': ['JP', 'CN']
            },
            // ZPAIS → ZCIUDAD (which cities belong to which country)
            'ZPAIS>ZCIUDAD': {
                'ES': ['MAD', 'BCN'],
                'FR': ['PAR', 'LYO'],
                'DE': ['BER', 'MUN'],
                'UK': ['LON', 'MAN'],
                'US': ['NYC', 'LAX'],
                'CA': ['TOR', 'VAN'],
                'MX': ['MEX', 'GDL'],
                'BR': ['SAO', 'RIO'],
                'JP': ['TKY', 'OSK'],
                'CN': ['SHA', 'BEI']
            }
        }
    };

    function seededRandom(seed) {
        let s = seed;
        return function() {
            s = (s * 16807 + 0) % 2147483647;
            return (s - 1) / 2147483646;
        };
    }

    function generateQueryData(sourceName, dimensions, measures, filters) {
        const meta = MOCK_METADATA[sourceName];
        const dimValues = MOCK_DIMENSION_VALUES[sourceName];
        if (!meta || !dimValues) return [];

        const activeDims = (dimensions && dimensions.length > 0)
            ? dimensions
            : [meta.dimensions[0].name];

        const activeMeasures = (measures && measures.length > 0)
            ? measures
            : meta.measures.map(m => m.name);

        const relations = HIERARCHY_RELATIONS[sourceName] || {};

        const dimMembers = activeDims.map(d => {
            let members = dimValues[d] || [];
            if (filters) {
                const f = filters.find(f => f.dimension === d);
                if (f && f.values && f.values.length > 0) {
                    members = members.filter(m => f.values.includes(m.code));
                }
            }
            return { dim: d, members };
        });

        const rows = [];
        const rng = seededRandom(sourceName.length * 1000 + activeDims.length);

        function buildRows(dimIdx, currentRow, parentCodes) {
            if (dimIdx >= dimMembers.length) {
                const row = { ...currentRow };
                activeMeasures.forEach(mName => {
                    const mDef = meta.measures.find(m => m.name === mName);
                    const key = mDef ? mDef.caption : mName;
                    const decimals = mDef && mDef.decimals != null ? mDef.decimals : 2;
                    if (decimals === 0) {
                        row[key] = Math.round(rng() * 50000);
                    } else if (mDef && mDef.unit === '%') {
                        row[key] = Math.round(rng() * 6000) / 100;
                    } else {
                        row[key] = Math.round(rng() * 5000000) / 100;
                    }
                });
                rows.push(row);
                return;
            }

            const { dim, members } = dimMembers[dimIdx];
            const dimMeta = meta.dimensions.find(d => d.name === dim);
            const caption = dimMeta ? dimMeta.caption : dim;

            // Filter members by parent-child hierarchy relationships
            let filteredMembers = members;
            for (const parentDim of Object.keys(parentCodes)) {
                const relKey = parentDim + '>' + dim;
                if (relations[relKey]) {
                    const parentCode = parentCodes[parentDim];
                    const allowedCodes = relations[relKey][parentCode] || [];
                    if (allowedCodes.length > 0) {
                        filteredMembers = filteredMembers.filter(m => allowedCodes.includes(m.code));
                    }
                }
            }

            filteredMembers.forEach(member => {
                const next = { ...currentRow };
                next[caption] = member.caption;
                const nextParents = { ...parentCodes, [dim]: member.code };
                buildRows(dimIdx + 1, next, nextParents);
            });
        }

        buildRows(0, {}, {});
        return rows;
    }

    function generateColumns(sourceName, dimensions, measures) {
        const meta = MOCK_METADATA[sourceName];
        if (!meta) return [];

        const cols = [];
        const activeDims = (dimensions && dimensions.length > 0)
            ? dimensions
            : [meta.dimensions[0].name];

        activeDims.forEach(d => {
            const dimDef = meta.dimensions.find(dm => dm.name === d);
            cols.push({ name: d, caption: dimDef ? dimDef.caption : d, type: 'dimension' });
        });

        const activeMeasures = (measures && measures.length > 0)
            ? measures
            : meta.measures.map(m => m.name);

        activeMeasures.forEach(mName => {
            const mDef = meta.measures.find(m => m.name === mName);
            cols.push({ name: mName, caption: mDef ? mDef.caption : mName, type: 'measure' });
        });

        return cols;
    }

    window.MockData = {
        SOURCES: MOCK_SOURCES,
        METADATA: MOCK_METADATA,
        DIMENSION_VALUES: MOCK_DIMENSION_VALUES,
        HIERARCHY_RELATIONS: HIERARCHY_RELATIONS,
        generateQueryData,
        generateColumns
    };

})(window);
