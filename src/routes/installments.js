'use strict';
const express = require('express');
const router  = express.Router();
const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','loan_officer','finance_officer','risk_officer','country_manager','regional_director'];

// GET /v1/installments
router.get('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};
    const items = await prisma.installment.findMany({
      where, orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true } } }
    });
    return success(res, items.map(i => ({
      ...i,
      remaining: i.total - i.paid,
      progress: Math.round((i.paid / i.total) * 100)
    })));
  } catch (e) { return error(res, e.message, 500); }
});

// POST /v1/installments
router.post('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { userId, productName, total, currency, months, nextDueDate } = req.body;
    if (!userId || !productName || !total || !months) return error(res, 'userId, productName, total y months son obligatorios', 400);
    const monthlyFee = Math.ceil(parseFloat(total) / parseInt(months));
    const inst = await prisma.installment.create({ data: {
      userId, productName, total: parseFloat(total),
      currency: currency || 'XAF', months: parseInt(months),
      monthlyFee, nextDueDate: nextDueDate ? new Date(nextDueDate) : null,
      status: 'activo'
    }});
    return success(res, { ...inst, remaining: inst.total, progress: 0 }, 201);
  } catch (e) { return error(res, e.message, 500); }
});

// POST /v1/installments/:id/pay — registrar cuota pagada
router.post('/:id/pay', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { amount } = req.body;
    const inst = await prisma.installment.findUnique({ where: { id: req.params.id } });
    if (!inst) return error(res, 'Cuota no encontrada', 404);
    const paid = inst.paid + parseFloat(amount || inst.monthlyFee);
    const status = paid >= inst.total ? 'completado' : 'activo';
    const updated = await prisma.installment.update({
      where: { id: inst.id },
      data:  { paid, status }
    });
    return success(res, { ...updated, remaining: updated.total - updated.paid, progress: Math.round((updated.paid / updated.total) * 100) });
  } catch (e) { return error(res, e.message, e.code === 'P2025' ? 404 : 500); }
});

// PATCH /v1/installments/:id — actualizar estado
router.patch('/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const inst = await prisma.installment.update({
      where: { id: req.params.id },
      data:  { status: req.body.status, notes: req.body.notes }
    });
    return success(res, inst);
  } catch (e) { return error(res, e.message, e.code === 'P2025' ? 404 : 500); }
});

// GET /v1/installments/stats
router.get('/stats', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const [total, activo, completado, vol] = await Promise.all([
      prisma.installment.count(),
      prisma.installment.count({ where: { status: 'activo' } }),
      prisma.installment.count({ where: { status: 'completado' } }),
      prisma.installment.aggregate({ _sum: { total: true, paid: true } })
    ]);
    return success(res, { total, activo, completado, totalValue: vol._sum.total || 0, totalCollected: vol._sum.paid || 0 });
  } catch (e) { return error(res, e.message, 500); }
});

module.exports = router;
