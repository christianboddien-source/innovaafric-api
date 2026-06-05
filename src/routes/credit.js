'use strict';
const express = require('express');
const router  = express.Router();
const prisma  = require('../config/prisma');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN = ['admin','super_admin','loan_officer','finance_officer','risk_officer','compliance_officer','country_manager','regional_director'];

// GET /v1/credit/scores
router.get('/scores', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const scores = await prisma.creditScore.findMany({
      orderBy: { score: 'desc' },
      include: { user: { select: { id: true, name: true, email: true, country: true } } }
    });
    return success(res, scores);
  } catch (e) { return error(res, e.message, 500); }
});

// GET /v1/credit/scores/:userId
router.get('/scores/:userId', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const score = await prisma.creditScore.findFirst({
      where: { userId: req.params.userId },
      include: { user: { select: { id: true, name: true, email: true, country: true } } }
    });
    if (!score) return error(res, 'Score no encontrado', 404);
    return success(res, score);
  } catch (e) { return error(res, e.message, 500); }
});

// POST /v1/credit/scores — crear o actualizar score manualmente
router.post('/scores', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { userId, score, rating, historyMonths, onTimePayments, defaults, txCount, approved, notes } = req.body;
    if (!userId || !score) return error(res, 'userId y score son obligatorios', 400);

    const creditScore = await prisma.creditScore.upsert({
      where:  { userId },
      create: { userId, score: parseInt(score), rating: rating || 'C', historyMonths: historyMonths || 0, onTimePayments: onTimePayments || 0, defaults: defaults || 0, txCount: txCount || 0, approved: !!approved, notes: notes || null },
      update: { score: parseInt(score), rating: rating || 'C', historyMonths, onTimePayments, defaults, txCount, approved: !!approved, notes }
    });
    return success(res, creditScore, 201);
  } catch (e) { return error(res, e.message, 500); }
});

// POST /v1/credit/scores/:userId/calculate — calcula score desde historial real
router.post('/scores/:userId/calculate', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { userId } = req.params;

    // Obtener datos reales del usuario
    const [txAll, txCompleted, loans, billPayments] = await Promise.all([
      prisma.transaction.count({ where: { userId } }),
      prisma.transaction.count({ where: { userId, status: 'completed' } }),
      prisma.loan.findMany({ where: { userId } }),
      prisma.billPayment.count({ where: { userId } })
    ]);

    const loanDefaults = loans.filter(l => l.status === 'overdue').length;
    const onTime       = loans.filter(l => l.status === 'paid').length + billPayments;
    const txCountAll   = txAll + billPayments;

    // Fórmula simple (0-1000)
    let score = 300;
    score += Math.min(txCountAll * 2, 200);           // historial de actividad
    score += Math.min(onTime * 10, 200);               // pagos puntuales
    score -= loanDefaults * 50;                        // penalización impagos
    score += txCompleted > 0 ? 100 : 0;               // transacciones completadas
    score = Math.max(0, Math.min(1000, score));

    const rating = score >= 800 ? 'A+' : score >= 700 ? 'A' : score >= 600 ? 'B' : score >= 500 ? 'C' : score >= 400 ? 'D' : 'E';

    const creditScore = await prisma.creditScore.upsert({
      where:  { userId },
      create: { userId, score, rating, txCount: txCountAll, onTimePayments: onTime, defaults: loanDefaults, approved: score >= 600 },
      update: { score, rating, txCount: txCountAll, onTimePayments: onTime, defaults: loanDefaults, approved: score >= 600 }
    });
    return success(res, creditScore);
  } catch (e) { return error(res, e.message, 500); }
});

// GET /v1/credit/stats
router.get('/stats', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const [total, approved, avg] = await Promise.all([
      prisma.creditScore.count(),
      prisma.creditScore.count({ where: { approved: true } }),
      prisma.creditScore.aggregate({ _avg: { score: true } })
    ]);
    return success(res, { total, approved, rejected: total - approved, avgScore: Math.round(avg._avg.score || 0) });
  } catch (e) { return error(res, e.message, 500); }
});

module.exports = router;
