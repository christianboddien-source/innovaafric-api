'use strict';

const router = require('express').Router();
const prisma = require('../config/prisma');
const { requireAuth } = require('../middleware/auth');
const { success: ok, error } = require('../helpers/response');
const push = require('../services/push');

const uid = (req) => req.user.sub || req.user.id;

// GET /v1/push/vapid-public-key — el frontend la necesita para suscribirse
router.get('/vapid-public-key', (req, res) => {
  return ok(res, { enabled: push.isEnabled(), publicKey: push.publicKey() });
});

// POST /v1/push/subscribe — guardar la suscripción del navegador
// body: { endpoint, keys: { p256dh, auth } }
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const sub = req.body && (req.body.subscription || req.body);
    const endpoint = sub && sub.endpoint;
    const keys = sub && sub.keys;
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return error(res, 'Suscripción inválida', 400);
    }
    const data = {
      userId: uid(req),
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: (req.headers['user-agent'] || '').slice(0, 250) || null
    };
    // upsert por endpoint (único): si el mismo dispositivo se resuscribe o
    // cambia de usuario, se reasigna.
    const saved = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: data.userId, p256dh: data.p256dh, auth: data.auth, userAgent: data.userAgent },
      create: data
    });
    return ok(res, { subscribed: true, id: saved.id });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/push/unsubscribe — borrar la suscripción (logout / desactivar)
router.post('/unsubscribe', requireAuth, async (req, res) => {
  try {
    const endpoint = req.body && (req.body.endpoint || (req.body.subscription && req.body.subscription.endpoint));
    if (!endpoint) return error(res, 'endpoint requerido', 400);
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: uid(req) } });
    return ok(res, { unsubscribed: true });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/push/test — enviarme una notificación de prueba a mí mismo
router.post('/test', requireAuth, async (req, res) => {
  try {
    const r = await push.sendToUser(uid(req), {
      title: '🔔 InnovaAFRIC',
      body: 'Notificaciones activadas correctamente.',
      url: req.body && req.body.url ? String(req.body.url) : '/',
      tag: 'push-test'
    });
    if (!r.enabled) return error(res, 'Push no configurado en el servidor (faltan claves VAPID)', 503);
    if (!r.sent) return error(res, 'No hay dispositivos suscritos para este usuario', 404);
    return ok(res, r);
  } catch (e) { return error(res, e.message); }
});

module.exports = router;
