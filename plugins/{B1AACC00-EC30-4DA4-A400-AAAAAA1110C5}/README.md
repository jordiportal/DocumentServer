# BIW Data Connector - Plugin para ONLYOFFICE

Plugin para ONLYOFFICE Docs que permite conectar con SAP BIW a través de un proxy y obtener datos de análisis para insertarlos directamente en hojas de cálculo.

## Características

- 🔗 **Conexión con SAP BIW**: A través del proxy `proxy-btp`
- 📊 **Inserción de datos**: Inserta datos directamente en la hoja activa o en una nueva hoja
- 📈 **Tablas Dinámicas**: Crea tablas dinámicas (Pivot Tables) automáticamente
- 🎨 **Interfaz moderna**: UI intuitiva con soporte para tema claro/oscuro
- 💾 **Configuración persistente**: Guarda la configuración de conexión

## Requisitos

- ONLYOFFICE Docs v7.0 o superior
- Proxy BIW (`proxy-btp`) ejecutándose y accesible
- Conexión configurada con SAP BIW en el proxy

## Instalación

### Opción 1: Instalación Manual

1. Copia la carpeta `biw-connector` al directorio de plugins de ONLYOFFICE:
   - **Linux**: `/var/www/onlyoffice/documentserver/sdkjs-plugins/`
   - **Windows**: `C:\Program Files\ONLYOFFICE\DocumentServer\sdkjs-plugins\`
   - **Docker**: Monta el volumen en `/var/www/onlyoffice/documentserver/sdkjs-plugins/`

2. Reinicia ONLYOFFICE Document Server

### Opción 2: Instalación vía Plugin Manager

1. Abre ONLYOFFICE Docs
2. Ve a **Plugins** → **Plugin Manager**
3. Haz clic en **Add plugin from file**
4. Selecciona el archivo `config.json` del plugin

## Configuración

### URL del Proxy BIW

Por defecto, el plugin intenta conectar con `http://localhost:3001`. Para cambiar la URL:

1. Abre el plugin en ONLYOFFICE
2. Ve a la sección **Conexión**
3. Introduce la URL del proxy
4. Haz clic en el botón de reconectar

### Endpoints Disponibles

Los endpoints se configuran en el proxy BIW (`proxy-btp`). El endpoint de ejemplo incluido es:

| Endpoint | Query BW | Descripción |
|----------|----------|-------------|
| `cuenta-resultados` | `MKT_CUENTA_RES_CP_OPT_DPCT` | Cuenta de Resultados con análisis de márgenes |

## Uso

1. Abre una hoja de cálculo en ONLYOFFICE
2. Ve a **Plugins** → **BIW Connector**
3. Verifica que la conexión esté activa (indicador verde)
4. Selecciona un endpoint de la lista
5. Configura las opciones de layout:
   - **Dimensiones en Filas**: Campos a mostrar como filas
   - **Dimensiones en Columnas**: Campos a mostrar como columnas
   - **Crear Tabla Dinámica**: Genera un Pivot Table
   - **Nueva Hoja**: Inserta en una hoja nueva
6. Haz clic en **Vista Previa** para ver los datos
7. Haz clic en **Insertar Datos**

## Estructura del Plugin

```
biw-connector/
├── config.json              # Configuración del plugin ONLYOFFICE
├── index.html               # Panel principal
├── index_settings.html      # Panel de configuración
├── README.md                # Este archivo
├── resources/
│   └── icon.svg             # Icono del plugin
├── scripts/
│   ├── biw-client.js        # Cliente HTTP para el proxy
│   ├── pivot-builder.js     # Constructor de tablas dinámicas
│   └── code.js              # Lógica principal
└── styles/
    └── main.css             # Estilos del plugin
```

## API del Proxy BIW

El plugin utiliza los siguientes endpoints del proxy:

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/health` | Verificar conexión |
| GET | `/api/bw-endpoints/list` | Listar endpoints disponibles |
| GET | `/api/bw-endpoints/:name` | Obtener detalles de un endpoint |
| POST | `/api/bw-query/execute` | Ejecutar query BW |
| POST | `/api/bw-query/execute-mdx` | Ejecutar query con layout MDX |

### Ejemplo de Request

```javascript
// POST /api/bw-query/execute
{
  "queryName": "MKT_CUENTA_RES_CP_OPT_DPCT",
  "language": "S",
  "rowDimensions": ["0CUST_SALES"],
  "columnDimensions": ["Measures"],
  "variables": []
}
```

## Desarrollo

### Requisitos de Desarrollo

- Node.js 18+
- Acceso al proxy BIW
- ONLYOFFICE Docs para testing

### Testing Local

1. Inicia el proxy BIW:
   ```bash
   cd proxy-btp
   npm start
   ```

2. Configura ONLYOFFICE para cargar plugins locales

3. Abre la consola del navegador para ver los logs del plugin

## Roadmap

- [ ] Soporte para gráficos avanzados (ECharts)
- [ ] Caché de consultas frecuentes
- [ ] Filtros interactivos
- [ ] Actualización automática de datos
- [ ] Exportación de configuraciones

## Soporte

Para reportar problemas o solicitar nuevas funcionalidades, contacta al equipo de desarrollo.

## Licencia

Este plugin es software propietario de uso interno.
