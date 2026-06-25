'use strict';

// ─────────────────────────────────────────────────────────────
// Web Push (VAPID) — notificaciones del navegador / PWA
//
// Configuración por variables de entorno (Railway):
//   VAPID_PUBLIC_KEY   — clave pública (también la usa el frontend)
//   VAPID_PRIVATE_KEY  — clave privada
//   VAPID_SUBJECT      — mailto:... o URL de contacto (opcional)
//
// Generar un par de claves una sola vez con:
//   node scripts/gen-vapid.js
// y pegarlas en las variables de Railway.
//
// Si no hay claves configuradas, el push queda DESACTIVADO de forma
// silenciosa (los endpoints responden { enabled:false } y el resto de
// la app sigue funcionando igual).
// ─────────────────────────────────────────────────────────────

const prisma = require('../config/prisma');

let webpush = null;
let configured = false;

function init() {
  if (configured) return webpush;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) { configured = true; return null; }
  try {
    webpush = require('web-push');
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:soporte@innovaafric.com',
      pub, priv
    );
  } catch (e) {
    console.warn('[PUSH] web-push no disponible:', e.message);
    webpush = null;
  }
  configured = true;
  return webpush;
}

function isEnabled() {
  return !!init();
}

function publicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

// Envía una notificación a TODOS los dispositivos suscritos de un usuario.
// payload: { title, body, url?, tag?, icon? }
// Devuelve { sent, failed }. Nunca lanza: el push es best-effort.
async function sendToUser(userId, payload) {
  const wp = init();
  if (!wp || !userId) return { sent: 0, failed: 0, enabled: false };

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (!subs.length) return { sent: 0, failed: 0, enabled: true };

  const body = JSON.stringify({
    title: payload.title || 'INNOVAAFRIC',
    body: payload.body || '',
    url: payload.url || '/',
    tag: payload.tag || undefined,
    icon: payload.icon || '/icons/icon-192.png'
  });

  let sent = 0, failed = 0;
  const dead = [];
  await Promise.all(subs.map(async (s) => {
    const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      await wp.sendNotification(subscription, body);
      sent++;
    } catch (err) {
      failed++;
      // 404/410 = suscripción caducada → la eliminamos
      if (err.statusCode === 404 || err.statusCode === 410) dead.push(s.endpoint);
    }
  }));

  if (dead.length) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: dead } } }).catch(() => {});
  }
  return { sent, failed, enabled: true };
}

// Envía a varios usuarios (best-effort, en paralelo).
async function sendToUsers(userIds, payload) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  const results = await Promise.all(ids.map((id) => sendToUser(id, payload)));
  return results.reduce((acc, r) => ({
    sent: acc.sent + (r.sent || 0),
    failed: acc.failed + (r.failed || 0),
    enabled: acc.enabled || r.enabled
  }), { sent: 0, failed: 0, enabled: false });
}

module.exports = { isEnabled, publicKey, sendToUser, sendToUsers };
