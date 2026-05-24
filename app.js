'use strict';

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const swaggerUi    = require('swagger-ui-express');
const swaggerSpec  = require('./src/config/swagger');
const path         = require('path');
require('dotenv').config();

const authRoutes     = require('./src/routes/auth');
const moneyRoutes    = require('./src/routes/money');
const shopRoutes     = require('./src/routes/shop');
const bigshopRoutes  = require('./src/routes/bigshop');
const deliveryRoutes = require('./src/routes/delivery');
const utilsRoutes    = require('./src/routes/utils');
const adminRoutes    = require('./src/routes/admin');
const billsRoutes     = require('./src/routes/bills');
const tontinesRoutes  = require('./src/routes/tontines');
const cardsRoutes     = require('./src/routes/cards');
const reviewsRoutes       = require('./src/routes/reviews');
const wishlistRoutes      = require('./src/routes/wishlist');
const couponsRoutes       = require('./src/routes/coupons');
const loyaltyRoutes       = require('./src/routes/loyalty');
const referralsRoutes     = require('./src/routes/referrals');
const businessRoutes      = require('./src/routes/business');
const notificationsRoutes = require('./src/routes/notifications');
const categoriesRoutes    = require('./src/routes/categories');
const taxesRoutes         = require('./src/routes/taxes');
const banksRoutes         = require('./src/routes/banks');
const loansRoutes         = require('./src/routes/loans');
const chatRoutes          = require('./src/routes/chat');
const accountingRoutes    = require('./src/routes/accounting');
const eventsRoutes        = require('./src/routes/events');
const transfersRoutes     = require('./src/routes/transfers');
const emailsRoutes        = require('./src/routes/emails');
const campaignsRoutes     = require('./src/routes/campaigns');
const apikeysRoutes       = require('./src/routes/apikeys');
const { error }      = require('./src/helpers/response');

const app = express();

// ── Seguridad y parseo ──────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com"],
      styleSrc:    ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://fonts.googleapis.com"],
      connectSrc:  ["'self'", "https://*.tile.openstreetmap.org"],
      imgSrc:      ["'self'", "data:", "https:"],
      fontSrc:     ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com"]
    }
  }
}));
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ───────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Rate Limited', message: 'Máximo 100 req/min. Intente más tarde.', code: 429 }
});
app.use('/v1', limiter);

// ── Logger ──────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Admin Dashboard ─────────────────────────────────────
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'src/views/dashboard.html'));
});

// ── Documentación Swagger ───────────────────────────────
app.use('/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'INNOVAAFRIC API Docs',
  customCss: '.swagger-ui .topbar { background-color: #1a1a2e; }'
}));
app.get('/v1/docs.json', (_req, res) => res.json(swaggerSpec));

// ── Rutas ───────────────────────────────────────────────
app.use('/v1/auth',     authRoutes);
app.use('/v1/money',    moneyRoutes);
app.use('/v1/shop',     shopRoutes);
app.use('/v1/bigshop',  bigshopRoutes);
app.use('/v1/delivery', deliveryRoutes);
app.use('/v1/utils',    utilsRoutes);
app.use('/v1/admin',    adminRoutes);
app.use('/v1/bills',     billsRoutes);
app.use('/v1/tontines',  tontinesRoutes);
app.use('/v1/cards',     cardsRoutes);
app.use('/v1/reviews',       reviewsRoutes);
app.use('/v1/wishlist',      wishlistRoutes);
app.use('/v1/coupons',       couponsRoutes);
app.use('/v1/loyalty',       loyaltyRoutes);
app.use('/v1/referrals',     referralsRoutes);
app.use('/v1/business',      businessRoutes);
app.use('/v1/notifications', notificationsRoutes);
app.use('/v1/categories',    categoriesRoutes);
app.use('/v1/taxes',         taxesRoutes);
app.use('/v1/banks',         banksRoutes);
app.use('/v1/loans',         loansRoutes);
app.use('/v1/chat',          chatRoutes);
app.use('/v1/accounting',    accountingRoutes);
app.use('/v1/events',        eventsRoutes);
app.use('/v1/transfers',     transfersRoutes);
app.use('/v1/emails',        emailsRoutes);
app.use('/v1/campaigns',     campaignsRoutes);
app.use('/v1/apikeys',       apikeysRoutes);

// ── 404 ─────────────────────────────────────────────────
app.use((_req, res) => {
  error(res, 'Endpoint no encontrado. Consulta la documentación en https://api.innovaafric.com/docs', 404);
});

// ── Error handler global ────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  error(res, 'Error interno del servidor', 500);
});

module.exports = app;
