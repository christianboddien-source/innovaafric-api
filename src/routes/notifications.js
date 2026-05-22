'use strict';

const express = require('express');
const router  = express.Router();

const prisma  = require('../config/prisma');
const { success, error, paginate } = require('../helpers/response');
const { requireAuth } = require('../middleware/auth');

// GET /v1/notifications — Listar todas las notificaciones
router.get('/', requireAuth, async (req, res) => {
  const { page = 1, limit = 20, type, read, channel = 'in_app' } = req.query;
  const where = { userId: req.user.sub, channel };
  if (type) where.type = type;
  if (read !== undefined) where.read = read === 'true';

  const [notifs, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' } }),
    prisma.notification.count({ where: { userId: req.user.sub, read: false, channel: 'in_app' } })
  ]);

  return success(res, { unread_count: unreadCount, ...paginate(notifs, page, limit) });
});

// GET /v1/notifications/unread — Solo no leídas
router.get('/unread', requireAuth, async (req, res) => {
  const notifs = await prisma.notification.findMany({
    where: { userId: req.user.sub, read: false, channel: 'in_app' },
    orderBy: { createdAt: 'desc' }
  });
  return success(res, { items: notifs, total: notifs.length });
});

// PATCH /v1/notifications/read-all — Marcar todas como leídas
router.patch('/read-all', requireAuth, async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user.sub, read: false },
    data: { read: true, readAt: new Date() }
  });
  return success(res, { marked_read: result.count, message: `${result.count} notificaciones marcadas como leídas.` });
});

// PATCH /v1/notifications/:id/read — Marcar una como leída
router.patch('/:id/read', requireAuth, async (req, res) => {
  const notif = await prisma.notification.findFirst({ where: { id: req.params.id, userId: req.user.sub } });
  if (!notif) return error(res, 'Notificación no encontrada', 404);
  const updated = await prisma.notification.update({ where: { id: notif.id }, data: { read: true, readAt: new Date() } });
  return success(res, { id: updated.id, read: true, read_at: updated.readAt });
});

// DELETE /v1/notifications/:id — Eliminar notificación
router.delete('/:id', requireAuth, async (req, res) => {
  const notif = await prisma.notification.findFirst({ where: { id: req.params.id, userId: req.user.sub } });
  if (!notif) return error(res, 'Notificación no encontrada', 404);
  await prisma.notification.delete({ where: { id: notif.id } });
  return success(res, { message: 'Notificación eliminada.' });
});

// DELETE /v1/notifications — Eliminar todas las leídas
router.delete('/', requireAuth, async (req, res) => {
  const result = await prisma.notification.deleteMany({ where: { userId: req.user.sub, read: true } });
  return success(res, { deleted: result.count, message: 'Notificaciones leídas eliminadas.' });
});

module.exports = router;
