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
| Base de datos | SQLite (sql.js) |
| Autenticación | JWT + bcryptjs |

## Instalación

Requisitos: Node.js 18+.

```bash
# 1. Instalar dependencias
npm run install:all

# 2. Configurar variables de entorno
# Copiar backend/.env.example a backend/.env y ajustar valores
#   PORT=3000
#   JWT_SECRET=tu_secreto
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

## Estructura

```
CostMater/
├── backend/          # API REST (Express + sql.js)
│   ├── src/
│   │   ├── config/   # Conexión y esquema de BD
│   │   ├── middleware/ # Auth, rate limiting
│   │   ├── routes/   # auth, products, costs, reports, entities, transactions, ai, users
│   │   └── utils/    # Auditoría
│   └── data/         # costmaster.db (SQLite)
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
