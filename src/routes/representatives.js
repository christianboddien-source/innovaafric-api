'use strict';
const router  = require('express').Router();
const prisma  = require('../config/prisma');
const PDFDocument = require('pdfkit');
const { requireAuth: authenticate, requireRole } = require('../middleware/auth');
const { success: ok, error } = require('../helpers/response');

const DISCOUNT = 0.10; // 10% descuento motivacional
const TRANSFER_TAX_DEFAULT = 0.02; // 2% de retención si el país no tiene impuestos configurados

// El JWT lleva el id del usuario en `sub` (los tokens antiguos usaban `id`)
const uid = (req) => req.user.sub || req.user.id;

const bcrypt = require('bcryptjs');

// Si el usuario tiene PIN configurado, exigirlo en operaciones de dinero
async function checkPin(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: uid(req) }, select: { pinHash: true }
  });
  if (!user?.pinHash) return null;
  const pin = String(req.body.pin || '');
  if (!pin) return error(res, 'Introduce tu PIN de seguridad', 428);
  if (!bcrypt.compareSync(pin, user.pinHash)) return error(res, 'PIN incorrecto', 401);
  return null;
}

// ─────────────────────────────────────────────────────────────
// UTILIDADES PDF
// ─────────────────────────────────────────────────────────────
function buildPDF(res, filename, drawFn) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(res);
  drawFn(doc);
  doc.end();
}

function pdfHeader(doc, title, subtitle = '') {
  doc.fontSize(20).font('Helvetica-Bold').fillColor('#0A1628').text('InnovaAFRIC', 50, 50);
  doc.fontSize(10).font('Helvetica').fillColor('#555').text('We Simplify Life — Red de Representantes', 50, 74);
  doc.moveTo(50, 92).lineTo(545, 92).strokeColor('#29ABE2').lineWidth(2).stroke();
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#0A1628').text(title, 50, 104);
  if (subtitle) doc.fontSize(10).font('Helvetica').fillColor('#888').text(subtitle, 50, 124);
  doc.moveDown(subtitle ? 1 : 2);
}

function pdfTable(doc, headers, rows, startY) {
  const colW = Math.floor(495 / headers.length);
  let y = startY || doc.y;
  // cabecera tabla
  doc.rect(50, y, 495, 20).fill('#29ABE2');
  headers.forEach((h, i) => {
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff')
       .text(h, 52 + i * colW, y + 5, { width: colW - 4, align: 'left' });
  });
  y += 22;
  // filas
  rows.forEach((row, ri) => {
    if (y > 750) { doc.addPage(); y = 50; }
    if (ri % 2 === 0) doc.rect(50, y - 2, 495, 18).fill('#f4f8ff');
    row.forEach((cell, i) => {
      doc.fontSize(8).font('Helvetica').fillColor('#222')
         .text(String(cell ?? '—'), 52 + i * colW, y + 1, { width: colW - 4, align: 'left' });
    });
    y += 18;
  });
  doc.y = y + 10;
}

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('es-ES') : '—'; }
function fmtAmt(n, cur = 'EUR') { return `${Number(n || 0).toFixed(2)} ${cur}`; }

// ─────────────────────────────────────────────────────────────
// RUTAS REPRESENTANTE (acceso propio)
// ─────────────────────────────────────────────────────────────

// GET /v1/representatives/me — ver mi cuenta y saldo
router.get('/me', authenticate, async (req, res) => {
  try {
    const rep = await prisma.representative.findUnique({
      where: { userId: uid(req) },
      include: { account: true }
    });
    if (!rep) return error(res, 'No eres representante registrado', 403);
    // El modelo no tiene relación user en Prisma — se consulta aparte
    const [user, circularesCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: rep.userId },
        select: { name: true, email: true, phone: true, city: true, country: true }
      }),
      prisma.circular.count({ where: { repId: rep.id } })
    ]);
    return ok(res, { ...rep, user, circularesCount });
  } catch (e) { return error(res, e.message); }
});

// GET /v1/representatives/find-user?q= — buscar usuario para autorizarlo como circular
router.get('/find-user', authenticate, async (req, res) => {
  try {
    const rep = await prisma.representative.findUnique({ where: { userId: uid(req) } });
    if (!rep) return error(res, 'No eres representante', 403);

    const q = (req.query.q || '').trim();
    if (q.length < 3) return error(res, 'Escribe al menos 3 caracteres (código IA, teléfono, email o nombre)', 400);
    const country = (req.query.country || '').trim();
    const city    = (req.query.city || '').trim();

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
      where, select: { id: true, name: true, phone: true, email: true, country: true, city: true, role: true }, take: 8
    });
    const users = rows.map(u => ({ ...u, ia: 'IA-' + (u.id || '').replace(/-/g, '').toUpperCase().substring(0, 6) }));
    return ok(res, { count: users.length, users });
  } catch (e) { return error(res, e.message); }
});

// GET /v1/representatives/network-commissions — comisión 50% del ahorro de cada circular de mi red
router.get('/network-commissions', authenticate, async (req, res) => {
  try {
    const rep = await prisma.representative.findUnique({ where: { userId: uid(req) } });
    if (!rep) return error(res, 'No eres representante', 403);

    const circulares = await prisma.circular.findMany({ where: { repId: rep.id } });
    const circIds = circulares.map(c => c.id);
    const circNames = {};
    for (const c of circulares) {
      const u = await prisma.user.findUnique({ where: { id: c.userId }, select: { name: true } });
      circNames[c.id] = u?.name || c.neighborhood;
    }

    const purchases = circIds.length ? await prisma.circularPurchase.findMany({
      where: { circularId: { in: circIds }, status: 'confirmed' },
      orderBy: { createdAt: 'desc' }, take: 100
    }) : [];

    const operations = purchases.map(p => ({
      id: p.id, date: p.confirmedAt || p.createdAt,
      circularName: circNames[p.circularId],
      units: p.unitsRequested, currency: p.currency,
      circularSaved: p.amountSaved,
      myCommission: Math.round(p.amountSaved * 0.5 * 100) / 100 // 50% del ahorro va al rep
    }));
    const totalsByCurrency = {};
    operations.forEach(o => {
      totalsByCurrency[o.currency] = Math.round(((totalsByCurrency[o.currency] || 0) + o.myCommission) * 100) / 100;
    });

    const transfers = await prisma.transaction.findMany({
      where: { userId: rep.userId, type: 'rep_cashout' },
      orderBy: { createdAt: 'desc' }, take: 50
    });

    return ok(res, {
      totalEarned: rep.totalEarned,
      operations, totalsByCurrency, transfers
    });
  } catch (e) { return error(res, e.message); }
});

// GET /v1/representatives/riders — riders del país/zona del representante
router.get('/riders', authenticate, async (req, res) => {
  try {
    const rep = await prisma.representative.findUnique({ where: { userId: uid(req) } });
    if (!rep) return error(res, 'No eres representante', 403);

    const riders = await prisma.rider.findMany({ orderBy: { createdAt: 'desc' } });
    // país del usuario enlazado, o coincidencia de zona con la del rep
    const userIds = riders.map(r => r.userId).filter(Boolean);
    const users = userIds.length ? await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, country: true, city: true }
    }) : [];
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    const repCountry = (rep.country || '').toLowerCase();
    const repZone = (rep.zone || '').toLowerCase();
    const mine = riders.filter(r => {
      const u = r.userId ? userMap[r.userId] : null;
      if (u?.country) return u.country.toLowerCase() === repCountry;
      const zone = (r.zone || '').toLowerCase();
      return (repZone && zone.includes(repZone.split(' ')[0])) || zone.includes(repCountry);
    });

    return ok(res, { count: mine.length, riders: mine });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/representatives/transfer-earnings — trasladar comisiones ganadas a la wallet pagando impuestos
router.post('/transfer-earnings', authenticate, async (req, res) => {
  try {
    const rep = await prisma.representative.findUnique({ where: { userId: uid(req) } });
    if (!rep) return error(res, 'No eres representante', 403);
    if (rep.status !== 'active') return error(res, 'Cuenta no activa', 403);

    const { amount, currency = 'XAF' } = req.body;
    if (!amount || amount <= 0) return error(res, 'amount debe ser > 0', 400);
    if (rep.totalEarned < amount) {
      return error(res, `Saldo de comisiones insuficiente. Tienes ${rep.totalEarned.toLocaleString()}`, 400);
    }

    // PIN de seguridad (si el rep lo tiene configurado)
    if (await checkPin(req, res)) return;

    // Impuestos del país (mismo tipo circular_cashout que las circulares)
    let taxRate = TRANSFER_TAX_DEFAULT;
    let taxName = 'Retención InnovaAFRIC';
    const countryTaxes = await prisma.tax.findMany({
      where: { country: (rep.country || '').toUpperCase(), active: true, type: 'circular_cashout' }
    }).catch(() => []);
    if (countryTaxes.length) {
      taxRate = countryTaxes.reduce((s, t) => s + t.rate, 0) / 100;
      taxName = countryTaxes.map(t => t.name).join(' + ');
    }

    const tax = Math.round(amount * taxRate * 100) / 100;
    const net = Math.round((amount - tax) * 100) / 100;
    const CF = { EUR: 'balanceEur', USD: 'balanceUsd', XAF: 'balanceXaf', XOF: 'balanceXof' };
    const walletField = CF[currency] || 'balanceXaf';

    const txResults = await prisma.$transaction([
      prisma.representative.update({
        where: { id: rep.id },
        data: { totalEarned: { decrement: amount } }
      }),
      prisma.wallet.upsert({
        where: { userId: rep.userId },
        update: { [walletField]: { increment: net } },
        create: { userId: rep.userId, [walletField]: net }
      }),
      prisma.transaction.create({
        data: {
          id: `rep_cash_${rep.id.slice(-6)}_${Date.now()}`,
          type: 'rep_cashout',
          userId: rep.userId,
          amountSent: amount, currencySent: currency,
          amountReceived: net, currencyReceived: currency,
          fee: tax, status: 'completed',
          note: `Cobro de comisiones de red — ${taxName} ${(taxRate * 100).toFixed(1)}%`
        }
      })
    ]);

    return ok(res, {
      message: `✅ ${net.toLocaleString()} ${currency} acreditados en tu wallet XenderMoney`,
      amountTransferred: amount,
      tax, taxRate, taxName,
      netReceived: net,
      newEarningsBalance: txResults[0].totalEarned,
      newWalletBalance: txResults[1][walletField]
    });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/representatives/purchase-units — solicitar compra de unidades
router.post('/purchase-units', authenticate, async (req, res) => {
  try {
    const rep = await prisma.representative.findUnique({
      where: { userId: uid(req) }, include: { account: true }
    });
    if (!rep) return error(res, 'No eres representante', 403);

    const { unitsRequested, currency = 'EUR', bankName, bankRef, notes } = req.body;
    if (!unitsRequested || unitsRequested <= 0) return error(res, 'unitsRequested debe ser > 0', 400);

    const disc = rep.discountRate ?? DISCOUNT;
    const amountToPay    = Math.round(unitsRequested * (1 - disc) * 100) / 100;
    const amountDiscount = Math.round(unitsRequested * disc * 100) / 100;

    const purchase = await prisma.unitPurchase.create({
      data: {
        repId: rep.id,
        unitsRequested, discountRate: disc,
        amountToPay, amountDiscount, currency,
        bankName, bankRef, notes,
        status: 'pending'
      }
    });

    return ok(res, {
      message: `Solicitud registrada. Transfiere ${amountToPay} ${currency} a InnovaAFRIC con ref: ${purchase.id}`,
      purchase,
      instructions: {
        amountToPay,
        discount: amountDiscount,
        unitsYouWillReceive: unitsRequested,
        transferRef: purchase.id
      }
    });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/representatives/topup-client — recargar la wallet de un cliente
router.post('/topup-client', authenticate, async (req, res) => {
  try {
    const rep = await prisma.representative.findUnique({
      where: { userId: uid(req) }, include: { account: true }
    });
    if (!rep) return error(res, 'No eres representante', 403);
    if (!rep.account) return error(res, 'Tu cuenta de unidades no está inicializada', 400);

    const { clientId, amount, currency = 'EUR', note } = req.body;
    if (!clientId || !amount || amount <= 0) return error(res, 'clientId y amount requeridos', 400);
    if (rep.account.unitBalance < amount) return error(res, `Saldo insuficiente. Tienes ${rep.account.unitBalance} unidades`, 400);

    const client = await prisma.user.findUnique({
      where: { id: clientId }, select: { id: true, name: true, phone: true, wallet: true }
    });
    if (!client) return error(res, 'Cliente no encontrado', 404);

    // Determinar campo de wallet según moneda
    const walletField = currency === 'XAF' ? 'balanceXaf'
                      : currency === 'XOF' ? 'balanceXof'
                      : currency === 'USD' ? 'balanceUsd'
                      : 'balanceEur';

    await prisma.$transaction([
      // Acreditar wallet del cliente
      prisma.wallet.upsert({
        where: { userId: clientId },
        update: { [walletField]: { increment: amount } },
        create: { userId: clientId, [walletField]: amount }
      }),
      // Registrar transacción
      prisma.transaction.create({
        data: {
          id: `rep_topup_${rep.id}_${Date.now()}`,
          type: 'topup',
          userId: uid(req),
          recipientId: clientId,
          amountSent: amount, currencySent: currency,
          amountReceived: amount, currencyReceived: currency,
          fee: 0,
          note: note || `Recarga por representante ${rep.id}`,
          status: 'completed'
        }
      }),
      // Descontar unidades de la cuenta del rep
      prisma.repAccount.update({
        where: { repId: rep.id },
        data: {
          unitBalance:   { decrement: amount },
          totalUnitsUsed: { increment: amount }
        }
      }),
      // Registrar la recarga
      prisma.clientTopUp.create({
        data: {
          repId: rep.id, clientId,
          clientName: client.name, clientPhone: client.phone,
          amount, currency, note, status: 'completed'
        }
      })
    ]);

    // Alerta si el saldo baja del umbral
    const updatedAccount = await prisma.repAccount.findUnique({ where: { repId: rep.id } });
    const alertLow = updatedAccount.unitBalance < updatedAccount.alertThreshold;

    return ok(res, {
      message: `✅ ${amount} ${currency} acreditados a ${client.name}`,
      newBalance: updatedAccount.unitBalance,
      alertLow,
      alertMessage: alertLow ? `⚠️ Tu saldo es bajo (${updatedAccount.unitBalance} unidades). Compra más unidades.` : null
    });
  } catch (e) { return error(res, e.message); }
});

// GET /v1/representatives/my-operations — historial completo del rep
router.get('/my-operations', authenticate, async (req, res) => {
  try {
    const rep = await prisma.representative.findUnique({
      where: { userId: uid(req) }, include: { account: true }
    });
    if (!rep) return error(res, 'No eres representante', 403);

    const { from, to, page = 1, limit = 50 } = req.query;
    const dateFilter = (from || to) ? { createdAt: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } } : {};

    const [topUps, purchases] = await Promise.all([
      prisma.clientTopUp.findMany({
        where: { repId: rep.id, ...dateFilter },
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: Number(limit)
      }),
      prisma.unitPurchase.findMany({
        where: { repId: rep.id, ...dateFilter },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return ok(res, { account: rep.account, topUps, purchases });
  } catch (e) { return error(res, e.message); }
});

// ─────────────────────────────────────────────────────────────
// RUTAS ADMIN
// ─────────────────────────────────────────────────────────────

// GET /v1/representatives — lista todos los representantes
router.get('/', authenticate, requireRole('admin','super_admin','finance_officer','country_manager'), async (req, res) => {
  try {
    const reps = await prisma.representative.findMany({
      include: { account: true },
      orderBy: { createdAt: 'desc' }
    });
    // El modelo Representative no tiene relación user — se consultan aparte
    const users = await prisma.user.findMany({
      where: { id: { in: reps.map(r => r.userId) } },
      select: { id: true, name: true, email: true, phone: true, country: true }
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    return ok(res, reps.map(r => ({ ...r, user: userMap[r.userId] || null })));
  } catch (e) { return error(res, e.message); }
});

// GET /v1/representatives/purchases/pending — compras pendientes de confirmar
router.get('/purchases/pending', authenticate, requireRole('admin','super_admin','finance_officer'), async (req, res) => {
  try {
    const purchases = await prisma.unitPurchase.findMany({
      where: { status: 'pending' },
      include: { rep: true },
      orderBy: { createdAt: 'asc' }
    });
    const users = await prisma.user.findMany({
      where: { id: { in: purchases.map(p => p.rep.userId) } },
      select: { id: true, name: true, email: true, phone: true }
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    const withUsers = purchases.map(p => ({
      ...p, rep: { ...p.rep, user: userMap[p.rep.userId] || null }
    }));
    return ok(res, { count: withUsers.length, purchases: withUsers });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/representatives/purchases/:id/confirm — admin confirma pago y acredita unidades
router.post('/purchases/:id/confirm', authenticate, requireRole('admin','super_admin','finance_officer'), async (req, res) => {
  try {
    const purchase = await prisma.unitPurchase.findUnique({
      where: { id: req.params.id }, include: { rep: { include: { account: true } } }
    });
    if (!purchase) return error(res, 'Solicitud no encontrada', 404);
    if (purchase.status !== 'pending') return error(res, 'Ya procesada', 400);

    const repId = purchase.rep.id;

    await prisma.$transaction([
      prisma.unitPurchase.update({
        where: { id: purchase.id },
        data: { status: 'confirmed', confirmedBy: uid(req), confirmedAt: new Date() }
      }),
      prisma.repAccount.upsert({
        where: { repId },
        update: {
          unitBalance:     { increment: purchase.unitsRequested },
          totalUnitsBought:{ increment: purchase.unitsRequested },
          totalPaid:       { increment: purchase.amountToPay },
          totalSaved:      { increment: purchase.amountDiscount }
        },
        create: {
          repId,
          unitBalance:     purchase.unitsRequested,
          totalUnitsBought:purchase.unitsRequested,
          totalPaid:       purchase.amountToPay,
          totalSaved:      purchase.amountDiscount
        }
      })
    ]);

    const updated = await prisma.repAccount.findUnique({ where: { repId } });

    return ok(res, {
      message: `✅ ${purchase.unitsRequested} unidades acreditadas al representante`,
      newBalance: updated.unitBalance
    });
  } catch (e) { return error(res, e.message); }
});

// POST /v1/representatives/purchases/:id/reject — admin rechaza la solicitud
router.post('/purchases/:id/reject', authenticate, requireRole('admin','super_admin','finance_officer'), async (req, res) => {
  try {
    const { reason } = req.body;
    await prisma.unitPurchase.update({
      where: { id: req.params.id },
      data: { status: 'rejected', rejectedReason: reason || 'Rechazado por admin', confirmedBy: uid(req), confirmedAt: new Date() }
    });
    return ok(res, { message: 'Solicitud rechazada' });
  } catch (e) { return error(res, e.message); }
});

// PATCH /v1/representatives/:repId/alert-threshold — configurar umbral de alerta
router.patch('/:repId/alert-threshold', authenticate, requireRole('admin','super_admin'), async (req, res) => {
  try {
    const { threshold } = req.body;
    await prisma.repAccount.update({
      where: { repId: req.params.repId },
      data: { alertThreshold: threshold }
    });
    return ok(res, { message: `Umbral de alerta actualizado a ${threshold} unidades` });
  } catch (e) { return error(res, e.message); }
});

// ─────────────────────────────────────────────────────────────
// INFORMES PDF
// ─────────────────────────────────────────────────────────────

// GET /v1/representatives/:repId/report/balance — informe de saldo y cuenta
router.get('/:repId/report/balance', authenticate, async (req, res) => {
  try {
    const rep = await prisma.representative.findUnique({
      where: { id: req.params.repId },
      include: { account: true }
    });
    if (!rep) return error(res, 'Representante no encontrado', 404);
    // El modelo no tiene relación user — se consulta aparte
    rep.user = await prisma.user.findUnique({
      where: { id: rep.userId },
      select: { name: true, email: true, phone: true, country: true }
    });

    // Solo el propio rep o admin pueden ver
    const isOwner = rep.userId === uid(req);
    const isAdmin = ['admin','super_admin','finance_officer','country_manager'].includes(req.user.role);
    if (!isOwner && !isAdmin) return error(res, 'Sin permiso', 403);

    buildPDF(res, `balance_${rep.id}_${Date.now()}.pdf`, (doc) => {
      pdfHeader(doc, 'Estado de Cuenta — Representante', `Generado: ${new Date().toLocaleDateString('es-ES')}`);

      doc.fontSize(12).font('Helvetica-Bold').fillColor('#0A1628').text('Datos del representante', { underline: true });
      doc.moveDown(0.4);
      const u = rep.user;
      [
        ['Nombre',   u.name],
        ['Email',    u.email],
        ['Teléfono', u.phone],
        ['País',     u.country],
        ['Zona',     rep.zone],
        ['Estado',   rep.status],
        ['Descuento', `${(rep.discountRate * 100).toFixed(0)}%`]
      ].forEach(([k, v]) => {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#555').text(`${k}: `, { continued: true })
           .font('Helvetica').fillColor('#000').text(v || '—');
      });

      doc.moveDown(1);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#0A1628').text('Saldo de unidades', { underline: true });
      doc.moveDown(0.4);
      const a = rep.account;
      if (a) {
        [
          ['Saldo disponible',     fmtAmt(a.unitBalance)],
          ['Total comprado',       fmtAmt(a.totalUnitsBought)],
          ['Total usado (recargas)', fmtAmt(a.totalUnitsUsed)],
          ['Total pagado a IA',    fmtAmt(a.totalPaid)],
          ['Total ahorrado (10%)', fmtAmt(a.totalSaved)],
          ['Umbral alerta',        fmtAmt(a.alertThreshold)]
        ].forEach(([k, v]) => {
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#555').text(`${k}: `, { continued: true })
             .font('Helvetica').fillColor('#222').text(v);
        });
      } else {
        doc.fontSize(10).text('Sin cuenta inicializada');
      }

      doc.fontSize(8).fillColor('#aaa').text('InnovaAFRIC — Documento confidencial', 50, 780, { align: 'center' });
    });
  } catch (e) { return error(res, e.message); }
});

// GET /v1/representatives/:repId/report/operations — informe de operaciones con filtro de fechas
router.get('/:repId/report/operations', authenticate, async (req, res) => {
  try {
    const rep = await prisma.representative.findUnique({
      where: { id: req.params.repId },
      include: { account: true }
    });
    if (!rep) return error(res, 'Representante no encontrado', 404);
    // El modelo no tiene relación user — se consulta aparte
    rep.user = await prisma.user.findUnique({
      where: { id: rep.userId },
      select: { name: true, email: true, country: true }
    });

    const isOwner = rep.userId === uid(req);
    const isAdmin = ['admin','super_admin','finance_officer','country_manager'].includes(req.user.role);
    if (!isOwner && !isAdmin) return error(res, 'Sin permiso', 403);

    const { from, to } = req.query;
    const dateFilter = (from || to) ? { createdAt: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } } : {};

    const [topUps, purchases] = await Promise.all([
      prisma.clientTopUp.findMany({ where: { repId: rep.id, ...dateFilter }, orderBy: { createdAt: 'desc' } }),
      prisma.unitPurchase.findMany({ where: { repId: rep.id, ...dateFilter }, orderBy: { createdAt: 'desc' } })
    ]);

    const totalTopUps   = topUps.reduce((s, t) => s + t.amount, 0);
    const totalPurchased = purchases.filter(p => p.status === 'confirmed').reduce((s, p) => s + p.unitsRequested, 0);

    const label = from && to ? `${from} → ${to}` : 'Histórico completo';

    buildPDF(res, `operaciones_${rep.id}_${Date.now()}.pdf`, (doc) => {
      pdfHeader(doc, 'Informe de Operaciones — Representante', `Período: ${label} | ${rep.user.name}`);

      // Resumen
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#0A1628').text('Resumen del período');
      doc.moveDown(0.4);
      pdfTable(doc, ['Concepto', 'Valor'],
        [
          ['Recargas a clientes (nº)', topUps.length],
          ['Total recargado',         fmtAmt(totalTopUps)],
          ['Compras de unidades',     purchases.length],
          ['Unidades confirmadas',    fmtAmt(totalPurchased)],
          ['Saldo actual',            fmtAmt(rep.account?.unitBalance ?? 0)]
        ]
      );

      doc.addPage();
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#0A1628').text('Recargas a clientes');
      doc.moveDown(0.5);
      pdfTable(doc,
        ['Fecha', 'Cliente', 'Teléfono', 'Importe', 'Moneda', 'Estado'],
        topUps.map(t => [fmtDate(t.createdAt), t.clientName, t.clientPhone, t.amount.toFixed(2), t.currency, t.status])
      );

      doc.addPage();
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#0A1628').text('Compras de unidades');
      doc.moveDown(0.5);
      pdfTable(doc,
        ['Fecha', 'Unidades', 'Pagó', 'Descuento', 'Banco', 'Ref.', 'Estado'],
        purchases.map(p => [
          fmtDate(p.createdAt), p.unitsRequested.toFixed(2),
          fmtAmt(p.amountToPay, p.currency), fmtAmt(p.amountDiscount, p.currency),
          p.bankName, p.bankRef, p.status
        ])
      );

      doc.fontSize(8).fillColor('#aaa').text('InnovaAFRIC — Documento confidencial', 50, 780, { align: 'center' });
    });
  } catch (e) { return error(res, e.message); }
});

// GET /v1/representatives/report/global — informe global de toda la red (admin)
router.get('/report/global', authenticate, requireRole('admin','super_admin','finance_officer','country_manager'), async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = (from || to) ? { createdAt: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } } : {};

    const reps = await prisma.representative.findMany({
      include: {
        account: true,
        topUps:       { where: dateFilter, select: { amount: true } },
        unitPurchases:{ where: { ...dateFilter, status: 'confirmed' }, select: { unitsRequested: true, amountToPay: true, amountDiscount: true } }
      }
    });
    // El modelo no tiene relación user — se consultan aparte
    const repUsers = await prisma.user.findMany({
      where: { id: { in: reps.map(r => r.userId) } },
      select: { id: true, name: true, country: true }
    });
    const repUserMap = Object.fromEntries(repUsers.map(u => [u.id, u]));
    reps.forEach(r => { r.user = repUserMap[r.userId] || { name: '—', country: '—' }; });

    const totalNetwork = reps.reduce((s, r) => {
      s.topUps    += r.topUps.reduce((a, t) => a + t.amount, 0);
      s.purchased += r.unitPurchases.reduce((a, p) => a + p.unitsRequested, 0);
      s.revenue   += r.unitPurchases.reduce((a, p) => a + p.amountToPay, 0);
      s.discounts += r.unitPurchases.reduce((a, p) => a + p.amountDiscount, 0);
      return s;
    }, { topUps: 0, purchased: 0, revenue: 0, discounts: 0 });

    const label = from && to ? `${from} → ${to}` : 'Histórico completo';

    buildPDF(res, `red_representantes_${Date.now()}.pdf`, (doc) => {
      pdfHeader(doc, 'Informe Global — Red de Representantes', `Período: ${label} | InnovaAFRIC`);

      doc.fontSize(12).font('Helvetica-Bold').fillColor('#0A1628').text('Totales de la red');
      doc.moveDown(0.4);
      pdfTable(doc, ['Métrica', 'Total'],
        [
          ['Representantes activos', reps.filter(r => r.status === 'active').length],
          ['Total recargas a clientes', fmtAmt(totalNetwork.topUps)],
          ['Total unidades vendidas',  fmtAmt(totalNetwork.purchased)],
          ['Ingresos para InnovaAFRIC', fmtAmt(totalNetwork.revenue)],
          ['Descuentos concedidos (10%)', fmtAmt(totalNetwork.discounts)]
        ]
      );

      doc.addPage();
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#0A1628').text('Detalle por representante');
      doc.moveDown(0.5);
      pdfTable(doc,
        ['Nombre', 'País', 'Zona', 'Saldo', 'Total recargado', 'Unidades vendidas', 'Estado'],
        reps.map(r => [
          r.user.name, r.user.country, r.zone,
          fmtAmt(r.account?.unitBalance ?? 0),
          fmtAmt(r.topUps.reduce((a, t) => a + t.amount, 0)),
          fmtAmt(r.unitPurchases.reduce((a, p) => a + p.unitsRequested, 0)),
          r.status
        ])
      );

      doc.fontSize(8).fillColor('#aaa').text('InnovaAFRIC — Documento confidencial', 50, 780, { align: 'center' });
    });
  } catch (e) { return error(res, e.message); }
});

module.exports = router;
