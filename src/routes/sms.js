'use strict';
const express = require('express');
const router  = express.Router();
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');
const prisma  = require('../config/prisma');

const ADMIN = ['admin','super_admin','marketing_manager','country_manager','regional_director'];

// ── Twilio SDK ────────────────────────────────────────────────
const twilioReady = !!(
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN  &&
  process.env.TWILIO_PHONE
);
const twilio = twilioReady
  ? require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

if (!twilioReady) {
  console.warn('[sms] Twilio no configurado (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE faltantes)');
}

// ── Detección de país por prefijo ────────────────────────────
function countryFromPhone(phone) {
  if (phone.startsWith('+240')) return 'GQ';
  if (phone.startsWith('+221')) return 'SN';
  if (phone.startsWith('+237')) return 'CM';
  if (phone.startsWith('+223')) return 'ML';
  if (phone.startsWith('+224')) return 'GN';
  if (phone.startsWith('+234')) return 'NG';
  if (phone.startsWith('+34'))  return 'ES';
  if (phone.startsWith('+33'))  return 'FR';
  return '—';
}

// ── GET /v1/sms — historial (EmailLog reutilizado como SmsLog) ─
// Los SMS se guardan en la tabla EmailLog con type='sms'
router.get('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const logs = await prisma.emailLog.findMany({
      where: { type: 'sms' },
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    return success(res, logs.map(l => ({
      id:       l.id,
      to:       l.toFilter,
      message:  l.body,
      status:   l.status,
      provider: 'Twilio',
      date:     l.createdAt
    })));
  } catch (e) {
    console.error('[sms] GET /:', e.message);
    return error(res, e.message, 500);
  }
});

// ── POST /v1/sms/send — envío real por Twilio ─────────────────
router.post('/send', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) return error(res, 'Teléfono y mensaje son obligatorios', 400);
  if (!twilioReady) return error(res, 'Twilio no configurado en el servidor', 503);

  let twilioStatus = 'fallido';
  let twilioSid    = null;

  try {
    const msg = await twilio.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE,
      to
    });
    twilioSid    = msg.sid;
    twilioStatus = msg.status === 'queued' || msg.status === 'sent' ? 'entregado' : msg.status;
  } catch (e) {
    console.error('[sms] Twilio send error:', e.message);
    // Guardamos igualmente el intento como fallido
    twilioStatus = 'fallido';
  }

  // Persistir en DB
  const log = await prisma.emailLog.create({
    data: {
      toFilter:   to,
      subject:    twilioSid || 'sms',
      body:       message,
      type:       'sms',
      sentBy:     req.user?.sub || 'system',
      recipients: 1,
      status:     twilioStatus
    }
  });

  return success(res, {
    id:       log.id,
    to,
    message,
    status:   twilioStatus,
    sid:      twilioSid,
    provider: 'Twilio',
    country:  countryFromPhone(to),
    date:     log.createdAt
  }, 201);
});

// ── POST /v1/sms/send-bulk — envío masivo (por país o rol) ────
router.post('/send-bulk', requireAuth, requireRole(...ADMIN), async (req, res) => {
  if (!twilioReady) return error(res, 'Twilio no configurado en el servidor', 503);

  const { message, country, role, phones } = req.body;
  if (!message) return error(res, 'message es obligatorio', 400);

  let targets = [];

  if (phones && Array.isArray(phones)) {
    // Lista explícita de teléfonos
    targets = phones;
  } else {
    // Resolver desde DB
    const where = {};
    if (country) where.country = country;
    if (role)    where.role    = role;
    const users = await prisma.user.findMany({ where, select: { phone: true } });
    targets = users.map(u => u.phone).filter(Boolean);
  }

  if (!targets.length) return error(res, 'Sin destinatarios', 400);
  if (targets.length > 500) return error(res, 'Máximo 500 destinatarios por llamada', 400);

  let sent = 0, failed = 0;
  for (const phone of targets) {
    try {
      await twilio.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE,
        to:   phone
      });
      sent++;
    } catch {
      failed++;
    }
  }

  // Log del envío masivo
  await prisma.emailLog.create({
    data: {
      toFilter:   country || role || 'custom_list',
      subject:    'bulk_sms',
      body:       message,
      type:       'sms',
      sentBy:     req.user?.sub || 'system',
      recipients: sent,
      status:     failed === targets.length ? 'fallido' : 'enviado'
    }
  });

  return success(res, {
    total: targets.length,
    sent,
    failed,
    message: `${sent} SMS enviados, ${failed} fallidos.`
  });
});

// ── GET /v1/sms/stats ─────────────────────────────────────────
router.get('/stats', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const [total, delivered, failed] = await Promise.all([
      prisma.emailLog.count({ where: { type: 'sms' } }),
      prisma.emailLog.count({ where: { type: 'sms', status: 'entregado' } }),
      prisma.emailLog.count({ where: { type: 'sms', status: 'fallido' } })
    ]);
    return success(res, {
      total,
      delivered,
      failed,
      deliveryRate: total ? Math.round(delivered / total * 100) : 0
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
});

module.exports = router;
