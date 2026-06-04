'use strict';
const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const { success, error } = require('../helpers/response');
const { requireAuth, requireRole } = require('../middleware/auth');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ADMIN = ['admin','super_admin','finance_officer','risk_officer','country_manager','regional_director'];

// ── Configuración de operadores ───────────────────────────────
// Variables de entorno por operador:
//   MTN_MOMO_SUBKEY_CM, MTN_MOMO_SUBKEY_GQ, MTN_MOMO_SUBKEY_NG
//   ORANGE_MONEY_CLIENT_ID_SN, ORANGE_MONEY_SECRET_SN
//   ORANGE_MONEY_CLIENT_ID_ML, ORANGE_MONEY_SECRET_ML
// Si no están configuradas, el operador aparece como 'no configurado'

const OPERATOR_CONFIG = [
  {
    id: 'mtn-cm',
    operator: 'MTN MoMo',
    country: 'CM',
    api: 'v2.2',
    method: 'mtn_momo',
    healthUrl: 'https://sandbox.momodeveloper.mtn.com/collection/v1_0/accountholder/msisdn/237650000000/active',
    envKey: 'MTN_MOMO_SUBKEY_CM'
  },
  {
    id: 'mtn-gq',
    operator: 'MTN MoMo',
    country: 'GQ',
    api: 'v2.2',
    method: 'mtn_momo',
    healthUrl: 'https://sandbox.momodeveloper.mtn.com/collection/v1_0/accountholder/msisdn/240550000000/active',
    envKey: 'MTN_MOMO_SUBKEY_GQ'
  },
  {
    id: 'mtn-ng',
    operator: 'MTN MoMo',
    country: 'NG',
    api: 'v2.0',
    method: 'mtn_momo',
    healthUrl: 'https://sandbox.momodeveloper.mtn.com/collection/v1_0/accountholder/msisdn/2348000000000/active',
    envKey: 'MTN_MOMO_SUBKEY_NG'
  },
  {
    id: 'orange-sn',
    operator: 'Orange Money',
    country: 'SN',
    api: 'v3.1',
    method: 'orange_money',
    healthUrl: 'https://api.orange.com/oauth/v3/token',
    envKey: 'ORANGE_MONEY_CLIENT_ID_SN'
  },
  {
    id: 'orange-ml',
    operator: 'Orange Money',
    country: 'ML',
    api: 'v3.1',
    method: 'orange_money',
    healthUrl: 'https://api.orange.com/oauth/v3/token',
    envKey: 'ORANGE_MONEY_CLIENT_ID_ML'
  },
  {
    id: 'orange-gn',
    operator: 'Orange Money',
    country: 'GN',
    api: 'v2.5',
    method: 'orange_money',
    healthUrl: 'https://api.orange.com/oauth/v3/token',
    envKey: 'ORANGE_MONEY_CLIENT_ID_GN'
  },
  {
    id: 'wave-sn',
    operator: 'Wave',
    country: 'SN',
    api: 'v1.0',
    method: 'wave',
    healthUrl: null,
    envKey: 'WAVE_API_KEY_SN'
  }
];

// ── Obtener estadísticas reales de la DB ──────────────────────
async function getOperatorStats(method, country) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [txCount, volResult] = await Promise.all([
      prisma.transaction.count({
        where: {
          method,
          destination: { contains: country },
          createdAt: { gte: today }
        }
      }),
      prisma.transaction.aggregate({
        where: {
          method,
          destination: { contains: country },
          createdAt: { gte: today }
        },
        _sum: { amountSent: true }
      })
    ]);

    return {
      txToday:  txCount,
      volToday: volResult._sum.amountSent || 0
    };
  } catch {
    return { txToday: 0, volToday: 0 };
  }
}

// ── Ping de salud del operador ────────────────────────────────
async function pingOperator(config) {
  const subKey = process.env[config.envKey];
  if (!config.healthUrl || !subKey) {
    return { status: subKey ? 'sin_url_salud' : 'no_configurado', latency: null };
  }

  const start = Date.now();
  try {
    await axios.get(config.healthUrl, {
      headers: { 'Ocp-Apim-Subscription-Key': subKey },
      timeout: 5000,
      validateStatus: s => s < 500  // 4xx es OK para healthcheck (cuenta no existe, pero API responde)
    });
    return { status: 'operativo', latency: Date.now() - start };
  } catch (e) {
    if (e.code === 'ECONNABORTED') return { status: 'timeout', latency: 5000 };
    return { status: 'error', latency: Date.now() - start, detail: e.message };
  }
}

// ── GET /v1/mobile-money/operators ───────────────────────────
router.get('/operators', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const operators = await Promise.all(
      OPERATOR_CONFIG.map(async (cfg) => {
        const stats = await getOperatorStats(cfg.method, cfg.country);
        const configured = !!process.env[cfg.envKey];
        return {
          id:         cfg.id,
          operator:   cfg.operator,
          country:    cfg.country,
          api:        cfg.api,
          txToday:    stats.txToday,
          volToday:   stats.volToday,
          status:     configured ? 'configurado' : 'no_configurado',
          configured
        };
      })
    );
    return success(res, operators);
  } catch (e) {
    console.error('[mobilemoney] list operators:', e.message);
    return error(res, e.message, 500);
  }
});

// ── GET /v1/mobile-money/operators/:id ───────────────────────
router.get('/operators/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const cfg = OPERATOR_CONFIG.find(o => o.id === req.params.id);
  if (!cfg) return error(res, 'Operador no encontrado', 404);

  try {
    const stats = await getOperatorStats(cfg.method, cfg.country);
    return success(res, {
      ...cfg,
      envKey: undefined,  // no exponer nombre de var de entorno
      configured: !!process.env[cfg.envKey],
      ...stats
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
});

// ── POST /v1/mobile-money/operators/:id/test ─────────────────
// Ping real al API del operador para verificar conectividad
router.post('/operators/:id/test', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const cfg = OPERATOR_CONFIG.find(o => o.id === req.params.id);
  if (!cfg) return error(res, 'Operador no encontrado', 404);

  const ping = await pingOperator(cfg);
  return success(res, {
    operator:  cfg.operator,
    country:   cfg.country,
    ...ping,
    testedAt:  new Date().toISOString()
  });
});

// ── GET /v1/mobile-money/stats ────────────────────────────────
// Resumen agregado de todas las transacciones mobile money hoy
router.get('/stats', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalTx, totalVol, byMethod] = await Promise.all([
      prisma.transaction.count({
        where: {
          method: { in: ['mtn_momo', 'orange_money', 'wave'] },
          createdAt: { gte: today }
        }
      }),
      prisma.transaction.aggregate({
        where: {
          method: { in: ['mtn_momo', 'orange_money', 'wave'] },
          createdAt: { gte: today }
        },
        _sum: { amountSent: true, fee: true }
      }),
      prisma.transaction.groupBy({
        by: ['method'],
        where: {
          method: { in: ['mtn_momo', 'orange_money', 'wave'] },
          createdAt: { gte: today }
        },
        _count: { id: true },
        _sum:   { amountSent: true }
      })
    ]);

    return success(res, {
      date:        today.toISOString().split('T')[0],
      totalTx,
      totalVolume: totalVol._sum.amountSent || 0,
      totalFees:   totalVol._sum.fee || 0,
      byMethod:    byMethod.map(m => ({
        method: m.method,
        count:  m._count.id,
        volume: m._sum.amountSent || 0
      }))
    });
  } catch (e) {
    console.error('[mobilemoney] stats:', e.message);
    return error(res, e.message, 500);
  }
});

module.exports = router;
