# Solución al problema de localhost en Docker para OnlyOffice

## El Problema

Cuando OnlyOffice Document Server se ejecuta en Docker Desktop (macOS/Windows), el servidor de documentos no puede hacer callbacks al servidor de ejemplo porque:

1. **El docservice** intenta conectar a `localhost:8080` para enviar callbacks (tracking, status, etc.)
2. **Dentro del contenedor**, `localhost` se resuelve a `127.0.0.1` (interfaz loopback del contenedor)
3. **El puerto 8080** está mapeado desde el host, no existe dentro del contenedor
4. **Resultado**: `Error: connect ECONNREFUSED 127.0.0.1:8080`

### Síntomas
- El editor carga pero muestra errores de guardado
- Mensaje: "The document could not be saved"
- Error en logs: `postData error: url = http://localhost:8080/example/track... Error: connect ECONNREFUSED 127.0.0.1:8080`

### Por qué no funciona cambiar `/etc/hosts`
Modificar `/etc/hosts` para que `localhost` apunte a `host.docker.internal` (192.168.65.254) **rompe** PostgreSQL y RabbitMQ que también usan `localhost` y necesitan conectar a servicios dentro del contenedor.

---

## La Solución: Forward de puerto con socat

La solución es crear un **forward interno** de puerto usando `socat`:

```
localhost:8080 → localhost:80 (nginx)
```

Esto permite que:
- El docservice conecte a `localhost:8080` ✅
- La conexión se reenvíe a nginx (puerto 80) dentro del contenedor ✅
- PostgreSQL/RabbitMQ sigan funcionando con localhost normal ✅

---

## Implementación

### Paso 1: Verificar que socat está instalado
```bash
docker exec onlyoffice-biw which socat
# Si no está: docker exec onlyoffice-biw apt-get install -y socat
```

### Paso 2: Crear servicio de supervisord (persistente)
```bash
docker exec onlyoffice-biw bash -c '
cat > /etc/supervisor/conf.d/socat-forward.conf << "EOF"
[program:socat-forward]
command=/usr/bin/socat TCP-LISTEN:8080,fork,reuseaddr TCP:127.0.0.1:80
autostart=true
autorestart=true
stderr_logfile=/var/log/socat-forward.err.log
stdout_logfile=/var/log/socat-forward.out.log
EOF
'
```

### Paso 3: Activar el servicio
```bash
docker exec onlyoffice-biw supervisorctl reread
docker exec onlyoffice-biw supervisorctl update
docker exec onlyoffice-biw supervisorctl start socat-forward
```

### Paso 4: Verificar
```bash
# Verificar que el servicio está corriendo
docker exec onlyoffice-biw supervisorctl status socat-forward

# Verificar que el puerto 8080 está escuchando
docker exec onlyoffice-biw netstat -tlnp | grep 8080
```

---

## Comando rápido (todo en uno)

Si necesitas aplicar la solución rápidamente después de recrear el contenedor:

```bash
# Crear y activar el forward de socat
docker exec onlyoffice-biw bash -c '
cat > /etc/supervisor/conf.d/socat-forward.conf << "EOF"
[program:socat-forward]
command=/usr/bin/socat TCP-LISTEN:8080,fork,reuseaddr TCP:127.0.0.1:80
autostart=true
autorestart=true
stderr_logfile=/var/log/socat-forward.err.log
stdout_logfile=/var/log/socat-forward.out.log
EOF
'
docker exec onlyoffice-biw supervisorctl reread
docker exec onlyoffice-biw supervisorctl update
docker exec onlyoffice-biw supervisorctl start socat-forward
```

---

## Diagrama de la solución

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Container                          │
│                                                              │
│  ┌──────────────┐         ┌──────────────┐                  │
│  │  docservice  │────────▶│    socat     │                  │
│  │  (puerto 8000)│  POST   │  :8080→:80   │                  │
│  └──────────────┘  track  └──────┬───────┘                  │
│                                   │                          │
│                                   ▼                          │
│                           ┌──────────────┐                  │
│                           │    nginx     │                  │
│                           │  (puerto 80) │                  │
│                           └──────┬───────┘                  │
│                                   │                          │
│                                   ▼                          │
│                           ┌──────────────┐                  │
│                           │   example    │                  │
│                           │ (puerto 3000)│                  │
│                           └──────────────┘                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
        │
        │ Puerto 80 mapeado a 8080 del host
        ▼
┌───────────────┐
│   Host Mac    │
│  :8080 ──────▶│  Browser accede a localhost:8080
└───────────────┘
```

---

## Notas importantes

1. **Esta solución es específica para Docker Desktop** en macOS/Windows donde `--network host` no funciona.

2. **El servicio es persistente** gracias a supervisord, pero se perderá si se **recrea** el contenedor (no si solo se reinicia).

3. **Si recreas el contenedor**, deberás volver a aplicar la solución.

4. **Alternativa permanente**: Crear una imagen Docker personalizada que incluya esta configuración.

---

## Fecha de documentación
- **Creado**: Enero 2026
- **Problema identificado en**: OnlyOffice Document Server con Docker Desktop
- **Versión de OnlyOffice**: 9.2.1
