'use strict';
const router  = require('express').Router();
const prisma  = require('../config/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { success: ok, error } = require('../helpers/response');
const { WALLET_LIMITS, CURRENCY_FIELD } = require('../config/walletLimits');

const COMMISSION = 0.05; // 5% descuento en compra de unidades
const TRANSFER_TAX_DEFAULT = 0.02; // 2% de retención si el país no tiene impuestos configurados

// El JWT lleva el id del usuario en `sub` (los tokens antiguos usaban `id`)
const uid = (req) => req.user.sub || req.user.id;

const bcrypt = require('bcryptjs');

// Si el usuario tiene PIN configurado, exigirlo en operaciones de dinero.
// Devuelve null si todo bien, o el error ya respondido.
async function checkPin(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: uid(req) }, select: { pinHash: true }
  });
  if (!user?.pinHash) return null; // sin PIN configurado — no se exige
  const pin = String(req.body.pin || '');
  if (!pin) return error(res, 'Introduce tu PIN de seguridad', 428);
  if (!bcrypt.compareSync(pin, user.pinHash)) return error(res, 'PIN incorrecto', 401);
  return null;
}

// ─────────────────────────────────────────────────────────────
// RUTAS PROPIAS DEL CIRCULAR
// ─────────────────────────────────────────────────────────────

// GET /v1/circulares/me — ver mi cuenta
router.get('/me', requireAuth, async (req, res) => {
  try {
    const circ = await prisma.circular.findUnique({
      where: { userId: uid(req) },
      include: { account: true, _count: { select: { topUps: true } } }
    });
    if (!circ) return error(res, 'No estás registrado como Circular Autorizada', 403);
    // El modelo Circular no tiene relación user en Prisma — se consulta aparte
    const user = await prisma.user.findUnique({
      where: { id: circ.userId },
      select: { name: true, email: true, phone: true, city: true, country: true }
    });
    return ok(res, { ...circ, user });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/circulares/purchase-units — circular solicita compra de unidades (5% descuento)
router.post('/purchase-units', requireAuth, async (req, res) => {
  try {
    const circ = await prisma.circular.findUnique({ where: { userId: uid(req) } });
    if (!circ) return error(res, 'No eres Circular Autorizada', 403);
    if (circ.status !== 'active') return error(res, 'Tu cuenta no está activa. Contacta con tu representante o InnovaAFRIC.', 403);

    const { unitsRequested, currency = 'XAF', bankName, bankRef, notes } = req.body;
    if (!unitsRequested || unitsRequested <= 0) return error(res, 'unitsRequested debe ser > 0', 400);

    // Techo de la circular: su saldo de unidades no puede superar el cap de la divisa
    const limits = WALLET_LIMITS[currency];
    if (limits) {
      const account = await prisma.circularAccount.findUnique({ where: { circularId: circ.id } });
      const currentUnits = account ? account.unitBalance : 0;
      const maxAllowed = limits.cap - currentUnits;
      if (unitsRequested > maxAllowed) {
        return error(res, `Importe máximo permitido: ${Math.max(0, maxAllowed).toLocaleString()} unidades. Tu techo como Circular es ${limits.cap.toLocaleString()} ${currency} y ya tienes ${currentUnits.toLocaleString()}.`, 422);
      }
    }

    const rate       = circ.commissionRate ?? COMMISSION;
    const amountSaved = Math.round(unitsRequested * rate * 100) / 100;
    const amountToPay = Math.round(unitsRequested * (1 - rate) * 100) / 100;

    const purchase = await prisma.circularPurchase.create({
      data: {
        circularId: circ.id,
        unitsRequested, commissionRate: rate,
        amountToPay, amountSaved, currency,
        bankName, bankRef, notes,
        status: 'pending'
      }
    });

    return ok(res, {
      message: `Solicitud registrada. Transfiere ${amountToPay} ${currency} a InnovaAFRIC con ref: ${purchase.id}`,
      purchase,
      instructions: {
        amountToPay,
        saved: amountSaved,
        unitsYouWillReceive: unitsRequested,
        transferRef: purchase.id,
        note: `Con tu comisión del ${rate * 100}% ahorras ${amountSaved} ${currency}`
      }
    });
  } catch (e) { return error(res, e.message); }
});

// GET /v1/circulares/find-client?q=... — buscar cliente por teléfono, email o nombre
router.get('/find-client', requireAuth, async (req, res) => {
  try {
    const circ = await prisma.circular.findUnique({ where: { userId: uid(req) } });
    if (!circ) return error(res, 'No eres Circular Autorizada', 403);
    if (circ.status !== 'active') return error(res, 'Cuenta no activa', 403);

    const q = (req.query.q || '').trim();
    if (q.length < 3) return error(res, 'Escribe al menos 3 caracteres (código IA, teléfono, email o nombre)', 400);
    const country = (req.query.country || '').trim();
    const city    = (req.query.city || '').trim();

    // Código IA = IA- + primeros 6 hex del id (sin guiones, en mayúsculas)
    const iaHex = q.toUpperCase().replace(/^IA-?/, '');
    const or = [
      { phone: { contains: q } },
      { email: { contains: q, mode: 'insensitive' } },
      { name:  { contains: q, mode: 'insensitive' } }
    ];
    if (/^[0-9A-F]{6}$/.test(iaHex)) or.unshift({ id: { startsWith: iaHex.toLowerCase() } });

    const where = { OR: or };
    if (country) where.country = country;
    if (city)    where.city = { contains: city, mode: 'insensitive' };

    const rows = await prisma.user.findMany({
      where, select: { id: true, name: true, phone: true, country: true, city: true }, take: 8
    });
    const clients = rows.map(c => ({ ...c, ia: 'IA-' + (c.id || '').replace(/-/g, '').toUpperCase().substring(0, 6) }));

    return ok(res, { count: clients.length, clients });
  } catch (e) { return error(res, e.message); }
});

// GET /v1/circulares/client/:id — datos del cliente (escaneo de su QR personal)
router.get('/client/:id', requireAuth, async (req, res) => {
  try {
    const circ = await prisma.circular.findUnique({ where: { userId: uid(req) } });
    if (!circ) return error(res, 'No eres Circular Autorizada', 403);
    if (circ.status !== 'active') return error(res, 'Cuenta no activa', 403);

    const client = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, phone: true, country: true }
    });
    if (!client) return error(res, 'Cliente no encontrado. ¿El QR es de InnovaAFRIC?', 404);
    return ok(res, { client });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/circulares/topup-client — circular recarga la wallet de un usuario del barrio
router.post('/topup-client', requireAuth, async (req, res) => {
  try {
    const circ = await prisma.circular.findUnique({
      where: { userId: uid(req) }, include: { account: true }
    });
    if (!circ) return error(res, 'No eres Circular Autorizada', 403);
    if (circ.status !== 'active') return error(res, 'Cuenta no activa', 403);
    if (!circ.account) return error(res, 'Tu cuenta de unidades no está inicializada', 400);

    const { clientId, amount, currency = 'XAF', note } = req.body;
    if (!clientId || !amount || amount <= 0) return error(res, 'clientId y amount requeridos', 400);

    // PIN de seguridad (si la circular lo tiene configurado)
    if (await checkPin(req, res)) return;
    if (circ.account.unitBalance < amount) {
      return error(res, `Saldo insuficiente. Tienes ${circ.account.unitBalance} unidades`, 400);
    }

    const client = await prisma.user.findUnique({
      where: { id: clientId }, select: { id: true, name: true, phone: true }
    });
    if (!client) return error(res, 'Cliente no encontrado', 404);

    const walletField = CURRENCY_FIELD[currency] || 'balanceEur';

    // Techo de wallet del cliente: misma regla que el topup normal
    const limits = WALLET_LIMITS[currency];
    if (limits) {
      const clientWallet = await prisma.wallet.findUnique({ where: { userId: clientId } });
      const clientBalance = clientWallet ? (clientWallet[walletField] || 0) : 0;
      if (clientBalance > limits.reloadThreshold) {
        return error(res, `El cliente no puede recargar todavía. Su saldo ${currency} es ${clientBalance.toLocaleString()} y debe bajar a ${limits.reloadThreshold.toLocaleString()} o menos.`, 422);
      }
      const maxAllowed = limits.cap - clientBalance;
      if (amount > maxAllowed) {
        return error(res, `Importe máximo permitido para este cliente: ${maxAllowed.toLocaleString()} ${currency} (techo ${limits.cap.toLocaleString()} ${currency}).`, 422);
      }
    }

    const txResults = await prisma.$transaction([
      prisma.wallet.upsert({
        where: { userId: clientId },
        update: { [walletField]: { increment: amount } },
        create: { userId: clientId, [walletField]: amount }
      }),
      prisma.transaction.create({
        data: {
          id: `circ_topup_${circ.id}_${Date.now()}`,
          type: 'topup',
          userId: uid(req),
          recipientId: clientId,
          amountSent: amount, currencySent: currency,
          amountReceived: amount, currencyReceived: currency,
          fee: 0,
          note: note || `Recarga por Circular Autorizada ${circ.id}`,
          status: 'completed'
        }
      }),
      prisma.circularAccount.update({
        where: { circularId: circ.id },
        data: {
          unitBalance:    { decrement: amount },
          totalUnitsUsed: { increment: amount }
        }
      }),
      prisma.circularTopUp.create({
        data: {
          circularId: circ.id, clientId,
          clientName: client.name, clientPhone: client.phone,
          amount, currency, note, status: 'completed'
        }
      })
    ]);

    const updated = await prisma.circularAccount.findUnique({ where: { circularId: circ.id } });
    const alertLow = updated.unitBalance < updated.alertThreshold;
    const topUpRec = txResults[3]; // registro CircularTopUp creado en la transacción

    return ok(res, {
      message: `✅ ${amount} ${currency} acreditados a ${client.name}`,
      newBalance: updated.unitBalance,
      alertLow,
      alertMessage: alertLow ? `⚠️ Tu saldo es bajo (${updated.unitBalance} unidades). Solicita recarga.` : null,
      receipt: {
        id: topUpRec.id,
        date: topUpRec.createdAt,
        clientName: client.name,
        clientPhone: client.phone,
        amount, currency
      }
    });
  } catch (e) { return error(res, e.message); }
});

// GET /v1/circulares/my-operations — historial del circular
router.get('/my-operations', requireAuth, async (req, res) => {
  try {
    const circ = await prisma.circular.findUnique({
      where: { userId: uid(req) }, include: { account: true }
    });
    if (!circ) return error(res, 'No eres Circular Autorizada', 403);

    const { from, to, page = 1, limit = 50 } = req.query;
    const dateFilter = (from || to) ? { createdAt: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } } : {};

    const [topUps, purchases] = await Promise.all([
      prisma.circularTopUp.findMany({
        where: { circularId: circ.id, ...dateFilter },
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: Number(limit)
      }),
      prisma.circularPurchase.findMany({
        where: { circularId: circ.id, ...dateFilter },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return ok(res, { account: circ.account, topUps, purchases });
  } catch (e) { return error(res, e.message); }
});

// GET /v1/circulares/commissions — comisión del 5% por cada recarga + traslados a wallet
router.get('/commissions', requireAuth, async (req, res) => {
  try {
    const circ = await prisma.circular.findUnique({
      where: { userId: uid(req) }, include: { account: true }
    });
    if (!circ) return error(res, 'No eres Circular Autorizada', 403);
    const rate = circ.commissionRate ?? COMMISSION;

    const topUps = await prisma.circularTopUp.findMany({
      where: { circularId: circ.id, status: 'completed' },
      orderBy: { createdAt: 'desc' }, take: 100
    });
    const operations = topUps.map(t => ({
      id: t.id, date: t.createdAt,
      clientName: t.clientName, clientPhone: t.clientPhone,
      amount: t.amount, currency: t.currency,
      commission: Math.round(t.amount * rate * 100) / 100
    }));
    const totalsByCurrency = {};
    operations.forEach(o => {
      totalsByCurrency[o.currency] = Math.round(((totalsByCurrency[o.currency] || 0) + o.commission) * 100) / 100;
    });

    const transfers = await prisma.transaction.findMany({
      where: { userId: circ.userId, type: 'circular_cashout' },
      orderBy: { createdAt: 'desc' }, take: 50
    });

    return ok(res, {
      commissionRate: rate,
      operations,
      totalsByCurrency,
      unitBalance: circ.account?.unitBalance ?? 0,
      transfers
    });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/circulares/transfer-to-wallet — trasladar unidades a la wallet XenderMoney pagando impuestos
router.post('/transfer-to-wallet', requireAuth, async (req, res) => {
  try {
    const circ = await prisma.circular.findUnique({
      where: { userId: uid(req) }, include: { account: true }
    });
    if (!circ) return error(res, 'No eres Circular Autorizada', 403);
    if (circ.status !== 'active') return error(res, 'Cuenta no activa', 403);
    if (!circ.account) return error(res, 'Tu cuenta de unidades no está inicializada', 400);

    const { units, currency = 'XAF' } = req.body;
    if (!units || units <= 0) return error(res, 'units debe ser > 0', 400);
    if (circ.account.unitBalance < units) {
      return error(res, `Saldo insuficiente. Tienes ${circ.account.unitBalance.toLocaleString()} unidades`, 400);
    }

    // PIN de seguridad (si la circular lo tiene configurado)
    if (await checkPin(req, res)) return;

    // Impuestos del país (tipo circular_cashout) si están configurados; si no, retención por defecto
    let taxRate = TRANSFER_TAX_DEFAULT;
    let taxName = 'Retención InnovaAFRIC';
    const countryTaxes = await prisma.tax.findMany({
      where: { country: (circ.country || '').toUpperCase(), active: true, type: 'circular_cashout' }
    }).catch(() => []);
    if (countryTaxes.length) {
      taxRate = countryTaxes.reduce((s, t) => s + t.rate, 0) / 100;
      taxName = countryTaxes.map(t => t.name).join(' + ');
    }

    const tax = Math.round(units * taxRate * 100) / 100;
    const net = Math.round((units - tax) * 100) / 100;
    const walletField = CURRENCY_FIELD[currency] || 'balanceXaf';

    // Techo de wallet de la propia circular
    const limits = WALLET_LIMITS[currency];
    if (limits) {
      const w = await prisma.wallet.findUnique({ where: { userId: circ.userId } });
      const bal = w ? (w[walletField] || 0) : 0;
      if (net + bal > limits.cap) {
        return error(res, `La transferencia supera el techo de tu wallet (${limits.cap.toLocaleString()} ${currency}). Neto máximo que puedes recibir: ${(limits.cap - bal).toLocaleString()} ${currency}.`, 422);
      }
    }

    const txResults = await prisma.$transaction([
      prisma.circularAccount.update({
        where: { circularId: circ.id },
        data: { unitBalance: { decrement: units } }
      }),
      prisma.wallet.upsert({
        where: { userId: circ.userId },
        update: { [walletField]: { increment: net } },
        create: { userId: circ.userId, [walletField]: net }
      }),
      prisma.transaction.create({
        data: {
          id: `circ_cash_${circ.id.slice(-6)}_${Date.now()}`,
          type: 'circular_cashout',
          userId: circ.userId,
          amountSent: units, currencySent: currency,
          amountReceived: net, currencyReceived: currency,
          fee: tax, status: 'completed',
          note: `Traslado de unidades a wallet XenderMoney — ${taxName} ${(taxRate * 100).toFixed(1)}%`
        }
      })
    ]);

    return ok(res, {
      message: `✅ ${net.toLocaleString()} ${currency} acreditados en tu wallet XenderMoney`,
      unitsTransferred: units,
      tax, taxRate, taxName,
      netReceived: net,
      newUnitBalance: txResults[0].unitBalance,
      newWalletBalance: txResults[1][walletField]
    });
  } catch (e) { return error(res, e.message); }
});

// ─────────────────────────────────────────────────────────────
// RUTAS ADMIN + REPRESENTANTES
// ─────────────────────────────────────────────────────────────

// POST /v1/circulares/authorize — InnovaAFRIC o un Representante autoriza a un circular
router.post('/authorize', requireAuth, async (req, res) => {
  try {
    const actorRole = req.user.role;
    const isAdmin = ['admin', 'super_admin', 'finance_officer', 'country_manager'].includes(actorRole);
    // Un representante se identifica por la tabla Representative, no por el rol
    const rep = isAdmin ? null : await prisma.representative.findUnique({ where: { userId: uid(req) } });
    if (!isAdmin && !rep) return error(res, 'Solo admins o representantes pueden autorizar circulares', 403);

    const { userId, neighborhood, country, notes } = req.body;
    if (!userId || !neighborhood || !country) {
      return error(res, 'userId, neighborhood y country son requeridos', 400);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return error(res, 'Usuario no encontrado', 404);

    const existing = await prisma.circular.findUnique({ where: { userId } });
    if (existing) return error(res, 'Este usuario ya está registrado como Circular Autorizada', 409);

    const repId = rep ? rep.id : null;

    const circular = await prisma.circular.create({
      data: {
        userId,
        neighborhood,
        country,
        commissionRate: COMMISSION,
        status: 'active',
        authorizedBy: uid(req),
        authorizedByType: isAdmin ? 'admin' : 'representative',
        repId,
        notes: notes || null
      }
    });

    // Crear cuenta de unidades vacía
    await prisma.circularAccount.create({ data: { circularId: circular.id } });

    // Actualizar rol del usuario a circular_autorizada
    await prisma.user.update({ where: { id: userId }, data: { role: 'circular_autorizada' } });

    return ok(res, {
      message: `✅ ${user.name || user.email} autorizado como Circular Autorizada en ${neighborhood}`,
      circular
    }, 201);
  } catch (e) { return error(res, e.message); }
});

// GET /v1/circulares — lista todos los circulares (admin o rep)
router.get('/', requireAuth, async (req, res) => {
  try {
    const actorRole = req.user.role;
    const isAdmin = ['admin', 'super_admin', 'finance_officer', 'country_manager'].includes(actorRole);
    // Un representante se identifica por la tabla Representative, no por el rol
    const rep = isAdmin ? null : await prisma.representative.findUnique({ where: { userId: uid(req) } });
    if (!isAdmin && !rep) return error(res, 'Sin permiso', 403);

    const where = rep ? { repId: rep.id } : {}; // rep solo ve sus circulares

    const circulares = await prisma.circular.findMany({
      where,
      include: { account: true },
      orderBy: { createdAt: 'desc' }
    });

    // El modelo Circular no tiene relación user en Prisma — se consultan aparte
    const users = await prisma.user.findMany({
      where: { id: { in: circulares.map(c => c.userId) } },
      select: { id: true, name: true, email: true, phone: true, country: true }
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    const withUsers = circulares.map(c => ({ ...c, user: userMap[c.userId] || null }));

    return ok(res, { count: withUsers.length, circulares: withUsers });
  } catch (e) { return error(res, e.message); }
});

// GET /v1/circulares/purchases/pending — compras pendientes de confirmar (admin)
router.get('/purchases/pending', requireAuth, requireRole('admin', 'super_admin', 'finance_officer'), async (req, res) => {
  try {
    const purchases = await prisma.circularPurchase.findMany({
      where: { status: 'pending' },
      include: { circular: true },
      orderBy: { createdAt: 'asc' }
    });
    // El modelo Circular no tiene relación user — se consultan aparte
    const users = await prisma.user.findMany({
      where: { id: { in: purchases.map(p => p.circular.userId) } },
      select: { id: true, name: true, email: true, phone: true }
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    const withUsers = purchases.map(p => ({
      ...p, circular: { ...p.circular, user: userMap[p.circular.userId] || null }
    }));
    return ok(res, { count: withUsers.length, purchases: withUsers });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/circulares/purchases/:id/confirm — admin confirma y acredita unidades
router.post('/purchases/:id/confirm', requireAuth, requireRole('admin', 'super_admin', 'finance_officer'), async (req, res) => {
  try {
    const purchase = await prisma.circularPurchase.findUnique({
      where: { id: req.params.id },
      include: { circular: { include: { account: true } } }
    });
    if (!purchase) return error(res, 'Solicitud no encontrada', 404);
    if (purchase.status !== 'pending') return error(res, 'Ya procesada', 400);

    const circularId = purchase.circular.id;

    await prisma.$transaction([
      prisma.circularPurchase.update({
        where: { id: purchase.id },
        data: { status: 'confirmed', confirmedBy: uid(req), confirmedAt: new Date() }
      }),
      prisma.circularAccount.upsert({
        where: { circularId },
        update: {
          unitBalance:      { increment: purchase.unitsRequested },
          totalUnitsBought: { increment: purchase.unitsRequested },
          totalPaid:        { increment: purchase.amountToPay },
          totalSaved:       { increment: purchase.amountSaved }
        },
        create: {
          circularId,
          unitBalance:      purchase.unitsRequested,
          totalUnitsBought: purchase.unitsRequested,
          totalPaid:        purchase.amountToPay,
          totalSaved:       purchase.amountSaved
        }
      })
    ]);

    const updated = await prisma.circularAccount.findUnique({ where: { circularId } });

    // Si fue autorizado por un rep, notificar al rep (comisión de red)
    if (purchase.circular.repId) {
      // El representante ha generado actividad en su red — se puede usar para comisiones futuras
      await prisma.representative.update({
        where: { id: purchase.circular.repId },
        data: { totalEarned: { increment: purchase.amountSaved * 0.5 } } // 50% del ahorro del circular va al rep
      }).catch(() => {});
    }

    return ok(res, {
      message: `✅ ${purchase.unitsRequested} unidades acreditadas al Circular`,
      newBalance: updated.unitBalance
    });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/circulares/purchases/:id/reject — admin rechaza solicitud
router.post('/purchases/:id/reject', requireAuth, requireRole('admin', 'super_admin', 'finance_officer'), async (req, res) => {
  try {
    const { reason } = req.body;
    await prisma.circularPurchase.update({
      where: { id: req.params.id },
      data: { status: 'rejected', rejectedReason: reason || 'Rechazado por admin', confirmedBy: uid(req), confirmedAt: new Date() }
    });
    return ok(res, { message: 'Solicitud rechazada' });
  } catch (e) { return error(res, e.message); }
});

// PATCH /v1/circulares/:id/status — admin activa/suspende un circular
router.patch('/:id/status', requireAuth, requireRole('admin', 'super_admin', 'country_manager'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'suspended', 'pending'].includes(status)) {
      return error(res, 'status debe ser active|suspended|pending', 400);
    }
    const updated = await prisma.circular.update({
      where: { id: req.params.id },
      data: { status }
    });
    return ok(res, { message: `Estado actualizado a ${status}`, circular: updated });
  } catch (e) { return error(res, e.message); }
});

module.exports = router;
