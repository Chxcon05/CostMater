# CostMaster

Sistema de contabilidad de costos para pequeñas y medianas empresas. Permite gestionar productos, costos directos e indirectos, generar reportes financieros, exportar a PDF/Excel, y obtener recomendaciones inteligentes de precios.

## Características

- **Autenticación segura** con JWT, recuperación de contraseña por token y roles (admin/usuario).
- **Gestión de productos** con cálculo automático de costo unitario.
- **Costos directos e indirectos** con prorrateo automático entre productos.
- **Historial de costos y precios** con variaciones temporales.
- **Reportes** con KPIs, gráficos, punto de equilibrio y exportación a PDF/Excel.
- **Análisis IA**: recomendación de precios, proyección de costos, simulación de escenarios y optimización.
- **Alertas automáticas** de stock, margen y precios en el dashboard.
- **i18n** Español/Inglés, **tema claro/oscuro**, diseño **responsivo**.
- **Auditoría completa** de operaciones.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Astro 6 + Tailwind CSS + Chart.js |
| Backend | Node.js + Express 4 |
| Base de datos | PostgreSQL (Neon, Supabase, etc.) |
| Autenticación | JWT + bcryptjs |

## Instalación

Requisitos: Node.js 18+ y una base de datos PostgreSQL (p. ej. Neon o Supabase).

```bash
# 1. Instalar dependencias
npm run install:all

# 2. Configurar variables de entorno
# Copiar backend/.env.example a backend/.env y ajustar valores
#   PORT=3000
#   JWT_SECRET=tu_secreto
#   DATABASE_URL=postgresql://usuario:password@host/database?sslmode=require
#   CORS_ORIGIN=http://localhost:4321
#   FRONTEND_URL=http://localhost:4321

# 3. Desarrollo (dos terminales)
npm run dev:backend   # API en http://localhost:3000
npm run dev:frontend  # UI en http://localhost:4321
```

## Producción

```bash
npm run build   # Compila el frontend a frontend/dist
npm start       # Backend sirve la API + el frontend compilado
# Acceder a http://localhost:3000
```

El primer usuario registrado recibe el rol **admin**.

## Despliegue (todo en Vercel, gratis)

Toda la app (frontend estático + backend Express como serverless function) vive en **un solo proyecto de Vercel** en el plan Hobby (gratis). La base de datos usa **Neon** o **Supabase** (planes free). El frontend usa rutas relativas `/api`, y `vercel.json` reenvía `/api/*` a la función serverless `api/index.js`.

### 1. Base de datos (Neon/Supabase)

1. Crea un proyecto gratis en [Neon](https://neon.tech) o [Supabase](https://supabase.com).
2. Copia la cadena de conexión: `postgresql://usuario:password@host/database?sslmode=require`.

### 2. Desplegar en Vercel

1. Conecta el repositorio a Vercel (proyecto nuevo) y crea el proyecto.
2. **No configures Root Directory** (se despliega desde la raíz del repo). El `vercel.json` ya define build (`npm run build`), install (`npm run install:all`), output (`frontend/dist`) y el rewrite `/api → /api/index`.
3. Configura las variables de entorno en **Settings → Environment Variables**:
   - `DATABASE_URL=postgresql://...` (obligatorio)
   - `JWT_SECRET=un_secreto_largo_y_seguro` (obligatorio)
   - `FRONTEND_URL=https://TU-APP.vercel.app` (links de recuperación de contraseña)
   - `CORS_ORIGIN` opcional: solo si en el futuro sirves el frontend desde otro dominio.
   - SMTP opcional: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (si no, la recuperación de contraseña funciona en modo demo).
4. Deploy. Las tablas se crean automáticamente al arrancar la función (`initDb`).

### 3. Verificar

- Registra el primer usuario (recibe rol **admin**).
- Confirma que `GET https://TU-APP.vercel.app/api/health` responde `{"status":"ok"}`.

> Nota: al ser serverless, el rate-limiter funciona en memoria (no persiste el archivo JSON, falla en silencio) y la primera petición tras inactividad tarda unos segundos (cold start).

## Estructura

```
CostMater/
├── backend/          # API REST (Express + PostgreSQL)
│   ├── src/
│   │   ├── config/   # Conexión y esquema de BD (pg)
│   │   ├── middleware/ # Auth, rate limiting
│   │   ├── routes/   # auth, products, costs, reports, entities, transactions, ai, users
│   │   └── utils/    # Auditoría
├── frontend/         # UI (Astro + Tailwind)
│   └── src/
│       ├── layouts/
│       ├── components/
│       ├── pages/
│       └── styles/
├── SPEC.md           # Especificación del sistema
└── package.json      # Scripts raíz de conveniencia
```

## API principal

```
POST /api/auth/register | login | forgot-password | reset-password
POST /api/auth/logout
GET  /api/auth/me
GET/POST/PUT/DELETE /api/products, /api/costs/direct, /api/costs/indirect
GET  /api/costs/history
GET  /api/products/:id/price-history
GET  /api/reports/summary | distribution | rentability | period | variations | break-even
GET  /api/audit
GET/POST/PUT/DELETE /api/customers, /api/suppliers, /api/quotes, /api/invoices
POST /api/ai/price-recommendation | cost-forecast | scenario
GET  /api/ai/optimization
GET/PUT /api/users (admin)
```
