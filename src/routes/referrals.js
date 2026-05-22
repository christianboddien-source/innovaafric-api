'use strict';

const express = require('express');
const router  = express.Router();

const DB = require('../config/db');
const { success, error } = require('../helpers/response');
const { earnPoints } = require('../helpers/loyalty');
const { requireAuth } = require('../middleware/auth');

const REFERRER_BONUS  = 500;
const REFERRED_BONUS  = 200;

function getReferralCode(user_id) {
  const user = DB.users.find(u => u.id === user_id);
  if (!user) return null;
  if (!user.referral_code) {
    user.referral_code = `INV_${user.name.split(' ')[0].toUpperCase()}_${user_id.slice(-4).toUpperCase()}`;
  }
  return user.referral_code;
}

// GET /v1/referrals/code — Obtener mi código de referido
router.get('/code', requireAuth, (req, res) => {
  const code = getReferralCode(req.user.sub);
  if (!code) return error(res, 'Usuario no encontrado', 404);

  const myReferrals = DB.referrals.filter(r => r.referrer_id === req.user.sub);
  const totalBonus  = myReferrals.length * REFERRER_BONUS;

  return success(res, {
    referral_code: code,
    referrals_count: myReferrals.length,
    total_bonus_earned: totalBonus,
    bonus_per_referral: REFERRER_BONUS,
    message: `Comparte tu código y gana ${REFERRER_BONUS} puntos por cada amigo que se registre.`
  });
});

// GET /v1/referrals/stats — Estadísticas de mis referidos
router.get('/stats', requireAuth, (req, res) => {
  const myReferrals = DB.referrals.filter(r => r.referrer_id === req.user.sub);

  const enriched = myReferrals.map(r => {
    const user = DB.users.find(u => u.id === r.referred_id);
    return {
      referred_name: user ? user.name : 'Usuario desconocido',
      bonus_awarded: r.bonus_awarded,
      joined_at: r.created_at
    };
  });

  return success(res, {
    total_referrals: myReferrals.length,
    total_points_earned: myReferrals.length * REFERRER_BONUS,
    referrals: enriched
  });
});

// POST /v1/referrals/apply — Aplicar código de referido (al registrarse o después)
router.post('/apply', requireAuth, (req, res) => {
  const { referral_code } = req.body;
  if (!referral_code) return error(res, 'referral_code requerido', 400);

  const alreadyUsed = DB.referrals.some(r => r.referred_id === req.user.sub);
  if (alreadyUsed) return error(res, 'Ya usaste un código de referido anteriormente', 409);

  const referrer = DB.users.find(u => u.referral_code === referral_code.toUpperCase());
  if (!referrer) return error(res, 'Código de referido inválido', 404);
  if (referrer.id === req.user.sub) return error(res, 'No puedes usar tu propio código', 400);

  // Dar puntos al que refirió
  earnPoints(referrer.id, 0, 0, 'referral_bonus', req.user.sub);
  DB.loyalty[referrer.id].points += REFERRER_BONUS;
  DB.loyalty[referrer.id].total_earned += REFERRER_BONUS;

  // Dar puntos al nuevo usuario
  if (!DB.loyalty[req.user.sub]) DB.loyalty[req.user.sub] = { points: 0, total_earned: 0, total_redeemed: 0 };
  DB.loyalty[req.user.sub].points += REFERRED_BONUS;
  DB.loyalty[req.user.sub].total_earned += REFERRED_BONUS;

  DB.referrals.push({
    referrer_id: referrer.id,
    referred_id: req.user.sub,
    bonus_awarded: REFERRER_BONUS,
    created_at: new Date().toISOString()
  });

  return success(res, {
    referral_code,
    referred_by: referrer.name,
    bonus_earned: REFERRED_BONUS,
    message: `¡Código aplicado! Has ganado ${REFERRED_BONUS} puntos de bienvenida.`
  });
});

module.exports = router;
