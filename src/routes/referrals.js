'use strict';

const express = require('express');
const router  = express.Router();

const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { earnPoints } = require('../helpers/loyalty');
const { requireAuth } = require('../middleware/auth');

const REFERRER_BONUS = 500;
const REFERRED_BONUS = 200;

// GET /v1/referrals/code — Obtener mi código de referido
router.get('/code', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user) return error(res, 'Usuario no encontrado', 404);

  let code = user.referralCode;
  if (!code) {
    code = `INV_${user.name.split(' ')[0].toUpperCase()}_${user.id.slice(-4).toUpperCase()}`;
    await prisma.user.update({ where: { id: user.id }, data: { referralCode: code } });
  }

  const referrals = await prisma.referral.findMany({ where: { referrerId: req.user.sub } });

  return success(res, {
    referral_code: code,
    referrals_count: referrals.length,
    total_bonus_earned: referrals.length * REFERRER_BONUS,
    bonus_per_referral: REFERRER_BONUS,
    message: `Comparte tu código y gana ${REFERRER_BONUS} puntos por cada amigo que se registre.`
  });
});

// GET /v1/referrals/stats — Estadísticas de mis referidos
router.get('/stats', requireAuth, async (req, res) => {
  const referrals = await prisma.referral.findMany({
    where: { referrerId: req.user.sub },
    include: { referred: { select: { name: true } } }
  });

  return success(res, {
    total_referrals: referrals.length,
    total_points_earned: referrals.length * REFERRER_BONUS,
    referrals: referrals.map(r => ({
      referred_name: r.referred?.name || 'Usuario desconocido',
      bonus_awarded: r.bonusAwarded,
      joined_at: r.createdAt
    }))
  });
});

// POST /v1/referrals/apply — Aplicar código de referido
router.post('/apply', requireAuth, async (req, res) => {
  const { referral_code } = req.body;
  if (!referral_code) return error(res, 'referral_code requerido', 400);

  const alreadyUsed = await prisma.referral.findFirst({ where: { referredId: req.user.sub } });
  if (alreadyUsed) return error(res, 'Ya usaste un código de referido anteriormente', 409);

  const referrer = await prisma.user.findFirst({ where: { referralCode: referral_code.toUpperCase() } });
  if (!referrer) return error(res, 'Código de referido inválido', 404);
  if (referrer.id === req.user.sub) return error(res, 'No puedes usar tu propio código', 400);

  await prisma.referral.create({
    data: { referrerId: referrer.id, referredId: req.user.sub, bonusAwarded: REFERRER_BONUS }
  });

  await Promise.all([
    earnPoints(referrer.id, 0, 0, 'referral_bonus', req.user.sub).then(async () => {
      await prisma.loyaltyAccount.upsert({
        where: { userId: referrer.id },
        update: { points: { increment: REFERRER_BONUS }, totalEarned: { increment: REFERRER_BONUS } },
        create: { userId: referrer.id, points: REFERRER_BONUS, totalEarned: REFERRER_BONUS }
      });
    }),
    prisma.loyaltyAccount.upsert({
      where: { userId: req.user.sub },
      update: { points: { increment: REFERRED_BONUS }, totalEarned: { increment: REFERRED_BONUS } },
      create: { userId: req.user.sub, points: REFERRED_BONUS, totalEarned: REFERRED_BONUS }
    })
  ]);

  return success(res, {
    referral_code,
    referred_by: referrer.name,
    bonus_earned: REFERRED_BONUS,
    message: `¡Código aplicado! Has ganado ${REFERRED_BONUS} puntos de bienvenida.`
  });
});

module.exports = router;
