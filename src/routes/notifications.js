'use strict';

const express = require('express');
const router  = express.Router();

const DB = require('../config/db');
const { success, error, paginate } = require('../helpers/response');
const { requireAuth } = require('../middleware/auth');

// GET /v1/notifications — Listar todas las notificaciones
router.get('/', requireAuth, (req, res) => {
  const { page = 1, limit = 20, type, read, channel = 'in_app' } = req.query;

  let notifs = DB.notifications.filter(n => n.user_id === req.user.sub && n.channel === channel);
  if (type) notifs = notifs.filter(n => n.type === type);
  if (read !== undefined) notifs = notifs.filter(n => n.read === (read === 'true'));
  notifs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const unread_count = DB.notifications.filter(n => n.user_id === req.user.sub && !n.read && n.channel === 'in_app').length;

  return success(res, {
    unread_count,
    ...paginate(notifs, page, limit)
  });
});

// GET /v1/notifications/unread — Solo no leídas
router.get('/unread', requireAuth, (req, res) => {
  const notifs = DB.notifications
    .filter(n => n.user_id === req.user.sub && !n.read && n.channel === 'in_app')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return success(res, { items: notifs, total: notifs.length });
});

// PATCH /v1/notifications/:id/read — Marcar una como leída
router.patch('/:id/read', requireAuth, (req, res) => {
  const notif = DB.notifications.find(n => n.id === req.params.id && n.user_id === req.user.sub);
  if (!notif) return error(res, 'Notificación no encontrada', 404);
  notif.read = true;
  notif.read_at = new Date().toISOString();
  return success(res, { id: notif.id, read: true, read_at: notif.read_at });
});

// PATCH /v1/notifications/read-all — Marcar todas como leídas
router.patch('/read-all', requireAuth, (req, res) => {
  const now = new Date().toISOString();
  let count = 0;
  DB.notifications
    .filter(n => n.user_id === req.user.sub && !n.read)
    .forEach(n => { n.read = true; n.read_at = now; count++; });
  return success(res, { marked_read: count, message: `${count} notificaciones marcadas como leídas.` });
});

// DELETE /v1/notifications/:id — Eliminar notificación
router.delete('/:id', requireAuth, (req, res) => {
  const idx = DB.notifications.findIndex(n => n.id === req.params.id && n.user_id === req.user.sub);
  if (idx === -1) return error(res, 'Notificación no encontrada', 404);
  DB.notifications.splice(idx, 1);
  return success(res, { message: 'Notificación eliminada.' });
});

// DELETE /v1/notifications — Eliminar todas las leídas
router.delete('/', requireAuth, (req, res) => {
  const before = DB.notifications.length;
  const remaining = DB.notifications.filter(n => !(n.user_id === req.user.sub && n.read));
  DB.notifications.length = 0;
  DB.notifications.push(...remaining);
  return success(res, { deleted: before - DB.notifications.length, message: 'Notificaciones leídas eliminadas.' });
});

module.exports = router;
