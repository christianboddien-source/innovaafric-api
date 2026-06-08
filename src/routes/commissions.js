'use strict';
const router = require('express').Router();
const prisma  = require('../config/prisma');
const { requireAuth: authenticate, requireRole } = require('../middleware/auth');
const { ok, error } = require('../helpers/response');
const { seedDefaultConfigs } = require('../services/commission');

// ── Configuración de rates ────────────────────────────────────

// GET /v1/commissions/config — lista todas las configs
router.get('/config', authenticate, requireRole('admin','super_admin','finance_officer'), async (req, res) => {
  try {
    const configs = await prisma.commissionConfig.findMany({ orderBy: [{ country: 'asc' }, { feeType: 'asc' }] });
    return ok(res, configs);
  } catch (e) { return error(res, e.message); }
});

// POST /v1/commissions/config — crear/actualizar una config
router.post('/config', authenticate, requireRole('admin','super_admin','finance_officer'), async (req, res) => {
  try {
    const { country = '*', feeType, totalRate, ivaRate, repRate, description } = req.body;
    if (!feeType || totalRate == null) return error(res, 'feeType y totalRate requeridos', 400);

    const config = await prisma.commissionConfig.upsert({
      where: { country_feeType: { country, feeType } },
      update: { totalRate, ivaRate, repRate, description, active: true, updatedBy: req.user.id },
      create: { country, feeType, totalRate, ivaRate: ivaRate ?? 0.19, repRate: repRate ?? 0, description, updatedBy: req.user.id }
    });

    return ok(res, config);
  } catch (e) { return error(res, e.message); }
});

// DELETE /v1/commissions/config/:id — desactivar una config
router.delete('/config/:id', authenticate, requireRole('admin','super_admin'), async (req, res) => {
  try {
    await prisma.commissionConfig.update({ where: { id: req.params.id }, data: { active: false } });
    return ok(res, { message: 'Config desactivada' });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/commissions/config/seed — sembrar defaults si no existen
router.post('/config/seed', authenticate, requireRole('admin','super_admin'), async (req, res) => {
  try {
    await seedDefaultConfigs();
    return ok(res, { message: 'Configuraciones por defecto creadas' });
  } catch (e) { return error(res, e.message); }
});

// ── Registros de comisiones ───────────────────────────────────

// GET /v1/commissions/records — historial con filtros
router.get('/records', authenticate, requireRole('admin','super_admin','finance_officer','auditor'), async (req, res) => {
  try {
    const { feeType, repId, from, to, page = 1, limit = 50 } = req.query;
    const where = {};
    if (feeType) where.feeType = feeType;
    if (repId)   where.repId   = repId;
    if (from || to) where.createdAt = { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) };

    const [records, total] = await Promise.all([
      prisma.commissionRecord.findMany({
        where, orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit, take: Number(limit)
      }),
      prisma.commissionRecord.count({ where })
    ]);

    const totals = await prisma.commissionRecord.aggregate({
      where,
      _sum: { grossFee: true, ivaAmount: true, innovaAmount: true, repAmount: true }
    });

    return ok(res, { records, total, page: Number(page), totals: totals._sum });
  } catch (e) { return error(res, e.message); }
});

// GET /v1/commissions/summary — resumen por tipo de fee
router.get('/summary', authenticate, requireRole('admin','super_admin','finance_officer'), async (req, res) => {
  try {
    const { from, to } = req.query;
    const where = {};
    if (from || to) where.createdAt = { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) };

    const byType = await prisma.commissionRecord.groupBy({
      by: ['feeType'],
      where,
      _sum: { grossFee: true, ivaAmount: true, innovaAmount: true, repAmount: true },
      _count: { id: true }
    });

    return ok(res, byType);
  } catch (e) { return error(res, e.message); }
});

// ── Representantes ─────────────────────────────────────────────

// GET /v1/commissions/representatives — lista de representantes con stats
router.get('/representatives', authenticate, requireRole('admin','super_admin','finance_officer','country_manager'), async (req, res) => {
  try {
    const reps = await prisma.representative.findMany({
      include: { user: { select: { id: true, name: true, email: true, phone: true, country: true } } },
      orderBy: { totalEarned: 'desc' }
    });
    // Añadir comisiones pendientes del mes actual
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyEarnings = await prisma.commissionRecord.groupBy({
      by: ['repId'],
      where: { repId: { not: null }, createdAt: { gte: firstOfMonth } },
      _sum: { repAmount: true }
    });
    const earningsMap = Object.fromEntries(monthlyEarnings.map(e => [e.repId, e._sum.repAmount]));

    const result = reps.map(r => ({
      ...r,
      thisMonthEarned: earningsMap[r.userId] ?? 0
    }));

    return ok(res, result);
  } catch (e) { return error(res, e.message); }
});

// POST /v1/commissions/representatives — registrar nuevo representante
router.post('/representatives', authenticate, requireRole('admin','super_admin','country_manager'), async (req, res) => {
  try {
    const { userId, zone, country, commissionRate, notes } = req.body;
    if (!userId || !zone || !country) return error(res, 'userId, zone y country requeridos', 400);

    const rep = await prisma.representative.upsert({
      where: { userId },
      update: { zone, country, commissionRate: commissionRate ?? 0.005, notes, status: 'active' },
      create: { userId, zone, country, commissionRate: commissionRate ?? 0.005, notes }
    });

    return ok(res, rep);
  } catch (e) { return error(res, e.message); }
});

// PATCH /v1/commissions/representatives/:userId/assign-clients — asignar clientes a un rep
router.patch('/representatives/:repUserId/assign-clients', authenticate, requireRole('admin','super_admin','country_manager'), async (req, res) => {
  try {
    const { clientIds } = req.body;
    if (!Array.isArray(clientIds) || !clientIds.length) return error(res, 'clientIds[] requerido', 400);

    await prisma.user.updateMany({
      where: { id: { in: clientIds } },
      data: { representativeId: req.params.repUserId }
    });

    await prisma.representative.updateMany({
      where: { userId: req.params.repUserId },
      data: { clientCount: { increment: clientIds.length } }
    });

    return ok(res, { message: `${clientIds.length} clientes asignados al representante` });
  } catch (e) { return error(res, e.message); }
});

module.exports = router;
