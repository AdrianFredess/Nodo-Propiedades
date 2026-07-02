# Deploy en VPS — Nodo Propiedades

## Requisitos del servidor

- Ubuntu 22.04 LTS
- 2GB RAM mínimo (4GB recomendado)
- 20GB disco SSD
- Dominio propio apuntando a la IP del servidor (registro A)
- Puerto 80 y 443 abiertos en el firewall

## Proveedores recomendados

| Proveedor | Plan | Precio/mes | Link |
|-----------|------|-----------|------|
| Hetzner | CX22 (2vCPU, 4GB) | ~USD 6 | hetzner.com |
| Contabo | VPS S (4 vCPU, 8GB) | ~USD 7 | contabo.com |
| DigitalOcean | Basic (2GB) | USD 12 | digitalocean.com |

## Paso 1 — Conectarse al servidor

```bash
ssh root@IP_DEL_SERVIDOR
```

## Paso 2 — Instalar Docker

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Instalar Docker Compose
apt-get install -y docker-compose-plugin
docker compose version
```

## Paso 3 — Subir los archivos del proyecto

**Opción A — desde Git (recomendado):**
```bash
git clone https://github.com/TU_USUARIO/nodo-propiedades.git
cd nodo-propiedades
```

**Opción B — subir manualmente con SCP:**
```bash
# Desde tu máquina Windows (PowerShell):
scp -r "C:\ruta\al\proyecto" root@IP_DEL_SERVIDOR:/root/nodo-propiedades
```

## Paso 4 — Configurar variables de entorno

```bash
cd /root/nodo-propiedades
cp .env.example .env
nano .env
```

Completar TODOS los valores. Para generar N8N_ENCRYPTION_KEY:
```bash
openssl rand -hex 16
```

## Paso 5 — Levantar el sistema

```bash
docker compose up -d
# Verificar que levantó correctamente:
docker compose logs n8n
# Debe mostrar: "n8n ready on port 5678"
```

## Paso 6 — Configurar Nginx como reverse proxy

Instalar Nginx y Certbot:
```bash
apt-get install -y nginx certbot python3-certbot-nginx
```

Crear configuración de Nginx:
```bash
nano /etc/nginx/sites-available/n8n
```

Pegar este contenido (reemplazar TU_DOMINIO.COM):
```nginx
server {
    listen 80;
    server_name TU_DOMINIO.COM;

    location / {
        proxy_pass http://localhost:5678;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 88400s;
        proxy_send_timeout 88400s;
        chunked_transfer_encoding on;
    }
}
```

Activar el sitio y obtener SSL:
```bash
ln -s /etc/nginx/sites-available/n8n /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
certbot --nginx -d TU_DOMINIO.COM
```

## Paso 7 — Importar workflows en el contenedor

```bash
# Importar todos los workflows:
docker compose exec n8n sh -c "for f in /workflows/*.json; do n8n import:workflow --input=\"\$f\"; done"

# Verificar que importaron:
docker compose exec n8n n8n list:workflow
```

## Paso 8 — Configurar credenciales en n8n UI

Abrir https://TU_DOMINIO.COM en el navegador y configurar:

1. **Google Sheets OAuth2**
   - Settings → Credentials → New → Google Sheets OAuth2
   - Completar con las credenciales de Google Cloud Console

2. **Groq API**
   - Settings → Credentials → New → OpenAI API
   - Name: "Groq API"
   - Base URL: https://api.groq.com/openai/v1
   - API Key: tu key de console.groq.com

3. **Credenciales en nodos HTTP de Meta**
   - Usar el script: node scripts/_actualizar_ids_importados.js
   - O reemplazar manualmente los __SET_*__ con el script PowerShell

## Paso 9 — Activar workflows (en este orden)

1. WF-07 Error Logger
2. WF-02 Core Lead Processor
3. WF-03 Property Matching
4. WF-04 Follow-up Orchestrator
5. WF-05 Daily Reactivation
6. WF-06 Advisor Alert
7. WF-10 Meta Template Sender
8. WF-11 Meta Status Handler
9. WF-09B Meta WhatsApp Webhook Produccion
10. WF-12 Messenger Webhook (opcional)
11. WF-13 Telegram Bot Webhook (opcional)

## Paso 10 — Configurar webhook en Meta

En Meta for Developers → Tu App → WhatsApp → Configuración:
- URL de callback: https://TU_DOMINIO.COM/webhook/meta-whatsapp-prod
- Token de verificación: el valor de META_VERIFY_TOKEN en tu .env

## Comandos útiles post-deploy

```bash
# Ver logs en tiempo real:
docker compose logs -f n8n

# Reiniciar n8n:
docker compose restart n8n

# Actualizar n8n a la última versión:
docker compose pull && docker compose up -d

# Backup de datos:
docker compose exec n8n tar czf /tmp/backup.tar.gz /home/node/.n8n
docker cp $(docker compose ps -q n8n):/tmp/backup.tar.gz ./backup-$(date +%Y%m%d).tar.gz

# Ver uso de recursos:
docker stats

# Entrar al contenedor:
docker compose exec n8n sh
```

## Costos estimados mensuales

| Servicio | Costo |
|---------|-------|
| VPS Hetzner CX22 | ~USD 6 |
| Dominio (.com) | ~USD 1 (amortizado) |
| Groq API (hasta 500 leads/mes) | USD 0 (gratuito) |
| Google Sheets | USD 0 (gratuito) |
| **Total** | **~USD 7/mes** |
