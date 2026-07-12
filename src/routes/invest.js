'use strict';
const express = require('express');
const router  = express.Router();
const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');
const { syncWalletToSupabase } = require('../helpers/supabaseSync'); // FIX v1: sincronización con Supabase

const ADMIN = ['admin','super_admin','finance_officer','risk_officer','country_manager','regional_director'];

// GET /v1/invest/funds
router.get('/funds', requireAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};
    const funds = await prisma.investmentFund.findMany({
      where, orderBy: { createdAt: 'desc' },
      include: { _count: { select: { investments: true } } }
    });
    return success(res, funds.map(f => ({
      ...f, investors: f._count.investments,
      progress: f.target > 0 ? Math.round((f.raised / f.target) * 100) : 0
    })));
  } catch (e) { return error(res, e.message, 500); }
});

// POST /v1/invest/funds — admin crea fondo
router.post('/funds', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { name, category, target, currency, minInvest, returnRate, durationMonths } = req.body;
    if (!name || !target) return error(res, 'name y target son obligatorios', 400);
    const fund = await prisma.investmentFund.create({ data: {
      name, category: category || 'general',
      target: parseFloat(target), currency: currency || 'XAF',
      minInvest: parseFloat(minInvest || 25000),
      returnRate: parseFloat(returnRate || 8),
      durationMonths: parseInt(durationMonths || 24)
    }});
    return success(res, fund, 201);
  } catch (e) { return error(res, e.message, 500); }
});

// POST /v1/invest/funds/:id/invest — usuario invierte
router.post('/funds/:id/invest', requireAuth, async (req, res) => {
  try {
    const { amount, currency } = req.body;
    if (!amount) return error(res, 'amount es obligatorio', 400);
    const fund = await prisma.investmentFund.findUnique({ where: { id: req.params.id } });
    if (!fund)               return error(res, 'Fondo no encontrado', 404);
    if (fund.status !== 'activo') return error(res, 'Fondo cerrado', 400);
    if (parseFloat(amount) < fund.minInvest) return error(res, `Mínimo de inversión: ${fund.minInvest} ${fund.currency}`, 400);

    const userId = req.user.sub || req.user.id;
    // Descontar del wallet
    const curr = (currency || fund.currency).toUpperCase();
    const balanceField = `balance${curr.charAt(0)}${curr.slice(1).toLowerCase()}`;
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || (wallet[balanceField] ?? 0) < parseFloat(amount)) return error(res, `Saldo ${curr} insuficiente`, 400);

    const investTx = await prisma.$transaction([
      prisma.wallet.update({ where: { userId }, data: { [balanceField]: { decrement: parseFloat(amount) } } }),
      prisma.fundInvestment.create({ data: { fundId: fund.id, userId, amount: parseFloat(amount), currency: curr } }),
      prisma.investmentFund.update({ where: { id: fund.id }, data: { raised: { increment: parseFloat(amount) } } })
    ]);

    // FIX v1: sin esto, la inversión no se veía reflejada en XenderMoney
    syncWalletToSupabase(userId, investTx[0]).catch(function(){});

    return success(res, { fundId: fund.id, fundName: fund.name, amount: parseFloat(amount), currency: curr, returnRate: fund.returnRate, message: '¡Inversión registrada!' }, 201);
  } catch (e) { return error(res, e.message, 500); }
});

// GET /v1/invest/my — inversiones del usuario
router.get('/my', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub || req.user.id;
    const investments = await prisma.fundInvestment.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' },
      include: { fund: { select: { id: true, name: true, category: true, returnRate: true, durationMonths: true, status: true } } }
    });
    return success(res, { investments, total: investments.length });
  } catch (e) { return error(res, e.message, 500); }
});

// GET /v1/invest/stats
router.get('/stats', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const [totalFunds, activeFunds, vol, totalInvestors] = await Promise.all([
      prisma.investmentFund.count(),
      prisma.investmentFund.count({ where: { status: 'activo' } }),
      prisma.investmentFund.aggregate({ _sum: { raised: true } }),
      prisma.fundInvestment.count()
    ]);
    return success(res, { totalFunds, activeFunds, totalRaised: vol._sum.raised || 0, totalInvestors });
  } catch (e) { return error(res, e.message, 500); }
});

module.exports = router;
