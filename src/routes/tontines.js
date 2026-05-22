'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const DB = require('../config/db');
const { success, error, paginate, triggerWebhook } = require('../helpers/response');
const { requireAuth, requireKYC } = require('../middleware/auth');

// POST /v1/tontines — Crear grupo de tontina
router.post('/', requireAuth, requireKYC, (req, res) => {
  const { name, contribution_amount, currency = 'XAF', frequency, max_members, description } = req.body;
  if (!name || !contribution_amount || !frequency || !max_members) {
    return error(res, 'Campos requeridos: name, contribution_amount, frequency, max_members', 400);
  }

  const validFrequencies = ['weekly', 'biweekly', 'monthly'];
  if (!validFrequencies.includes(frequency)) {
    return error(res, `Frecuencia no válida. Opciones: ${validFrequencies.join(', ')}`, 400);
  }
  if (max_members < 2 || max_members > 50) {
    return error(res, 'max_members debe estar entre 2 y 50', 400);
  }

  const tontine = {
    id: `ton_${uuidv4().slice(0, 8)}`,
    name,
    description: description || null,
    admin_id: req.user.sub,
    contribution_amount,
    currency,
    frequency,
    max_members,
    current_round: 1,
    status: 'open',
    members: [{
      user_id: req.user.sub,
      joined_at: new Date().toISOString(),
      turn: 1,
      has_received: false
    }],
    contributions: [],
    created_at: new Date().toISOString()
  };
  DB.tontines.push(tontine);
  triggerWebhook('tontine.created', { id: tontine.id, name, admin_id: req.user.sub, max_members });

  return success(res, {
    id: tontine.id,
    name: tontine.name,
    contribution_amount, currency, frequency, max_members,
    members_count: 1,
    status: tontine.status,
    invite_code: `INV_${tontine.id.toUpperCase()}`,
    message: 'Tontina creada. Comparte el código de invitación con los participantes.',
    created_at: tontine.created_at
  }, 201);
});

// GET /v1/tontines — Listar tontinas del usuario
router.get('/', requireAuth, (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  let tontines = DB.tontines.filter(t =>
    t.admin_id === req.user.sub || t.members.some(m => m.user_id === req.user.sub)
  );
  if (status) tontines = tontines.filter(t => t.status === status);
  tontines.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const result = paginate(tontines.map(t => ({
    id: t.id, name: t.name,
    contribution_amount: t.contribution_amount, currency: t.currency,
    frequency: t.frequency, max_members: t.max_members,
    members_count: t.members.length,
    current_round: t.current_round,
    status: t.status,
    is_admin: t.admin_id === req.user.sub,
    created_at: t.created_at
  })), page, limit);

  return success(res, result);
});

// GET /v1/tontines/:id — Detalle de tontina
router.get('/:id', requireAuth, (req, res) => {
  const tontine = DB.tontines.find(t => t.id === req.params.id);
  if (!tontine) return error(res, 'Tontina no encontrada', 404);

  const isMember = tontine.members.some(m => m.user_id === req.user.sub);
  if (!isMember) return error(res, 'No eres miembro de esta tontina', 403);

  const totalPot = tontine.contribution_amount * tontine.members.length;
  return success(res, {
    ...tontine,
    total_pot: totalPot,
    is_admin: tontine.admin_id === req.user.sub,
    my_turn: tontine.members.find(m => m.user_id === req.user.sub)?.turn
  });
});

// POST /v1/tontines/:id/join — Unirse a una tontina
router.post('/:id/join', requireAuth, requireKYC, (req, res) => {
  const tontine = DB.tontines.find(t => t.id === req.params.id);
  if (!tontine) return error(res, 'Tontina no encontrada', 404);
  if (tontine.status !== 'open') return error(res, 'Esta tontina ya no acepta nuevos miembros', 400);
  if (tontine.members.length >= tontine.max_members) return error(res, 'La tontina está llena', 400);
  if (tontine.members.some(m => m.user_id === req.user.sub)) {
    return error(res, 'Ya eres miembro de esta tontina', 409);
  }

  const turn = tontine.members.length + 1;
  tontine.members.push({
    user_id: req.user.sub,
    joined_at: new Date().toISOString(),
    turn,
    has_received: false
  });

  if (tontine.members.length === tontine.max_members) {
    tontine.status = 'active';
  }

  triggerWebhook('tontine.member_joined', { tontine_id: tontine.id, user_id: req.user.sub, members_count: tontine.members.length });

  return success(res, {
    tontine_id: tontine.id,
    tontine_name: tontine.name,
    your_turn: turn,
    members_count: tontine.members.length,
    status: tontine.status,
    message: tontine.status === 'active' ? 'Tontina completa. ¡La primera ronda comienza!' : `Te has unido. Posición: ${turn} de ${tontine.max_members}`
  });
});

// POST /v1/tontines/:id/contribute — Hacer aportación
router.post('/:id/contribute', requireAuth, requireKYC, (req, res) => {
  const tontine = DB.tontines.find(t => t.id === req.params.id);
  if (!tontine) return error(res, 'Tontina no encontrada', 404);
  if (tontine.status !== 'active') return error(res, 'La tontina no está activa', 400);

  const member = tontine.members.find(m => m.user_id === req.user.sub);
  if (!member) return error(res, 'No eres miembro de esta tontina', 403);

  const alreadyContributed = tontine.contributions.some(
    c => c.user_id === req.user.sub && c.round === tontine.current_round
  );
  if (alreadyContributed) return error(res, `Ya aportaste en la ronda ${tontine.current_round}`, 409);

  const wallet = DB.wallets[req.user.sub];
  const balanceKey = `balance_${tontine.currency.toLowerCase()}`;
  if (!wallet || wallet[balanceKey] < tontine.contribution_amount) {
    return error(res, `Saldo ${tontine.currency} insuficiente para la aportación`, 422);
  }

  wallet[balanceKey] -= tontine.contribution_amount;

  const contribution = {
    id: `cnt_${uuidv4().slice(0, 8)}`,
    tontine_id: tontine.id,
    user_id: req.user.sub,
    round: tontine.current_round,
    amount: tontine.contribution_amount,
    currency: tontine.currency,
    created_at: new Date().toISOString()
  };
  tontine.contributions.push(contribution);

  // Si todos aportaron en esta ronda → pagar al beneficiario
  const roundContributions = tontine.contributions.filter(c => c.round === tontine.current_round);
  let payout = null;

  if (roundContributions.length === tontine.members.length) {
    const beneficiary = tontine.members.find(m => m.turn === tontine.current_round);
    if (beneficiary) {
      const pot = tontine.contribution_amount * tontine.members.length;
      const beneficiaryWallet = DB.wallets[beneficiary.user_id];
      if (beneficiaryWallet) {
        beneficiaryWallet[balanceKey] = (beneficiaryWallet[balanceKey] || 0) + pot;
        beneficiary.has_received = true;
      }
      tontine.current_round += 1;
      if (tontine.current_round > tontine.members.length) tontine.status = 'completed';
      payout = { beneficiary_id: beneficiary.user_id, amount: pot, currency: tontine.currency };
      triggerWebhook('tontine.payout', { tontine_id: tontine.id, ...payout });
    }
  }

  triggerWebhook('tontine.contribution', { tontine_id: tontine.id, user_id: req.user.sub, round: contribution.round });

  return success(res, {
    contribution_id: contribution.id,
    tontine_id: tontine.id,
    round: contribution.round,
    amount: tontine.contribution_amount,
    currency: tontine.currency,
    contributions_this_round: roundContributions.length,
    total_members: tontine.members.length,
    payout_this_round: payout,
    tontine_status: tontine.status,
    created_at: contribution.created_at
  });
});

// GET /v1/tontines/:id/history — Historial de aportaciones
router.get('/:id/history', requireAuth, (req, res) => {
  const tontine = DB.tontines.find(t => t.id === req.params.id);
  if (!tontine) return error(res, 'Tontina no encontrada', 404);
  if (!tontine.members.some(m => m.user_id === req.user.sub)) {
    return error(res, 'No eres miembro de esta tontina', 403);
  }

  const { round } = req.query;
  let contributions = [...tontine.contributions];
  if (round) contributions = contributions.filter(c => c.round === parseInt(round));
  contributions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return success(res, {
    tontine_id: tontine.id,
    tontine_name: tontine.name,
    current_round: tontine.current_round,
    contributions,
    total: contributions.length
  });
});

module.exports = router;
