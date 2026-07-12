'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const prisma  = require('../config/prisma');
const { success, error, paginate, triggerWebhook } = require('../helpers/response');
const { requireAuth, requireKYC } = require('../middleware/auth');
const { syncWalletToSupabase } = require('../helpers/supabaseSync'); // FIX v1: sincronización con Supabase

const CURRENCY_FIELD = { EUR: 'balanceEur', USD: 'balanceUsd', XAF: 'balanceXaf', XOF: 'balanceXof' };

// POST /v1/tontines — Crear grupo de tontina
router.post('/', requireAuth, requireKYC, async (req, res) => {
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

  const tontineId = `ton_${uuidv4().slice(0, 8)}`;
  const tontine = await prisma.tontine.create({
    data: {
      id: tontineId,
      name, description: description || null,
      adminId: req.user.sub,
      contributionAmount: contribution_amount, currency, frequency, maxMembers: max_members,
      currentRound: 1, status: 'open',
      members: { create: [{ userId: req.user.sub, turn: 1, hasReceived: false }] }
    },
    include: { members: true }
  });

  await triggerWebhook('tontine.created', { id: tontine.id, name, admin_id: req.user.sub, max_members });

  return success(res, {
    id: tontine.id, name: tontine.name,
    contribution_amount, currency, frequency, max_members,
    members_count: 1, status: tontine.status,
    invite_code: `INV_${tontine.id.toUpperCase()}`,
    message: 'Tontina creada. Comparte el código de invitación con los participantes.',
    created_at: tontine.createdAt
  }, 201);
});

// GET /v1/tontines — Listar tontinas del usuario
router.get('/', requireAuth, async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const where = {
    OR: [
      { adminId: req.user.sub },
      { members: { some: { userId: req.user.sub } } }
    ]
  };
  if (status) where.status = status;

  const tontines = await prisma.tontine.findMany({
    where, include: { members: true }, orderBy: { createdAt: 'desc' }
  });

  const result = paginate(tontines.map(t => ({
    id: t.id, name: t.name,
    contribution_amount: t.contributionAmount, currency: t.currency,
    frequency: t.frequency, max_members: t.maxMembers,
    members_count: t.members.length,
    current_round: t.currentRound, status: t.status,
    is_admin: t.adminId === req.user.sub,
    created_at: t.createdAt
  })), page, limit);

  return success(res, result);
});

// GET /v1/tontines/:id — Detalle de tontina
router.get('/:id', requireAuth, async (req, res) => {
  const tontine = await prisma.tontine.findUnique({
    where: { id: req.params.id },
    include: { members: true, contributions: true }
  });
  if (!tontine) return error(res, 'Tontina no encontrada', 404);

  const isMember = tontine.members.some(m => m.userId === req.user.sub);
  if (!isMember) return error(res, 'No eres miembro de esta tontina', 403);

  const myMember = tontine.members.find(m => m.userId === req.user.sub);
  const totalPot = tontine.contributionAmount * tontine.members.length;

  return success(res, {
    ...tontine,
    total_pot: totalPot,
    is_admin: tontine.adminId === req.user.sub,
    my_turn: myMember?.turn
  });
});

// POST /v1/tontines/:id/join — Unirse a una tontina
router.post('/:id/join', requireAuth, requireKYC, async (req, res) => {
  const tontine = await prisma.tontine.findUnique({ where: { id: req.params.id }, include: { members: true } });
  if (!tontine) return error(res, 'Tontina no encontrada', 404);
  if (tontine.status !== 'open') return error(res, 'Esta tontina ya no acepta nuevos miembros', 400);
  if (tontine.members.length >= tontine.maxMembers) return error(res, 'La tontina está llena', 400);
  if (tontine.members.some(m => m.userId === req.user.sub)) return error(res, 'Ya eres miembro de esta tontina', 409);

  const turn = tontine.members.length + 1;
  const newMembersCount = turn;
  const newStatus = newMembersCount === tontine.maxMembers ? 'active' : 'open';

  await prisma.$transaction([
    prisma.tontineMember.create({ data: { tontineId: tontine.id, userId: req.user.sub, turn, hasReceived: false } }),
    prisma.tontine.update({ where: { id: tontine.id }, data: { status: newStatus } })
  ]);

  await triggerWebhook('tontine.member_joined', { tontine_id: tontine.id, user_id: req.user.sub, members_count: newMembersCount });

  return success(res, {
    tontine_id: tontine.id, tontine_name: tontine.name,
    your_turn: turn, members_count: newMembersCount, status: newStatus,
    message: newStatus === 'active' ? 'Tontina completa. ¡La primera ronda comienza!' : `Te has unido. Posición: ${turn} de ${tontine.maxMembers}`
  });
});

// POST /v1/tontines/:id/contribute — Hacer aportación
router.post('/:id/contribute', requireAuth, requireKYC, async (req, res) => {
  const tontine = await prisma.tontine.findUnique({
    where: { id: req.params.id },
    include: { members: true, contributions: true }
  });
  if (!tontine) return error(res, 'Tontina no encontrada', 404);
  if (tontine.status !== 'active') return error(res, 'La tontina no está activa', 400);

  const member = tontine.members.find(m => m.userId === req.user.sub);
  if (!member) return error(res, 'No eres miembro de esta tontina', 403);

  const alreadyContributed = tontine.contributions.some(
    c => c.userId === req.user.sub && c.round === tontine.currentRound
  );
  if (alreadyContributed) return error(res, `Ya aportaste en la ronda ${tontine.currentRound}`, 409);

  const balanceField = CURRENCY_FIELD[tontine.currency] || 'balanceXaf';
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.sub } });
  if (!wallet || wallet[balanceField] < tontine.contributionAmount) {
    return error(res, `Saldo ${tontine.currency} insuficiente para la aportación`, 422);
  }

  const walletAfterContribution = await prisma.wallet.update({ where: { userId: req.user.sub }, data: { [balanceField]: { decrement: tontine.contributionAmount } } });

  // FIX v1: sin esto, la aportación no se veía reflejada en XenderMoney
  syncWalletToSupabase(req.user.sub, walletAfterContribution).catch(function(){});

  const contribution = await prisma.tontineContribution.create({
    data: {
      id: `cnt_${uuidv4().slice(0, 8)}`,
      tontineId: tontine.id, userId: req.user.sub,
      round: tontine.currentRound,
      amount: tontine.contributionAmount, currency: tontine.currency
    }
  });

  const roundContributions = [...tontine.contributions.filter(c => c.round === tontine.currentRound), contribution];
  let payout = null;

  if (roundContributions.length === tontine.members.length) {
    const beneficiary = tontine.members.find(m => m.turn === tontine.currentRound);
    if (beneficiary) {
      const pot = tontine.contributionAmount * tontine.members.length;
      const nextRound = tontine.currentRound + 1;
      const newStatus = nextRound > tontine.members.length ? 'completed' : 'active';

      const payoutTx = await prisma.$transaction([
        prisma.wallet.upsert({
          where: { userId: beneficiary.userId },
          update: { [balanceField]: { increment: pot } },
          create: { userId: beneficiary.userId, [balanceField]: pot }
        }),
        prisma.tontineMember.update({ where: { id: beneficiary.id }, data: { hasReceived: true } }),
        prisma.tontine.update({ where: { id: tontine.id }, data: { currentRound: nextRound, status: newStatus } })
      ]);

      // FIX v1: sin esto, el beneficiario no veía el pago de la ronda en XenderMoney
      syncWalletToSupabase(beneficiary.userId, payoutTx[0]).catch(function(){});

      payout = { beneficiary_id: beneficiary.userId, amount: pot, currency: tontine.currency };
      await triggerWebhook('tontine.payout', { tontine_id: tontine.id, ...payout });
    }
  }

  await triggerWebhook('tontine.contribution', { tontine_id: tontine.id, user_id: req.user.sub, round: contribution.round });

  return success(res, {
    contribution_id: contribution.id,
    tontine_id: tontine.id, round: contribution.round,
    amount: tontine.contributionAmount, currency: tontine.currency,
    contributions_this_round: roundContributions.length,
    total_members: tontine.members.length,
    payout_this_round: payout,
    tontine_status: payout && payout.amount > 0 ? (tontine.currentRound + 1 > tontine.members.length ? 'completed' : 'active') : tontine.status,
    created_at: contribution.createdAt
  });
});

// GET /v1/tontines/:id/history — Historial de aportaciones
router.get('/:id/history', requireAuth, async (req, res) => {
  const tontine = await prisma.tontine.findUnique({
    where: { id: req.params.id },
    include: { members: { where: { userId: req.user.sub } } }
  });
  if (!tontine) return error(res, 'Tontina no encontrada', 404);
  if (!tontine.members.length) return error(res, 'No eres miembro de esta tontina', 403);

  const { round } = req.query;
  const where = { tontineId: req.params.id };
  if (round) where.round = parseInt(round);

  const contributions = await prisma.tontineContribution.findMany({
    where, orderBy: { createdAt: 'desc' }
  });

  return success(res, {
    tontine_id: tontine.id, tontine_name: tontine.name,
    current_round: tontine.currentRound,
    contributions, total: contributions.length
  });
});

module.exports = router;
