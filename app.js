'use strict';

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes     = require('./src/routes/auth');
const moneyRoutes    = require('./src/routes/money');
const shopRoutes     = require('./src/routes/shop');
const bigshopRoutes  = require('./src/routes/bigshop');
const deliveryRoutes = require('./src/routes/delivery');
const utilsRoutes    = require('./src/routes/utils');
const adminRoutes    = require('./src/routes/admin');
const { error }      = require('./src/helpers/response');

const app = express();

// ── Seguridad y parseo ──────────────────────────────────
app.use(helmet());
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

// ── Rutas ───────────────────────────────────────────────
app.use('/v1/auth',     authRoutes);
app.use('/v1/money',    moneyRoutes);
app.use('/v1/shop',     shopRoutes);
app.use('/v1/bigshop',  bigshopRoutes);
app.use('/v1/delivery', deliveryRoutes);
app.use('/v1/utils',    utilsRoutes);
app.use('/v1/admin',    adminRoutes);

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
