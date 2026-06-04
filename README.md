# INNOVAAFRIC — API Backend

> REST API para el ecosistema financiero tricontinental INNOVAAFRIC  
> Node.js · Express · Prisma · PostgreSQL (Railway + Supabase)

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| ORM | Prisma 6 |
| Base de datos | PostgreSQL (Railway prod / Supabase mirror) |
| Autenticación | JWT (jsonwebtoken) |
| Deploy | Railway (auto-deploy desde `master`) |
| SMS / OTP | Twilio |
| Pagos | Stripe Connect |
| KYC | Smile Identity + Onfido |

---

## Estructura del proyecto

```
├── server.js              # Entry point Express
├── scripts/
│   └── start.js           # Railway start: servidor + migrate deploy en background
├── routes/                # 49 módulos de rutas
│   ├── auth.js
│   ├── transfers.js
│   ├── users.js
│   ├── kyc.js
│   ├── admin.js
│   └── ...
├── prisma/
│   ├── schema.prisma      # Modelos de base de datos
│   └── migrations/        # Historial de migraciones SQL
├── middleware/
│   ├── auth.js            # Verificación JWT
│   └── rateLimit.js
└── .env.example           # Variables de entorno requeridas
```

---

## Instalación local

```bash
# 1. Clonar y entrar al directorio
git clone https://github.com/tu-usuario/innovaafric-api.git
cd innovaafric-api

# 2. Instalar dependencias (genera Prisma client automáticamente)
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 4. Aplicar migraciones
npx prisma migrate deploy

# 5. Arrancar en desarrollo
npm run dev
```

---

## Variables de entorno requeridas

```env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=...
JWT_SECRET=...
STRIPE_SECRET_KEY=sk_live_...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE=+1...
SMILE_PARTNER_ID=...
SMILE_API_KEY=...
```

Ver `.env.example` para la lista completa.

---

## Deploy en Railway

El deploy es **automático** con cada push a `master`:

1. Railway detecta el push
2. Instala dependencias (`npm install` → genera Prisma client)
3. Arranca `scripts/start.js`:
   - Levanta el servidor Express inmediatamente (healthcheck OK)
   - Ejecuta `prisma migrate deploy` en background (con reintentos)

**Variables de entorno**: configurar en Railway Dashboard → Variables.

---

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/register` | Registrar usuario |
| POST | `/api/auth/login` | Login → JWT |
| GET | `/api/transfers` | Listar transferencias |
| POST | `/api/transfers` | Crear transferencia |
| GET | `/api/exchange-rates` | Tasas de cambio |
| GET | `/api/users` | Listar usuarios (admin) |
| POST | `/api/kyc/upload` | Subir documento KYC |

Ver documentación completa: [`docs/02_api_reference.html`](../innovaafric-prod/docs/02_api_reference.html)

---

## Migraciones

```bash
# Aplicar migraciones pendientes (producción)
npx prisma migrate deploy

# Crear nueva migración (desarrollo)
npx prisma migrate dev --name nombre_migracion

# Ver estado de migraciones
npx prisma migrate status
```

Las migraciones están en `prisma/migrations/`. **Nunca editar** archivos de migración ya aplicados.

---

## Plataformas del ecosistema

| App | Repo | Tecnología |
|-----|------|-----------|
| XenderMoney | `innovaafric-prod/xendermoney/` | HTML/JS PWA |
| XenderShop | `innovaafric-prod/xendershop/` | HTML/JS PWA |
| XenderDelivery | `innovaafric-prod/xenderdelivery/` | HTML/JS PWA |
| XenderBigShop | `innovaafric-prod/xenderbigshop/` | HTML/JS PWA |
| Admin Panel | `innovaafric-prod/index.html` | HTML/JS SPA |

Todas las apps usan `localStorage` (`xm_session`) para sesión compartida y `@supabase/supabase-js@2` CDN para consultas directas a Supabase.

---

## Documentación

📚 Documentación completa disponible en [`innovaafric-prod/docs/`](../innovaafric-prod/docs/):

- `01_informe_tecnico.html` — Arquitectura completa
- `02_api_reference.html` — Referencia API
- `07_manual_dashboard.html` — Manual admin (74 módulos)
- `10_manual_integracion_api.html` — Guía para partners

---

## Licencia

Propietario — © 2025 INNOVAAFRIC. Todos los derechos reservados.  
Código confidencial — no distribuir sin autorización.
