'use strict';
const express = require('express');
const router  = express.Router();
const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');
const { syncWalletToSupabase } = require('../helpers/supabaseSync'); // FIX v1: sincronización con Supabase

const ADMIN = ['admin','super_admin','finance_officer','country_manager','regional_director'];

// GET /v1/savings/goals — admin ve todos, usuario ve los suyos
router.get('/goals', requireAuth, async (req, res) => {
  try {
    const isAdmin = ADMIN.includes(req.user.role);
    const where   = isAdmin ? {} : { userId: req.user.sub || req.user.id };
    const goals   = await prisma.savingsGoal.findMany({ where, orderBy: { createdAt: 'desc' } });
    return success(res, goals.map(g => ({ ...g, remaining: g.target - g.current, progress: g.target > 0 ? Math.round((g.current / g.target) * 100) : 0 })));
  } catch (e) { return error(res, e.message, 500); }
});

// POST /v1/savings/goals
router.post('/goals', requireAuth, async (req, res) => {
  try {
    const { name, target, currency, deadline, autoSave } = req.body;
    if (!name || !target) return error(res, 'name y target son obligatorios', 400);
    const userId = req.user.sub || req.user.id;
    const goal = await prisma.savingsGoal.create({ data: {
      userId, name, target: parseFloat(target),
      currency: currency || 'XAF',
      deadline: deadline ? new Date(deadline) : null,
      autoSave: parseFloat(autoSave || 0)
    }});
    return success(res, { ...goal, remaining: goal.target, progress: 0 }, 201);
  } catch (e) { return error(res, e.message, 500); }
});

// POST /v1/savings/goals/:id/deposit — depositar en objetivo
router.post('/goals/:id/deposit', requireAuth, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || parseFloat(amount) <= 0) return error(res, 'amount requerido y > 0', 400);
    const userId = req.user.sub || req.user.id;
    const goal = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, userId } });
    if (!goal) return error(res, 'Objetivo no encontrado', 404);

    const amountF = parseFloat(amount);
    const curr = goal.currency.toUpperCase();
    const balanceField = `balance${curr.charAt(0)}${curr.slice(1).toLowerCase()}`;
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || (wallet[balanceField] ?? 0) < amountF) return error(res, `Saldo ${curr} insuficiente`, 400);

    const newCurrent = Math.min(goal.current + amountF, goal.target);
    const status     = newCurrent >= goal.target ? 'completado' : 'activo';

    const depositTx = await prisma.$transaction([
      prisma.wallet.update({ where: { userId }, data: { [balanceField]: { decrement: amountF } } }),
      prisma.savingsGoal.update({ where: { id: goal.id }, data: { current: newCurrent, status } })
    ]);

    // FIX v1: sin esto, el depósito no se veía reflejado en XenderMoney
    syncWalletToSupabase(userId, depositTx[0]).catch(function(){});

    return success(res, { goalId: goal.id, deposited: amountF, current: newCurrent, target: goal.target, progress: Math.round((newCurrent / goal.target) * 100), status });
  } catch (e) { return error(res, e.message, 500); }
});

// DELETE /v1/savings/goals/:id — cancelar objetivo y devolver al wallet
router.delete('/goals/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub || req.user.id;
    const goal = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, userId } });
    if (!goal) return error(res, 'Objetivo no encontrado', 404);

    const curr = goal.currency.toUpperCase();
    const balanceField = `balance${curr.charAt(0)}${curr.slice(1).toLowerCase()}`;

    const cancelTx = await prisma.$transaction([
      prisma.wallet.update({ where: { userId }, data: { [balanceField]: { increment: goal.current } } }),
      prisma.savingsGoal.update({ where: { id: goal.id }, data: { status: 'cancelado' } })
    ]);

    // FIX v1: sin esto, la devolución no se veía reflejada en XenderMoney
    syncWalletToSupabase(userId, cancelTx[0]).catch(function(){});
    return success(res, { message: 'Objetivo cancelado.', refunded: goal.current, currency: goal.currency });
  } catch (e) { return error(res, e.message, 500); }
});

// GET /v1/savings/stats
router.get('/stats', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const [total, activo, completado, vol] = await Promise.all([
      prisma.savingsGoal.count(),
      prisma.savingsGoal.count({ where: { status: 'activo' } }),
      prisma.savingsGoal.count({ where: { status: 'completado' } }),
      prisma.savingsGoal.aggregate({ _sum: { target: true, current: true } })
    ]);
    return success(res, { total, activo, completado, totalTarget: vol._sum.target || 0, totalSaved: vol._sum.current || 0 });
  } catch (e) { return error(res, e.message, 500); }
});

module.exports = router;
