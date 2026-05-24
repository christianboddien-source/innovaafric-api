'use strict';

const express = require('express');
const router  = express.Router();

const prisma  = require('../config/prisma');
const { success, error, paginate } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

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

// POST /v1/notifications/send-mass — Envío masivo (admin)
router.post('/send-mass', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { title, body, type = 'info', channel = 'in_app', target } = req.body;
    if (!title || !body) return error(res, 'title y body son requeridos', 400);

    // Resolver destinatarios
    let users = [];
    if (!target || target === 'all') {
      users = await prisma.user.findMany({ select: { id: true } });
    } else if (target.startsWith('country:')) {
      users = await prisma.user.findMany({ where: { country: target.split(':')[1] }, select: { id: true } });
    } else if (target.startsWith('role:')) {
      users = await prisma.user.findMany({ where: { role: target.split(':')[1] }, select: { id: true } });
    } else if (target.startsWith('kyc:')) {
      users = await prisma.user.findMany({ where: { kycStatus: target.split(':')[1] }, select: { id: true } });
    }

    if (!users.length) return error(res, 'No se encontraron destinatarios', 404);

    // Crear notificaciones en batch
    await prisma.notification.createMany({
      data: users.map(u => ({
        id: uuidv4(),
        userId: u.id,
        title,
        body,
        type,
        channel,
        read: false
      }))
    });

    return success(res, { sent: users.length, target: target || 'all', title, type });
  } catch (e) { return error(res, e.message); }
});

module.exports = router;
