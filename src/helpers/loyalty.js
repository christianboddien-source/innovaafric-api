'use strict';

const prisma = require('../config/prisma');

const POINTS_PER_EUR  = 10;
const POINTS_TO_EUR   = 0.01;

async function earnPoints(userId, amountEur, amountXaf = 0, source, refId) {
  const pts = Math.floor(amountEur * POINTS_PER_EUR) + Math.floor((amountXaf / 1000));
  if (pts <= 0) return 0;

  const loyalty = await prisma.loyaltyAccount.upsert({
    where: { userId },
    update: { points: { increment: pts }, totalEarned: { increment: pts } },
    create: { userId, points: pts, totalEarned: pts }
  });

  await prisma.loyaltyHistory.create({
    data: { loyaltyId: loyalty.id, userId, points: pts, type: 'earn', source, refId: refId || null, balanceAfter: loyalty.points }
  });
  return pts;
}

async function redeemPoints(userId, points) {
  const loyalty = await prisma.loyaltyAccount.findUnique({ where: { userId } });
  if (!loyalty || loyalty.points < points) {
    return { ok: false, message: `Puntos insuficientes. Tienes ${loyalty?.points || 0}` };
  }

  const discountEur = Math.round(points * POINTS_TO_EUR * 100) / 100;
  const updated = await prisma.loyaltyAccount.update({
    where: { userId },
    data: { points: { decrement: points }, totalRedeemed: { increment: points } }
  });

  await prisma.loyaltyHistory.create({
    data: { loyaltyId: loyalty.id, userId, points: -points, type: 'redeem', source: 'order_discount', balanceAfter: updated.points }
  });
  return { ok: true, discount_eur: discountEur, points_used: points };
}

async function getBalance(userId) {
  return await prisma.loyaltyAccount.findUnique({ where: { userId } }) || { points: 0, totalEarned: 0, totalRedeemed: 0 };
}

module.exports = { earnPoints, redeemPoints, getBalance, POINTS_PER_EUR, POINTS_TO_EUR };
