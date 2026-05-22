'use strict';

const DB = require('../config/db');

const POINTS_PER_EUR = 10;
const POINTS_PER_1000_XAF = 1;
const POINTS_TO_EUR = 0.01;  // 100 puntos = 1€

function earnPoints(user_id, amount_eur, amount_xaf = 0, source, ref_id) {
  if (!DB.loyalty[user_id]) DB.loyalty[user_id] = { points: 0, total_earned: 0, total_redeemed: 0 };

  const pts_eur = Math.floor(amount_eur * POINTS_PER_EUR);
  const pts_xaf = Math.floor((amount_xaf / 1000) * POINTS_PER_1000_XAF);
  const points  = pts_eur + pts_xaf;
  if (points <= 0) return 0;

  DB.loyalty[user_id].points        += points;
  DB.loyalty[user_id].total_earned  += points;

  DB.loyalty_history.push({
    user_id, points, type: 'earn', source, ref_id,
    balance_after: DB.loyalty[user_id].points,
    created_at: new Date().toISOString()
  });

  return points;
}

function redeemPoints(user_id, points) {
  if (!DB.loyalty[user_id]) return { ok: false, message: 'Sin puntos acumulados' };
  if (DB.loyalty[user_id].points < points) {
    return { ok: false, message: `Puntos insuficientes. Tienes ${DB.loyalty[user_id].points}` };
  }

  const discount_eur = Math.round(points * POINTS_TO_EUR * 100) / 100;
  DB.loyalty[user_id].points          -= points;
  DB.loyalty[user_id].total_redeemed  += points;

  DB.loyalty_history.push({
    user_id, points: -points, type: 'redeem', source: 'order_discount',
    balance_after: DB.loyalty[user_id].points,
    created_at: new Date().toISOString()
  });

  return { ok: true, discount_eur, points_used: points };
}

function getBalance(user_id) {
  return DB.loyalty[user_id] || { points: 0, total_earned: 0, total_redeemed: 0 };
}

module.exports = { earnPoints, redeemPoints, getBalance, POINTS_PER_EUR, POINTS_TO_EUR };
