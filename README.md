# Credicall WT

Aplicación web (SPA) construida con **Vite + React + TypeScript** y un servidor **Express** que:

- En desarrollo integra Vite como middleware (un solo proceso).
- En producción sirve los archivos estáticos de `dist/` y expone endpoints `/api/*` como proxy hacia servicios externos.

## Stack

- Frontend: Vite, React, TypeScript, Tailwind
- Backend: Express (proxy + hosting del SPA)
- Integraciones: Firebase (Auth/Firestore), servicio UGEL, servicio WhatsApp Verify

## Requisitos

- Node.js recomendado: 22 (o 20+)
- npm

## Variables de entorno

Este proyecto usa variables tanto en el **frontend (Vite)** como en el **servidor (Express)**.

### App / Proxy

- `VITE_UGEL_API_URL`: URL base de la API UGEL (usada por el servidor para el proxy `/api/ugel/*`). Si no se define, el servidor usa `http://127.0.0.1:8090` como fallback.
- `VITE_WHATSAPP_API_URL`: URL base del servicio WhatsApp Verify (usada por el servidor para el proxy `/api/whatsapp/*`). Si no se define, el servidor usa `https://verifywsp.jamuywasi.com` como fallback.

### Servidor

- `PORT`: puerto del servidor Express (default `3000`).
- `NODE_ENV`: si es `production`, el servidor sirve `dist/`; si no, monta Vite middleware.

### Desarrollo (opcional)

- `DISABLE_HMR`: si es `true`, deshabilita HMR de Vite en desarrollo.

### Gemini (opcional)

- `GEMINI_API_KEY`: está preparado en la configuración de Vite, pero actualmente no hay uso directo en el código.

Ejemplo:

```env
VITE_UGEL_API_URL=https://backcall.jamuywasi.com
VITE_WHATSAPP_API_URL=https://verifywsp.jamuywasi.com
```

Puedes partir de [.env.example](./.env.example) y crear tu `.env`.

## Desarrollo local

1. Instalar dependencias:

```bash
npm install
```

2. Levantar el servidor en modo desarrollo:

```bash
npm run dev
```

3. Abrir:

- http://localhost:3000

## Build y ejecución en producción (sin Docker)

1. Build del frontend:

```bash
npm run build
```

2. Arrancar en producción (sirve `dist/`):

```bash
NODE_ENV=production PORT=3000 npx tsx server.ts
```

En Windows PowerShell:

```powershell
$env:NODE_ENV='production'; $env:PORT='3000'; npx tsx server.ts
```

## Docker

### Con Docker Compose (recomendado)

1. Asegura que `VITE_UGEL_API_URL` y `VITE_WHATSAPP_API_URL` estén definidas en tu entorno o en un archivo `.env` local (Docker Compose lo lee automáticamente).
2. Levanta el servicio:

```bash
docker compose up --build
```

Abrir:

- http://localhost:3000

### Con Docker build/run

```bash
docker build -t credicall-wt .
docker run --rm -p 3000:3000 -e NODE_ENV=production -e PORT=3000 credicall-wt
```

Si necesitas apuntar a un servicio que corre en tu máquina host, en Docker Desktop suele funcionar `http://host.docker.internal:<puerto>` como valor para `VITE_UGEL_API_URL`.

## Endpoints del servidor (proxy)

- `GET /api/ugel/data` (lista paginada)
- `GET /api/ugel/data/:dni` (búsqueda por DNI)
- `GET /api/ugel/credits/:dni` (historia de créditos)
- `GET /api/verificar/:dni` (contactos)
- `GET /api/whatsapp/auth/:dni` (estado/QR)
- `GET /api/whatsapp/verify` (verificación)

## Firebase

La configuración de Firebase se toma desde [firebase-applet-config.json](./firebase-applet-config.json) y se inicializa en [firebase.ts](./src/lib/firebase.ts).

Si vas a usar tu propio proyecto de Firebase, reemplaza ese JSON por tu configuración.

## Calidad

```bash
npm run lint
```

## Troubleshooting

- `500 Error de conexión con la API`: verifica que `VITE_UGEL_API_URL` sea accesible desde donde corre el servidor (local o contenedor) y que el servicio esté levantado.
- En Docker, si la API UGEL corre fuera del contenedor, usa una URL accesible desde el contenedor (por ejemplo `host.docker.internal` en Docker Desktop).
