'use strict';
const prisma = require('../config/prisma');

/**
 * Calcula y registra la distribución de una comisión.
 *
 * Regla:
 *   grossFee = amount * totalRate
 *   ivaAmount   = grossFee * ivaRate          → Ministerio de Hacienda
 *   netFee      = grossFee - ivaAmount
 *   repAmount   = netFee * repRate            → Representante (si aplica)
 *   innovaAmount = netFee - repAmount         → InnovaAFRIC
 */
async function distributeCommission({ feeType, amount, currency = 'EUR', country = '*',
  transactionId, orderId, invoiceId, clientUserId }) {

  // 1. Buscar configuración activa (país específico > global)
  let config = await prisma.commissionConfig.findFirst({
    where: { feeType, country, active: true }
  });
  if (!config) {
    config = await prisma.commissionConfig.findFirst({
      where: { feeType, country: '*', active: true }
    });
  }
  if (!config) return null; // sin config = sin comisión registrada

  const grossFee     = Math.round(amount * config.totalRate * 10000) / 10000;
  const ivaAmount    = Math.round(grossFee * config.ivaRate * 10000) / 10000;
  const netFee       = grossFee - ivaAmount;

  // 2. Buscar representante del cliente
  let repId = null, repName = null, repAmount = 0;
  if (clientUserId && config.repRate > 0) {
    const client = await prisma.user.findUnique({
      where: { id: clientUserId },
      select: { representativeId: true }
    });
    if (client?.representativeId) {
      const rep = await prisma.user.findUnique({
        where: { id: client.representativeId },
        select: { id: true, name: true }
      });
      if (rep) {
        repId     = rep.id;
        repName   = rep.name;
        repAmount = Math.round(netFee * config.repRate * 10000) / 10000;
      }
    }
  }

  const innovaAmount = netFee - repAmount;

  // 3. Registrar en CommissionRecord
  const record = await prisma.commissionRecord.create({
    data: {
      transactionId, orderId, invoiceId,
      feeType, currency,
      grossFee, ivaAmount, innovaAmount, repAmount,
      repId, repName,
      status: 'distributed'
    }
  });

  // 4. Si hay representante, actualizar sus totales
  if (repId && repAmount > 0) {
    await prisma.representative.updateMany({
      where: { userId: repId },
      data: { totalEarned: { increment: repAmount } }
    });
  }

  return { grossFee, ivaAmount, innovaAmount, repAmount, repId, record };
}

/**
 * Devuelve los rates activos para un tipo de fee y país.
 */
async function getFeeRate(feeType, country = '*') {
  const config = await prisma.commissionConfig.findFirst({
    where: { feeType, country, active: true }
  }) || await prisma.commissionConfig.findFirst({
    where: { feeType, country: '*', active: true }
  });
  return config?.totalRate ?? null;
}

/**
 * Siembra configuraciones por defecto si no existen.
 */
async function seedDefaultConfigs() {
  const defaults = [
    { feeType: 'transfer',    totalRate: 0.02,  ivaRate: 0.19, repRate: 0.005 },
    { feeType: 'withdrawal',  totalRate: 0.015, ivaRate: 0.19, repRate: 0.003 },
    { feeType: 'p2p',         totalRate: 0,     ivaRate: 0,    repRate: 0     },
    { feeType: 'delivery',    totalRate: 0,     ivaRate: 0.19, repRate: 0     },
    { feeType: 'maintenance', totalRate: 0.001, ivaRate: 0.19, repRate: 0     },
  ];
  for (const d of defaults) {
    await prisma.commissionConfig.upsert({
      where: { country_feeType: { country: '*', feeType: d.feeType } },
      update: {},
      create: { country: '*', ...d, description: `Default — ${d.feeType}` }
    });
  }
}

module.exports = { distributeCommission, getFeeRate, seedDefaultConfigs };
