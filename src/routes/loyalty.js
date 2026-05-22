'use strict';

const express = require('express');
const router  = express.Router();

const prisma  = require('../config/prisma');
const { success, error, paginate } = require('../helpers/response');
const { earnPoints, redeemPoints, getBalance, POINTS_PER_EUR, POINTS_TO_EUR } = require('../helpers/loyalty');
const { requireAuth, requireKYC } = require('../middleware/auth');

// GET /v1/loyalty/balance
router.get('/balance', requireAuth, async (req, res) => {
  const bal = await getBalance(req.user.sub);
  return success(res, {
    user_id: req.user.sub,
    points: bal.points,
    total_earned: bal.totalEarned,
    total_redeemed: bal.totalRedeemed,
    equivalent_eur: Math.round(bal.points * POINTS_TO_EUR * 100) / 100,
    earning_rate: `${POINTS_PER_EUR} puntos por cada 1€ gastado`,
    redeem_rate: '100 puntos = 1€ de descuento'
  });
});

// GET /v1/loyalty/history
router.get('/history', requireAuth, async (req, res) => {
  const { page = 1, limit = 20, type } = req.query;
  const where = { userId: req.user.sub };
  if (type) where.type = type;

  const history = await prisma.loyaltyHistory.findMany({ where, orderBy: { createdAt: 'desc' } });
  return success(res, paginate(history, page, limit));
});

// POST /v1/loyalty/redeem — Canjear puntos por descuento
router.post('/redeem', requireAuth, requireKYC, async (req, res) => {
  const { points } = req.body;
  if (!points || points < 100) return error(res, 'Mínimo 100 puntos para canjear', 400);
  if (points % 100 !== 0) return error(res, 'Solo se pueden canjear múltiplos de 100 puntos', 400);

  const result = await redeemPoints(req.user.sub, points);
  if (!result.ok) return error(res, result.message, 422);

  const bal = await getBalance(req.user.sub);
  return success(res, {
    points_redeemed: result.points_used,
    discount_eur: result.discount_eur,
    remaining_points: bal.points,
    message: `${result.points_used} puntos canjeados por ${result.discount_eur}€ de descuento en tu próximo pedido.`
  });
});

// POST /v1/loyalty/earn — Ganar puntos manualmente (para pruebas / admin)
router.post('/earn', requireAuth, async (req, res) => {
  const { amount_eur = 0, amount_xaf = 0 } = req.body;
  if (!amount_eur && !amount_xaf) return error(res, 'Indica amount_eur o amount_xaf', 400);

  const points = await earnPoints(req.user.sub, amount_eur, amount_xaf, 'manual', null);
  const bal = await getBalance(req.user.sub);
  return success(res, {
    points_earned: points,
    total_points: bal.points,
    message: `+${points} puntos añadidos a tu cuenta.`
  });
});

module.exports = router;
