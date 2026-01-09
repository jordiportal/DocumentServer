/**
 * Pivot Builder - Inserta datos del BIW en ONLYOFFICE Spreadsheet
 * Utiliza la API de ONLYOFFICE para crear tablas y tablas dinámicas
 */

(function(window) {
    'use strict';

    /**
     * Constructor de tablas dinámicas para ONLYOFFICE
     */
    class PivotBuilder {
        constructor() {
            this.lastInsertedRange = null;
        }

        /**
         * Inserta datos como una tabla simple en la hoja activa
         * @param {Array} data - Array de objetos con los datos
         * @param {Object} options - Opciones de inserción
         * @returns {Promise<Object>} Resultado de la inserción
         */
        async insertAsTable(data, options = {}) {
            return new Promise((resolve, reject) => {
                if (!data || data.length === 0) {
                    reject(new Error('No hay datos para insertar'));
                    return;
                }

                const startCol = options.startCol || 0;  // Columna A = 0
                const startRow = options.startRow || 0;  // Fila 1 = 0
                const includeHeaders = options.includeHeaders !== false;
                const formatAsTable = options.formatAsTable !== false;
                const tableName = options.tableName || 'BIW_Data';

                // Obtener las columnas (keys) del primer objeto
                const columns = Object.keys(data[0]);
                const numCols = columns.length;
                const numRows = data.length + (includeHeaders ? 1 : 0);

                // Preparar los datos para ONLYOFFICE
                const cellData = [];

                // Headers
                if (includeHeaders) {
                    columns.forEach((col, colIndex) => {
                        cellData.push({
                            row: startRow,
                            col: startCol + colIndex,
                            value: col,
                            isBold: true,
                            bgColor: '#4472C4',
                            fontColor: '#FFFFFF'
                        });
                    });
                }

                // Data rows
                data.forEach((rowData, rowIndex) => {
                    const actualRow = startRow + (includeHeaders ? 1 : 0) + rowIndex;
                    columns.forEach((col, colIndex) => {
                        const value = rowData[col];
                        cellData.push({
                            row: actualRow,
                            col: startCol + colIndex,
                            value: value,
                            isNumeric: typeof value === 'number'
                        });
                    });
                });

                // Ejecutar la inserción usando la API de ONLYOFFICE
                try {
                    Asc.scope.cellData = JSON.stringify(cellData);
                    Asc.scope.startCol = startCol;
                    Asc.scope.numCols = numCols;
                    
                    window.Asc.plugin.callCommand(function() {
                        var oWorksheet = Api.GetActiveSheet();
                        var cellDataStr = Asc.scope.cellData;
                        var cellDataArr = JSON.parse(cellDataStr);
                        
                        // Insertar cada celda
                        for (var i = 0; i < cellDataArr.length; i++) {
                            var cell = cellDataArr[i];
                            var oRange = oWorksheet.GetRangeByNumber(cell.row, cell.col);
                            
                            // Establecer valor
                            if (cell.isNumeric && !isNaN(cell.value)) {
                                oRange.SetValue(Number(cell.value));
                            } else {
                                oRange.SetValue(cell.value !== null && cell.value !== undefined ? String(cell.value) : '');
                            }
                            
                            // Aplicar formato a headers
                            if (cell.isBold) {
                                oRange.SetBold(true);
                                if (cell.bgColor) {
                                    oRange.SetFillColor(Api.CreateColorFromRGB(68, 114, 196));
                                }
                                if (cell.fontColor) {
                                    oRange.SetFontColor(Api.CreateColorFromRGB(255, 255, 255));
                                }
                            }
                        }
                        
                        return "success";
                    }, false, false, function(result) {
                        console.log('[PivotBuilder] callCommand result:', result);
                        resolve({
                            success: true,
                            range: {
                                startRow: startRow,
                                startCol: startCol,
                                endRow: startRow + numRows - 1,
                                endCol: startCol + numCols - 1
                            },
                            rowCount: data.length,
                            colCount: numCols
                        });
                    });
                } catch (err) {
                    console.error('[PivotBuilder] Error in callCommand:', err);
                    reject(err);
                }
            });
        }

        /**
         * Inserta datos y crea una tabla dinámica (Pivot Table)
         * @param {Array} data - Array de objetos con los datos
         * @param {Object} pivotConfig - Configuración del pivot
         * @returns {Promise<Object>} Resultado de la creación
         */
        async insertAsPivotTable(data, pivotConfig = {}) {
            return new Promise(async (resolve, reject) => {
                try {
                    // Primero insertar los datos como tabla base
                    const tableResult = await this.insertAsTable(data, {
                        startCol: 0,
                        startRow: 0,
                        includeHeaders: true,
                        formatAsTable: true,
                        tableName: 'BIW_Source'
                    });

                    // Calcular el rango de datos
                    const columns = Object.keys(data[0]);
                    const dataRange = this._getRangeString(
                        tableResult.range.startCol,
                        tableResult.range.startRow,
                        tableResult.range.endCol,
                        tableResult.range.endRow
                    );

                    // Crear la tabla dinámica
                    const pivotStartCol = tableResult.range.endCol + 2;
                    const pivotStartRow = 0;

                    Asc.scope.dataRange = dataRange;
                    Asc.scope.pivotStartRow = pivotStartRow;
                    Asc.scope.pivotStartCol = pivotStartCol;
                    Asc.scope.pivotConfig = JSON.stringify({
                        rowFields: pivotConfig.rowFields || [],
                        colFields: pivotConfig.colFields || [],
                        dataFields: pivotConfig.dataFields || [],
                        filterFields: pivotConfig.filterFields || []
                    });
                    
                    window.Asc.plugin.callCommand(function() {
                        var oWorksheet = Api.GetActiveSheet();
                        var dataRangeStr = Asc.scope.dataRange;
                        var pivotRow = Asc.scope.pivotStartRow;
                        var pivotCol = Asc.scope.pivotStartCol;
                        var pivotConfigStr = Asc.scope.pivotConfig;
                        var pivotCfg = JSON.parse(pivotConfigStr);
                        
                        // Obtener el rango de datos
                        var oDataRange = oWorksheet.GetRange(dataRangeStr);
                        
                        // Crear Pivot Table
                        var pivotDestRange = oWorksheet.GetRangeByNumber(pivotRow, pivotCol);
                        
                        // Usar la API de Pivot Table de ONLYOFFICE
                        var oPivotTable = Api.InsertPivotNewWorksheet(oDataRange);
                        
                        if (oPivotTable) {
                            // Configurar campos del pivot
                            if (pivotCfg.rowFields && pivotCfg.rowFields.length > 0) {
                                for (var i = 0; i < pivotCfg.rowFields.length; i++) {
                                    oPivotTable.AddRowField(pivotCfg.rowFields[i]);
                                }
                            }
                            
                            if (pivotCfg.dataFields && pivotCfg.dataFields.length > 0) {
                                for (var j = 0; j < pivotCfg.dataFields.length; j++) {
                                    oPivotTable.AddDataField(pivotCfg.dataFields[j]);
                                }
                            }
                        }
                        
                        return oPivotTable ? true : false;
                        
                    }, false, false, function(result) {
                        console.log('[PivotBuilder] Pivot callCommand result:', result);
                        resolve({
                            success: true,
                            dataRange: dataRange,
                            pivotCreated: result,
                            rowCount: data.length
                        });
                    });

                } catch (error) {
                    reject(error);
                }
            });
        }

        /**
         * Inserta datos en una nueva hoja
         * @param {Array} data - Datos a insertar
         * @param {string} sheetName - Nombre de la nueva hoja
         * @param {Object} options - Opciones adicionales
         * @returns {Promise<Object>} Resultado
         */
        async insertInNewSheet(data, sheetName, options = {}) {
            const self = this;
            return new Promise((resolve, reject) => {
                // Primero crear la nueva hoja
                Asc.scope.sheetName = sheetName || 'BIW_Data';
                
                window.Asc.plugin.callCommand(function() {
                    var sheetNameVal = Asc.scope.sheetName;
                    // AddSheet crea la hoja, luego la obtenemos por nombre
                    Api.AddSheet(sheetNameVal);
                    var oWorksheet = Api.GetSheet(sheetNameVal);
                    if (oWorksheet) {
                        oWorksheet.SetActive();
                    }
                    return true;
                }, false, false, function(result) {
                    console.log('[PivotBuilder] AddSheet result:', result);
                    // Insertar datos con jerarquía si está habilitado
                    if (options.enableHierarchy !== false) {
                        self.insertWithHierarchy(data, options).then(function(insertResult) {
                            resolve({
                                success: true,
                                sheetName: sheetName,
                                range: insertResult.range,
                                rowCount: insertResult.rowCount,
                                colCount: insertResult.colCount,
                                hierarchy: insertResult.hierarchy
                            });
                        }).catch(function(error) {
                            reject(error);
                        });
                    } else {
                        self.insertAsTable(data, options).then(function(insertResult) {
                            resolve({
                                success: true,
                                sheetName: sheetName,
                                range: insertResult.range,
                                rowCount: insertResult.rowCount,
                                colCount: insertResult.colCount
                            });
                        }).catch(function(error) {
                            reject(error);
                        });
                    }
                });
            });
        }

        /**
         * Detecta jerarquía en las columnas de datos
         * @param {Array} columns - Nombres de columnas
         * @returns {Object} Estructura de jerarquía con índices de columnas a ocultar
         */
        detectColumnHierarchy(columns) {
            const hierarchy = {
                groups: [],      // {parent: idx, children: [idx, idx, ...]}
                hiddenCols: [],  // Índices de columnas a ocultar
                parentCols: {}   // {parentIdx: nombre}
            };
            
            let currentParent = null;
            let currentParentIdx = null;
            let currentChildren = [];
            
            columns.forEach((col, idx) => {
                // Detectar padre: empieza con "(+)"
                if (col.startsWith('(+)')) {
                    // Guardar grupo anterior si existe
                    if (currentParent !== null && currentChildren.length > 0) {
                        hierarchy.groups.push({
                            parent: currentParentIdx,
                            parentName: currentParent,
                            children: [...currentChildren]
                        });
                        hierarchy.hiddenCols.push(...currentChildren);
                    }
                    
                    currentParent = col;
                    currentParentIdx = idx;
                    currentChildren = [];
                    hierarchy.parentCols[idx] = col;
                }
                // Detectar hijo: empieza con espacios (indentación)
                else if ((col.startsWith('    ') || col.startsWith('  ')) && currentParent !== null) {
                    currentChildren.push(idx);
                }
                // Columna normal: guardar grupo anterior y resetear
                else {
                    if (currentParent !== null && currentChildren.length > 0) {
                        hierarchy.groups.push({
                            parent: currentParentIdx,
                            parentName: currentParent,
                            children: [...currentChildren]
                        });
                        hierarchy.hiddenCols.push(...currentChildren);
                    }
                    currentParent = null;
                    currentParentIdx = null;
                    currentChildren = [];
                }
            });
            
            // Guardar último grupo si existe
            if (currentParent !== null && currentChildren.length > 0) {
                hierarchy.groups.push({
                    parent: currentParentIdx,
                    parentName: currentParent,
                    children: [...currentChildren]
                });
                hierarchy.hiddenCols.push(...currentChildren);
            }
            
            console.log('[PivotBuilder] Jerarquía detectada:', hierarchy);
            return hierarchy;
        }

        /**
         * Inserta datos con jerarquía de columnas (drill-down)
         * @param {Array} data - Array de objetos con los datos
         * @param {Object} options - Opciones de inserción
         * @returns {Promise<Object>} Resultado de la inserción
         */
        async insertWithHierarchy(data, options = {}) {
            return new Promise((resolve, reject) => {
                if (!data || data.length === 0) {
                    reject(new Error('No hay datos para insertar'));
                    return;
                }

                const startCol = options.startCol || 0;
                const startRow = options.startRow || 0;
                const includeHeaders = options.includeHeaders !== false;

                // Obtener las columnas y detectar jerarquía
                const columns = Object.keys(data[0]);
                const numCols = columns.length;
                const numRows = data.length + (includeHeaders ? 1 : 0);
                const hierarchy = this.detectColumnHierarchy(columns);

                // Preparar los datos para ONLYOFFICE
                const cellData = [];

                // Headers - marcar padres con icono especial
                if (includeHeaders) {
                    columns.forEach((col, colIndex) => {
                        const isParent = hierarchy.parentCols[colIndex] !== undefined;
                        const isChild = hierarchy.hiddenCols.includes(colIndex);
                        
                        // Limpiar nombre de columna
                        let displayName = col.replace('(+) ', '▶ ').trim();
                        if (isChild) {
                            displayName = '  ' + displayName.trim();
                        }
                        
                        cellData.push({
                            row: startRow,
                            col: startCol + colIndex,
                            value: displayName,
                            isBold: true,
                            bgColor: isParent ? '#2E7D32' : (isChild ? '#E8F5E9' : '#4472C4'),
                            fontColor: isParent ? '#FFFFFF' : (isChild ? '#1B5E20' : '#FFFFFF')
                        });
                    });
                }

                // Data rows
                data.forEach((rowData, rowIndex) => {
                    const actualRow = startRow + (includeHeaders ? 1 : 0) + rowIndex;
                    columns.forEach((col, colIndex) => {
                        const value = rowData[col];
                        cellData.push({
                            row: actualRow,
                            col: startCol + colIndex,
                            value: value,
                            isNumeric: typeof value === 'number'
                        });
                    });
                });

                // Ejecutar la inserción usando la API de ONLYOFFICE
                try {
                    Asc.scope.cellData = JSON.stringify(cellData);
                    Asc.scope.startCol = startCol;
                    Asc.scope.numCols = numCols;
                    Asc.scope.numRows = numRows;
                    Asc.scope.hiddenCols = JSON.stringify(hierarchy.hiddenCols);
                    Asc.scope.groups = JSON.stringify(hierarchy.groups);
                    
                    window.Asc.plugin.callCommand(function() {
                        var oWorksheet = Api.GetActiveSheet();
                        var cellDataStr = Asc.scope.cellData;
                        var cellDataArr = JSON.parse(cellDataStr);
                        var startColVal = Asc.scope.startCol;
                        var numColsVal = Asc.scope.numCols;
                        var numRowsVal = Asc.scope.numRows;
                        var hiddenColsArr = JSON.parse(Asc.scope.hiddenCols);
                        var groupsArr = JSON.parse(Asc.scope.groups);
                        
                        // Insertar celdas
                        for (var i = 0; i < cellDataArr.length; i++) {
                            var cellInfo = cellDataArr[i];
                            var oRange = oWorksheet.GetRangeByNumber(cellInfo.row, cellInfo.col);
                            
                            if (cellInfo.value !== undefined && cellInfo.value !== null) {
                                oRange.SetValue(String(cellInfo.value));
                            }
                            
                            if (cellInfo.isBold) {
                                oRange.SetBold(true);
                            }
                            
                            if (cellInfo.bgColor) {
                                var bgColor = Api.CreateColorFromRGB(
                                    parseInt(cellInfo.bgColor.slice(1,3), 16),
                                    parseInt(cellInfo.bgColor.slice(3,5), 16),
                                    parseInt(cellInfo.bgColor.slice(5,7), 16)
                                );
                                oRange.SetFillColor(bgColor);
                            }
                            
                            if (cellInfo.fontColor) {
                                var fontColor = Api.CreateColorFromRGB(
                                    parseInt(cellInfo.fontColor.slice(1,3), 16),
                                    parseInt(cellInfo.fontColor.slice(3,5), 16),
                                    parseInt(cellInfo.fontColor.slice(5,7), 16)
                                );
                                oRange.SetFontColor(fontColor);
                            }
                        }
                        
                        // Ajustar anchos de columna
                        for (var c = 0; c < numColsVal; c++) {
                            var colRange = oWorksheet.GetRangeByNumber(0, startColVal + c);
                            colRange.SetColumnWidth(15);
                        }
                        
                        // Ocultar columnas hijas (drill-down colapsado)
                        for (var h = 0; h < hiddenColsArr.length; h++) {
                            var hiddenColIdx = hiddenColsArr[h];
                            // Seleccionar toda la columna y ocultarla
                            var colLetter = '';
                            var n = hiddenColIdx + startColVal;
                            while (n >= 0) {
                                colLetter = String.fromCharCode(65 + (n % 26)) + colLetter;
                                n = Math.floor(n / 26) - 1;
                            }
                            var fullColRange = oWorksheet.GetRange(colLetter + ':' + colLetter);
                            fullColRange.SetHidden(true);
                        }
                        
                        // Añadir comentario en las celdas padre indicando drill-down
                        for (var g = 0; g < groupsArr.length; g++) {
                            var group = groupsArr[g];
                            var parentRange = oWorksheet.GetRangeByNumber(0, group.parent + startColVal);
                            parentRange.AddComment(
                                'Drill-down: Mostrar columnas ' + 
                                String.fromCharCode(65 + group.children[0] + startColVal) + 
                                ' a ' + 
                                String.fromCharCode(65 + group.children[group.children.length - 1] + startColVal) + 
                                ' para ver el detalle (' + group.children.length + ' columnas ocultas)'
                            );
                        }
                        
                        return {
                            range: 'A1:' + String.fromCharCode(65 + numColsVal - 1) + numRowsVal,
                            hiddenCount: hiddenColsArr.length
                        };
                        
                    }, false, false, function(result) {
                        console.log('[PivotBuilder] InsertWithHierarchy result:', result);
                        resolve({
                            success: true,
                            range: result ? result.range : null,
                            rowCount: data.length,
                            colCount: columns.length,
                            hierarchy: {
                                groups: hierarchy.groups.length,
                                hiddenColumns: hierarchy.hiddenCols.length
                            }
                        });
                    });

                } catch (error) {
                    reject(error);
                }
            });
        }

        /**
         * Formatea números según la configuración regional
         * @param {number} value - Valor numérico
         * @param {Object} format - Opciones de formato
         * @returns {string} Valor formateado
         */
        formatNumber(value, format = {}) {
            if (typeof value !== 'number' || isNaN(value)) {
                return value;
            }

            const options = {
                decimals: format.decimals !== undefined ? format.decimals : 2,
                thousandsSep: format.thousandsSep || '.',
                decimalSep: format.decimalSep || ',',
                currency: format.currency || '',
                percentage: format.percentage || false
            };

            if (options.percentage) {
                value = value * 100;
            }

            const parts = value.toFixed(options.decimals).split('.');
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, options.thousandsSep);
            
            let result = parts.join(options.decimalSep);
            
            if (options.currency) {
                result = `${result} ${options.currency}`;
            }
            
            if (options.percentage) {
                result = `${result}%`;
            }

            return result;
        }

        /**
         * Convierte número de columna a letra (0 = A, 1 = B, etc.)
         * @param {number} colNum - Número de columna
         * @returns {string} Letra de columna
         */
        _colNumToLetter(colNum) {
            let letter = '';
            while (colNum >= 0) {
                letter = String.fromCharCode((colNum % 26) + 65) + letter;
                colNum = Math.floor(colNum / 26) - 1;
            }
            return letter;
        }

        /**
         * Genera una cadena de rango (ej: "A1:D10")
         * @param {number} startCol - Columna inicial
         * @param {number} startRow - Fila inicial
         * @param {number} endCol - Columna final
         * @param {number} endRow - Fila final
         * @returns {string} Cadena de rango
         */
        _getRangeString(startCol, startRow, endCol, endRow) {
            const startColLetter = this._colNumToLetter(startCol);
            const endColLetter = this._colNumToLetter(endCol);
            return `${startColLetter}${startRow + 1}:${endColLetter}${endRow + 1}`;
        }

        /**
         * Obtiene las dimensiones de los datos
         * @param {Array} data - Datos a analizar
         * @returns {Object} Dimensiones encontradas
         */
        analyzeDimensions(data) {
            if (!data || data.length === 0) {
                return { columns: [], numericColumns: [], textColumns: [] };
            }

            const columns = Object.keys(data[0]);
            const numericColumns = [];
            const textColumns = [];

            columns.forEach(col => {
                // Analizar el primer valor no nulo
                const firstValue = data.find(row => row[col] !== null && row[col] !== undefined)?.[col];
                
                if (typeof firstValue === 'number' || !isNaN(parseFloat(firstValue))) {
                    numericColumns.push(col);
                } else {
                    textColumns.push(col);
                }
            });

            return {
                columns,
                numericColumns,
                textColumns,
                rowCount: data.length
            };
        }
    }

    // Exportar al scope global
    window.PivotBuilder = PivotBuilder;

})(window);
