# CostMaster - Sistema de Contabilidad de Costos

## 1. Concepto y Visión

CostMaster es una aplicación web moderna diseñada para que pequeñas empresas y emprendedores gestionen sus costos de producción de manera eficiente. La experiencia debe sentirse profesional pero accesible: como tener un contador digital intuitivo que simplifica decisiones financieras complejas en visualizaciones claras y actionable.

## 2. Design Language

### Aesthetic Direction
Diseño inspirado en dashboards financieros modernos tipo Notion + Linear. Limpio, espacioso, con énfasis en datos y métricas.

### Color Palette
- **Primary:** `#2563eb` (Blue 600 - acciones principales)
- **Secondary:** `#10b981` (Emerald 500 - éxito/ganancias)
- **Accent:** `#f59e0b` (Amber 500 - alertas/costos)
- **Danger:** `#ef4444` (Red 500 - errores/pérdidas)
- **Background:** `#f8fafc` (Slate 50)
- **Surface:** `#ffffff` (White)
- **Text Primary:** `#1e293b` (Slate 800)
- **Text Secondary:** `#64748b` (Slate 500)
- **Border:** `#e2e8f0` (Slate 200)

### Typography
- **Headings:** Inter (700) - Google Fonts
- **Body:** Inter (400, 500) - Google Fonts
- **Monospace (números):** JetBrains Mono

### Spatial System
- Base unit: 4px
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px
- Border radius: 8px (cards), 6px (buttons), 4px (inputs)
- Shadows: `0 1px 3px rgba(0,0,0,0.1)`, `0 4px 6px rgba(0,0,0,0.1)` (elevated)

### Motion Philosophy
- Transiciones suaves: 150ms ease-out para hover, 200ms para modales
- Animaciones de entrada: fade-in + slide-up (200ms)
- Gráficos con animación de dibujado progressive

## 3. Layout & Structure

### Páginas principales
1. **Login/Register** - Autenticación centrada
2. **Dashboard** - Vista general con KPIs y gráficos
3. **Productos/Servicios** - Lista y gestión CRUD
4. **Costos** - Registro de costos por producto
5. **Reportes** - Análisis y visualizaciones
6. **Configuración** - Perfil y preferencias

### Layout del Dashboard
```
┌─────────────────────────────────────────────┐
│ Header: Logo + Nav + User Menu              │
├─────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────┐ │
│ │ KPI 1   │ │ KPI 2   │ │ KPI 3   │ │KPI 4│ │
│ └─────────┘ └─────────┘ └─────────┘ └─────┘ │
│ ┌───────────────────────┐ ┌───────────────┐ │
│ │ Gráfico de Costs      │ │Top Products   │ │
│ │ (línea/bar)           │ │(tabla)        │ │
│ └───────────────────────┘ └───────────────┘ │
└─────────────────────────────────────────────┘
```

## 4. Features & Interactions

### 4.1 Autenticación
- Registro con nombre, email, contraseña
- Login con email y contraseña
- JWT tokens para sesiones (24h)
- Logout con redirección a login
- Validación en tiempo real de campos

### 4.2 Gestión de Productos/Servicios
- **Crear:** Nombre, descripción, tipo (producto/servicio), unidad de medida
- **Listar:** Tabla con búsqueda y filtros
- **Editar:** Modal con formulario pre-poblado
- **Eliminar:** Confirmación antes de eliminar
- **Ver:** Detalle con historial de costos

### 4.3 Registro de Costos

#### Costos Directos
- Materia prima: concepto, cantidad, unidad, precio unitario
- Mano de obra: horas, tarifa/hora, descripción
- Otros directos: descripción, monto

#### Costos Indirectos
- Alquiler: monto proporcional
- Servicios: agua, luz, internet
- Depreciación: equipos, mobiliario
- Otros indirectos: descripción, monto

#### Cálculos Automáticos
```
Costo Directo Total = Σ(costos_directos)
Costo Indirecto Total = Σ(costos_indirectos)
Costo Total = Costo Directo Total + Costo Indirecto Total
Costo Unitario = Costo Total / Cantidad Producida
```

### 4.4 Análisis de Margen
- Precio de venta sugerido (configurable: margen 20%, 30%, 50%)
- Margen de ganancia real
- Punto de equilibrio

### 4.5 Reportes
- **Resumen ejecutivo:** KPIs generales
- **Costos por período:** Gráfico de barras
- **Producto más rentable:** Ranking
- **Variaciones de costos:** Comparativo temporal
- Exportar a PDF (opcional)

## 5. Component Inventory

### Cards/KPIs
- Icono + Label + Valor grande
- Estados: default, hover (elevación)
- Variantes: success (verde), warning (amarillo), danger (rojo)

### Tablas
- Header sticky
- Filas con hover highlight
- Acciones por fila (ver, editar, eliminar)
- Paginación
- Búsqueda integrada

### Formularios
- Labels above inputs
- Validation messages en tiempo real
- Inputs con iconos izquierdo
- Buttons: primary (filled), secondary (outlined)

### Gráficos (Chart.js)
- Barras: costos por período
- Línea: evolución temporal
- Donut: distribución de costos
- Colores consistentes con palette

### Modales
- Overlay oscuro
- Centrado con max-width
- Header + Body + Footer con acciones
- Cerrar con X o click fuera

## 6. Technical Approach

### Stack
- **Frontend:** Astro 4.x + Tailwind CSS 3.x
- **Backend:** Node.js + Express
- **Database:** SQLite (better-sqlite3) + opción MySQL
- **Auth:** JWT (jsonwebtoken)
- **Charts:** Chart.js
- **Icons:** Lucide Icons

### Estructura del Proyecto
```
/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── products.js
│   │   │   ├── costs.js
│   │   │   └── reports.js
│   │   ├── models/
│   │   │   └── index.js
│   │   └── app.js
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── layouts/
│   │   │   └── Layout.astro
│   │   ├── components/
│   │   │   ├── Sidebar.astro
│   │   │   ├── Header.astro
│   │   │   ├── Card.astro
│   │   │   ├── Table.astro
│   │   │   ├── Modal.astro
│   │   │   └── Charts/
│   │   ├── pages/
│   │   │   ├── login.astro
│   │   │   ├── register.astro
│   │   │   ├── dashboard.astro
│   │   │   ├── products/
│   │   │   ├── costs/
│   │   │   ├── reports/
│   │   │   └── api/ (frontend API calls)
│   │   └── styles/
│   │       └── global.css
│   ├── astro.config.mjs
│   ├── tailwind.config.mjs
│   └── package.json
└── SPEC.md
```

### API Endpoints

#### Autenticación
```
POST /api/auth/register  - { name, email, password } → { user, token }
POST /api/auth/login     - { email, password } → { user, token }
GET  /api/auth/me        - (auth) → { user }
```

#### Productos
```
GET    /api/products     - (auth) → [products]
POST   /api/products     - (auth) { name, description, type, unit } → { product }
GET    /api/products/:id - (auth) → { product, costs }
PUT    /api/products/:id - (auth) { name, ... } → { product }
DELETE /api/products/:id - (auth) → { success }
```

#### Costos
```
GET    /api/costs/direct     - (auth, productId?) → [costs]
POST   /api/costs/direct     - (auth) { productId, type, description, amount } → { cost }
PUT    /api/costs/direct/:id - (auth) → { cost }
DELETE /api/costs/direct/:id - (auth) → { success }

GET    /api/costs/indirect   - (auth) → [costs]
POST   /api/costs/indirect  - (auth) { productId, type, description, amount } → { cost }
```

#### Reportes
```
GET /api/reports/summary     - (auth) → { kpis }
GET /api/reports/by-period   - (auth, startDate, endDate) → { data }
GET /api/reports/rentability - (auth) → [products ranked]
GET /api/reports/variations  - (auth, productId) → { history }
```

### Data Models

#### Users
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Products
```sql
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT CHECK(type IN ('producto', 'servicio')),
  unit TEXT DEFAULT 'unidad',
  quantity INTEGER DEFAULT 1,
  selling_price DECIMAL(10,2),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### Direct Costs
```sql
CREATE TABLE direct_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  type TEXT CHECK(type IN ('materia_prima', 'mano_obra', 'otro')),
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  quantity DECIMAL(10,2),
  unit_cost DECIMAL(10,2),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
```

#### Indirect Costs
```sql
CREATE TABLE indirect_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  type TEXT CHECK(type IN ('alquiler', 'servicios', 'depreciacion', 'otro')),
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  proportion DECIMAL(5,2) DEFAULT 100,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
```

### Security
- Contraseñas hasheadas con bcrypt (10 rounds)
- JWT con expiración 24h
- Middleware de autenticación en todas las rutas protegidas
- Validación de inputs en backend
- CORS configurado para desarrollo local