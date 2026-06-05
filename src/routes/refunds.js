'use strict';
const express = require('express');
const router  = express.Router();
const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','support_agent','support_supervisor','country_manager','regional_director'];

// GET /v1/refunds
router.get('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};
    const refunds = await prisma.refundRequest.findMany({ where, orderBy: { createdAt: 'desc' } });
    return success(res, refunds);
  } catch (e) { return error(res, e.message, 500); }
});

// POST /v1/refunds — usuario crea solicitud
router.post('/', requireAuth, async (req, res) => {
  try {
    const { orderId, merchantName, amount, currency, reason } = req.body;
    if (!amount || !reason) return error(res, 'amount y reason son obligatorios', 400);
    const userId = req.user.sub || req.user.id;
    const user   = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });

    const refund = await prisma.refundRequest.create({ data: {
      orderId: orderId || null, userId,
      userEmail: user?.email || req.user.email || '',
      merchantName: merchantName || null,
      amount: parseFloat(amount), currency: currency || 'XAF',
      reason, status: 'pendiente'
    }});
    return success(res, refund, 201);
  } catch (e) { return error(res, e.message, 500); }
});

// PATCH /v1/refunds/:id/approve
router.patch('/:id/approve', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { notes } = req.body;
    const refund = await prisma.refundRequest.findUnique({ where: { id: req.params.id } });
    if (!refund) return error(res, 'Reembolso no encontrado', 404);
    if (refund.status !== 'pendiente') return error(res, 'Solo se pueden aprobar solicitudes pendientes', 400);

    // Devolver saldo al wallet del usuario si existe
    if (refund.userId) {
      const curr = refund.currency.toUpperCase();
      const balanceField = `balance${curr.charAt(0)}${curr.slice(1).toLowerCase()}`;
      await prisma.wallet.upsert({
        where:  { userId: refund.userId },
        update: { [balanceField]: { increment: refund.amount } },
        create: { userId: refund.userId, [balanceField]: refund.amount }
      });
    }

    const updated = await prisma.refundRequest.update({
      where: { id: req.params.id },
      data:  { status: 'aprobada', notes: notes || null, processedBy: req.user.sub, processedAt: new Date() }
    });
    return success(res, updated);
  } catch (e) { return error(res, e.message, 500); }
});

// PATCH /v1/refunds/:id/reject
router.patch('/:id/reject', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { notes } = req.body;
    const updated = await prisma.refundRequest.update({
      where: { id: req.params.id },
      data:  { status: 'rechazada', notes: notes || 'Rechazado por support', processedBy: req.user.sub, processedAt: new Date() }
    });
    return success(res, updated);
  } catch (e) { return error(res, e.message, e.code === 'P2025' ? 404 : 500); }
});

// PATCH /v1/refunds/:id — actualizar estado genérico
router.patch('/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const refund = await prisma.refundRequest.update({ where: { id: req.params.id }, data: { status: req.body.status, notes: req.body.notes } });
    return success(res, refund);
  } catch (e) { return error(res, e.message, e.code === 'P2025' ? 404 : 500); }
});

// GET /v1/refunds/stats
router.get('/stats', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const [total, pendiente, aprobada, rechazada, vol] = await Promise.all([
      prisma.refundRequest.count(),
      prisma.refundRequest.count({ where: { status: 'pendiente' } }),
      prisma.refundRequest.count({ where: { status: 'aprobada' } }),
      prisma.refundRequest.count({ where: { status: 'rechazada' } }),
      prisma.refundRequest.aggregate({ _sum: { amount: true }, where: { status: 'aprobada' } })
    ]);
    return success(res, { total, pendiente, aprobada, rechazada, totalRefunded: vol._sum.amount || 0 });
  } catch (e) { return error(res, e.message, 500); }
});

module.exports = router;
