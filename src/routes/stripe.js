'use strict';
const express = require('express');
const router  = express.Router();
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','finance_officer','country_manager','regional_director'];

// ── Stripe SDK ────────────────────────────────────────────────
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('[stripe] STRIPE_SECRET_KEY no configurada — rutas deshabilitadas');
}
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

function stripeAvailable(res) {
  if (!stripe) {
    error(res, 'Stripe no configurado (STRIPE_SECRET_KEY faltante)', 503);
    return false;
  }
  return true;
}

// ── GET /v1/stripe/accounts ───────────────────────────────────
// Lista todas las cuentas Connect del platform
router.get('/accounts', requireAuth, requireRole(...ADMIN), async (req, res) => {
  if (!stripeAvailable(res)) return;
  try {
    const accounts = await stripe.accounts.list({ limit: 100 });
    const mapped = accounts.data.map(a => ({
      id:         a.id,
      merchant:   a.business_profile?.name || a.email || a.id,
      country:    a.country,
      type:       a.type,
      email:      a.email,
      status:     a.charges_enabled ? 'activo' : 'pendiente',
      payoutsEnabled: a.payouts_enabled,
      detailsSubmitted: a.details_submitted,
      createdAt:  new Date(a.created * 1000).toISOString()
    }));
    return success(res, { accounts: mapped, total: mapped.length });
  } catch (e) {
    console.error('[stripe] list accounts:', e.message);
    return error(res, e.message, 502);
  }
});

// ── POST /v1/stripe/accounts ──────────────────────────────────
// Crea una cuenta Connect Express
router.post('/accounts', requireAuth, requireRole(...ADMIN), async (req, res) => {
  if (!stripeAvailable(res)) return;
  const { email, country, type, business_name } = req.body;
  if (!email || !country) return error(res, 'email y country son obligatorios', 400);

  try {
    const account = await stripe.accounts.create({
      type:             type || 'express',
      country:          country.toUpperCase(),
      email,
      business_profile: business_name ? { name: business_name } : undefined,
      capabilities: {
        card_payments: { requested: true },
        transfers:     { requested: true }
      }
    });
    return success(res, {
      id:      account.id,
      email:   account.email,
      country: account.country,
      type:    account.type,
      status:  account.charges_enabled ? 'activo' : 'pendiente'
    }, 201);
  } catch (e) {
    console.error('[stripe] create account:', e.message);
    return error(res, e.message, 502);
  }
});

// ── POST /v1/stripe/accounts/:id/onboard ─────────────────────
// Genera link de onboarding para que el merchant complete su perfil
router.post('/accounts/:id/onboard', requireAuth, requireRole(...ADMIN), async (req, res) => {
  if (!stripeAvailable(res)) return;
  const { return_url, refresh_url } = req.body;
  try {
    const link = await stripe.accountLinks.create({
      account:     req.params.id,
      refresh_url: refresh_url || `${process.env.APP_URL || 'https://innovaafric.com'}/stripe/refresh`,
      return_url:  return_url  || `${process.env.APP_URL || 'https://innovaafric.com'}/stripe/return`,
      type:        'account_onboarding'
    });
    return success(res, { url: link.url, expiresAt: new Date(link.expires_at * 1000).toISOString() });
  } catch (e) {
    console.error('[stripe] onboard link:', e.message);
    return error(res, e.message, 502);
  }
});

// ── GET /v1/stripe/accounts/:id ───────────────────────────────
// Detalle de una cuenta Connect
router.get('/accounts/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  if (!stripeAvailable(res)) return;
  try {
    const account = await stripe.accounts.retrieve(req.params.id);
    return success(res, account);
  } catch (e) {
    console.error('[stripe] retrieve account:', e.message);
    return error(res, e.message, e.statusCode || 502);
  }
});

// ── POST /v1/stripe/payouts ───────────────────────────────────
// Crea un payout manual en una cuenta Connect
router.post('/payouts', requireAuth, requireRole(...ADMIN), async (req, res) => {
  if (!stripeAvailable(res)) return;
  const { account, amount, currency } = req.body;
  if (!account || !amount) return error(res, 'account y amount son obligatorios', 400);

  try {
    const payout = await stripe.payouts.create(
      {
        amount:   Math.round(parseFloat(amount) * 100), // en céntimos
        currency: (currency || 'eur').toLowerCase()
      },
      { stripeAccount: account }
    );
    return success(res, {
      payoutId:   payout.id,
      accountId:  account,
      amount:     payout.amount / 100,
      currency:   payout.currency.toUpperCase(),
      status:     payout.status,
      arrivalDate: new Date(payout.arrival_date * 1000).toISOString()
    });
  } catch (e) {
    console.error('[stripe] create payout:', e.message);
    return error(res, e.message, 502);
  }
});

// ── GET /v1/stripe/balance ────────────────────────────────────
// Saldo de la cuenta platform Stripe
router.get('/balance', requireAuth, requireRole(...ADMIN), async (req, res) => {
  if (!stripeAvailable(res)) return;
  try {
    const balance = await stripe.balance.retrieve();
    return success(res, {
      available: balance.available,
      pending:   balance.pending
    });
  } catch (e) {
    console.error('[stripe] balance:', e.message);
    return error(res, e.message, 502);
  }
});

// ── POST /v1/stripe/webhook ───────────────────────────────────
// Recibe eventos Stripe (registrar en Railway: STRIPE_WEBHOOK_SECRET)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.sendStatus(503);
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.sendStatus(503);

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (e) {
    console.error('[stripe] webhook signature invalid:', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  console.log('[stripe] webhook event:', event.type, event.id);

  switch (event.type) {
    case 'account.updated':
      console.log('[stripe] account updated:', event.data.object.id);
      break;
    case 'payout.paid':
      console.log('[stripe] payout paid:', event.data.object.id);
      break;
    case 'payment_intent.succeeded':
      console.log('[stripe] payment succeeded:', event.data.object.id);
      break;
    case 'payment_intent.payment_failed':
      console.log('[stripe] payment failed:', event.data.object.id);
      break;
    default:
      console.log('[stripe] unhandled event type:', event.type);
  }

  res.json({ received: true });
});

module.exports = router;
