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
const locationsRoutes = require('./src/routes/locations');
const comercioRoutes = require('./src/routes/comercio');
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
const pushRoutes          = require('./src/routes/push');
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
const ticketsRoutes       = require('./src/routes/tickets');
const countryconfigRoutes = require('./src/routes/countryconfig');
const payrollRoutes       = require('./src/routes/payroll');
// v26 — Productos Financieros
const insuranceRoutes     = require('./src/routes/insurance');
const savingsRoutes       = require('./src/routes/savings');
const creditRoutes        = require('./src/routes/credit');
const installmentsRoutes  = require('./src/routes/installments');
const investRoutes        = require('./src/routes/invest');
// v27 — Comercio Avanzado
const merchantsRoutes     = require('./src/routes/merchants');
const refundsRoutes       = require('./src/routes/refunds');
const marketplaceRoutes   = require('./src/routes/marketplace');
const promocodesRoutes    = require('./src/routes/promocodes');
// v28 — Partners B2B
const partnersRoutes      = require('./src/routes/partners');
const billingRoutes       = require('./src/routes/billing');
const whitelabelRoutes    = require('./src/routes/whitelabel');
// v30 — Comunicación
const inboxRoutes         = require('./src/routes/inbox');
const smsRoutes           = require('./src/routes/sms');
// KYC standalone
const kycRoutes           = require('./src/routes/kyc');
// v32 — Integraciones
const stripeRoutes        = require('./src/routes/stripe');
const mobilemoneyRoutes   = require('./src/routes/mobilemoney');
const swiftRoutes         = require('./src/routes/swift');
// v34 — 2FA, Comisiones, Rider payment, Representantes
const twoFactorRoutes        = require('./src/routes/two-factor');
const commissionsRoutes      = require('./src/routes/commissions');
const riderPaymentRoutes     = require('./src/routes/rider-payment');
const representativesRoutes  = require('./src/routes/representatives');
const circularesRoutes       = require('./src/routes/circulares');
const { error }      = require('./src/helpers/response');

const app = express();
app.set('trust proxy', 1); // detrás del proxy de Railway — necesario para rate-limit y IPs reales

// ── Seguridad y parseo ──────────────────────────────────
app.use(helmet({
  // OpenStreetMap exige cabecera Referer; el 'no-referrer' por defecto de helmet
  // hacía que los mosaicos del mapa dieran 403 ("Referer is required").
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com"],
      scriptSrcAttr: ["'unsafe-inline'"], // permite onclick= (helmet pone 'none' por defecto y rompe los botones)
      styleSrc:    ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://fonts.googleapis.com"],
      connectSrc:  ["'self'", "https://*.tile.openstreetmap.org"],
      imgSrc:      ["'self'", "data:", "https:"],
      fontSrc:     ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com"]
    }
  }
}));
const ALLOWED_ORIGINS = [
  'https://christianboddien-source.github.io',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://localhost:5173',
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
];
const corsOptions = {
  origin: function(origin, cb) {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, true); // Permisivo por ahora — restringir cuando esté en prod
  },
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','apikey','x-api-key','x-client-id'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Responder preflight en todas las rutas
// Stripe webhook necesita body raw — debe ir ANTES de express.json()
app.use('/v1/stripe/webhook', express.raw({ type: 'application/json' }));
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

// ── Archivos estáticos públicos (manifest, sw, icons) ────
app.use(express.static(path.join(__dirname, 'public')));

// ── Páginas web públicas ─────────────────────────────────
app.get('/',          (_req, res) => res.sendFile(path.join(__dirname, 'src/views/innovaafric.html')));
app.get('/money',     (_req, res) => res.sendFile(path.join(__dirname, 'src/views/xendermoney.html')));
app.get('/shop',      (_req, res) => res.sendFile(path.join(__dirname, 'src/views/xendershop.html')));
app.get('/delivery',  (_req, res) => res.sendFile(path.join(__dirname, 'src/views/xenderdelivery.html')));
app.get('/bigshop',   (_req, res) => res.sendFile(path.join(__dirname, 'src/views/xenderbigshop.html')));
app.get('/perfil',    (_req, res) => res.sendFile(path.join(__dirname, 'src/views/perfil.html')));
app.get('/admin',     (_req, res) => res.sendFile(path.join(__dirname, 'src/views/dashboard.html')));
app.get('/circular',  (_req, res) => res.sendFile(path.join(__dirname, 'src/views/circular.html')));
app.get('/representante', (_req, res) => res.sendFile(path.join(__dirname, 'src/views/representante.html')));
app.get('/rider',     (_req, res) => res.sendFile(path.join(__dirname, 'src/views/rider.html')));
app.get('/comercio',  (_req, res) => res.sendFile(path.join(__dirname, 'src/views/comercio.html')));
app.get('/app',       (_req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

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
app.use('/v1/locations', locationsRoutes);
app.use('/v1/comercio', comercioRoutes);
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
app.use('/v1/push',          pushRoutes);
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
app.use('/v1/tickets',       ticketsRoutes);
app.use('/v1/countryconfig', countryconfigRoutes);
app.use('/v1/payroll',       payrollRoutes);
// v26
app.use('/v1/insurance',    insuranceRoutes);
app.use('/v1/savings',      savingsRoutes);
app.use('/v1/credit',       creditRoutes);
app.use('/v1/installments', installmentsRoutes);
app.use('/v1/invest',       investRoutes);
// v27
app.use('/v1/merchants',    merchantsRoutes);
app.use('/v1/refunds',        refundsRoutes);
app.use('/v1/marketplace',    marketplaceRoutes);
app.use('/v1/promo-codes',    promocodesRoutes);
// v34
app.use('/v1/2fa',              twoFactorRoutes);
app.use('/v1/commissions',      commissionsRoutes);
app.use('/v1/rider-payment',    riderPaymentRoutes);
app.use('/v1/representatives',  representativesRoutes);
app.use('/v1/circulares',       circularesRoutes);
// v28
app.use('/v1/partners',     partnersRoutes);
app.use('/v1/billing',      billingRoutes);
app.use('/v1/white-label',  whitelabelRoutes);
// v30
app.use('/v1/messages',     inboxRoutes);
app.use('/v1/sms',          smsRoutes);
// v32
app.use('/v1/stripe',       stripeRoutes);
app.use('/v1/mobile-money', mobilemoneyRoutes);
app.use('/v1/swift',        swiftRoutes);
app.use('/v1/kyc',          kycRoutes);

// ── 404 ─────────────────────────────────────────────────
app.use((req, res) => {
  // Si es una petición de navegador (accept html), servir página 404
  if(req.headers.accept && req.headers.accept.includes('text/html')) {
    return res.status(404).sendFile(path.join(__dirname, 'src/views/404.html'));
  }
  error(res, 'Endpoint no encontrado. Consulta la documentación en /v1/docs', 404);
});

// ── Error handler global ────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  error(res, 'Error interno del servidor', 500);
});

module.exports = app;
