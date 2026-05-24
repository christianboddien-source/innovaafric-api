'use strict';

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ok, error } = require('../helpers/response');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const prisma  = new PrismaClient();
const requireAdmin = requireRole('admin', 'super_admin', 'payroll_manager', 'finance_officer', 'country_manager', 'regional_director');

/* GET /payroll — lista de nóminas */
router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const runs = await prisma.payrollRun.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true } } }
    });
    const stats = {
      total:    runs.length,
      draft:    runs.filter(r => r.status === 'draft').length,
      executed: runs.filter(r => r.status === 'executed').length,
      totalPaid: runs.filter(r => r.status === 'executed').reduce((s, r) => s + r.totalAmount, 0)
    };
    ok(res, { runs, stats });
  } catch (e) { error(res, e.message); }
});

/* GET /payroll/:id — detalle con items */
router.get('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.id },
      include: { items: true }
    });
    if (!run) return error(res, 'Nómina no encontrada', 404);
    ok(res, run);
  } catch (e) { error(res, e.message); }
});

/* POST /payroll — crear nómina calculada */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { period, currency, ratePerDelivery = 500, notes } = req.body;
    if (!period) return error(res, 'period es requerido (ej: 2026-05)', 400);

    // Obtener riders con sus entregas del período
    const riders = await prisma.rider.findMany({ orderBy: { name: 'asc' } });
    if (!riders.length) return error(res, 'No hay riders registrados', 404);

    const items = riders.map(r => ({
      id:             uuidv4(),
      riderId:        r.id,
      riderName:      r.name,
      deliveries:     r.deliveriesTotal || 0,
      ratePerDelivery: parseFloat(ratePerDelivery),
      amount:         (r.deliveriesTotal || 0) * parseFloat(ratePerDelivery),
      status:         'pending'
    }));

    const totalAmount = items.reduce((s, i) => s + i.amount, 0);
    const run = await prisma.payrollRun.create({
      data: {
        id: uuidv4(), period,
        currency: currency || 'XAF',
        totalAmount, notes: notes || null,
        status: 'draft',
        createdBy: req.user.sub,
        items: { create: items }
      },
      include: { items: true }
    });
    ok(res, run, 201);
  } catch (e) { error(res, e.message); }
});

/* PATCH /payroll/:id/execute — ejecutar nómina */
router.patch('/:id/execute', requireAuth, requireAdmin, async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.id },
      include: { items: true }
    });
    if (!run) return error(res, 'Nómina no encontrada', 404);
    if (run.status === 'executed') return error(res, 'Esta nómina ya fue ejecutada', 400);

    // Marcar todos los items como pagados
    await prisma.payrollItem.updateMany({
      where: { payrollId: run.id },
      data:  { status: 'paid' }
    });
    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data:  { status: 'executed', executedAt: new Date() }
    });
    ok(res, updated);
  } catch (e) { error(res, e.message); }
});

/* DELETE /payroll/:id — eliminar nómina borrador */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: req.params.id } });
    if (!run) return error(res, 'Nómina no encontrada', 404);
    if (run.status === 'executed') return error(res, 'No se puede eliminar una nómina ejecutada', 400);
    await prisma.payrollItem.deleteMany({ where: { payrollId: run.id } });
    await prisma.payrollRun.delete({ where: { id: run.id } });
    ok(res, { message: 'Nómina eliminada' });
  } catch (e) { error(res, e.message); }
});

module.exports = router;
