'use strict';

// ─────────────────────────────────────────────────────────────
// Pipeline de alta de comercios (VendorApplication).
// ETAPA 1: registro público + aviso por email al equipo.
// ─────────────────────────────────────────────────────────────

const router = require('express').Router();
const prisma = require('../config/prisma');
const { success: ok, error } = require('../helpers/response');
const { sendMail } = require('../helpers/mailer');

const TEAM_INBOX = process.env.VENDORS_INBOX || 'contact@xenderbigshop.com';

const FIELD_LABELS = {
  businessName: 'Empresa / Negocio',
  profile: 'Perfil',
  sector: 'Sector / Tipo',
  email: 'Email',
  phone: 'Teléfono',
  country: 'País',
  city: 'Ciudad',
  plan: 'Plan',
  monthlyVolume: 'Volumen mensual',
  paymentMethod: 'Método de pago/cobro',
  deliveryOption: 'Entrega',
  message: 'Mensaje'
};

function rowsHtml(app) {
  return Object.keys(FIELD_LABELS)
    .filter(k => app[k])
    .map(k => `<tr>
        <td style="padding:6px 10px;color:#64748b;font-size:12px">${FIELD_LABELS[k]}</td>
        <td style="padding:6px 10px;font-weight:600">${String(app[k])}</td>
      </tr>`)
    .join('');
}

// POST /v1/vendors/apply — solicitud pública de alta de comercio
router.post('/apply', async (req, res) => {
  try {
    const b = req.body || {};
    const businessName = String(b.businessName || '').trim();
    const email = String(b.email || '').trim().toLowerCase();

    if (!businessName || !email) {
      return error(res, 'businessName y email son obligatorios', 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return error(res, 'Email no válido', 400);
    }

    const app = await prisma.vendorApplication.create({
      data: {
        businessName,
        email,
        phone:          b.phone          || null,
        country:        b.country        || null,
        city:           b.city           || null,
        sector:         b.sector         || null,
        profile:        b.profile === 'proveedor' ? 'proveedor' : 'comprador',
        plan:           b.plan           || null,
        monthlyVolume:  b.monthlyVolume  || null,
        paymentMethod:  b.paymentMethod  || b.pay_method || null,
        deliveryOption: b.deliveryOption || b.delivery || b['bs-delivery'] || null,
        message:        b.message        || null,
        source:         b.source         || 'xenderbigshop',
        status:         'pending'
      }
    });

    // ── Aviso al equipo ──
    sendMail({
      to: TEAM_INBOX,
      subject: `🏪 Nueva solicitud de comercio — ${businessName}`,
      type: 'onboarding',
      html: `
        <h2 style="margin:0 0 6px;color:#0f172a">Nueva solicitud de comercio</h2>
        <p style="margin:0 0 16px;color:#64748b">Recibida desde <b>${app.source}</b> · perfil <b>${app.profile}</b></p>
        <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden">
          ${rowsHtml(app)}
        </table>
        <p style="margin:18px 0 0">Revísala en el panel Admin → <b>Solicitudes de comercio</b> para validar o rechazar.</p>
        <p style="margin:6px 0 0;color:#94a3b8;font-size:12px">ID: ${app.id}</p>`
    }).catch(() => {});

    // ── Acuse de recibo al solicitante ──
    sendMail({
      to: email,
      subject: '✅ Hemos recibido tu solicitud — XenderBigShop',
      type: 'onboarding',
      html: `
        <h2 style="margin:0 0 10px;color:#0f172a">¡Gracias, ${businessName}!</h2>
        <p>Hemos recibido tu solicitud para abrir tu tienda en <b>XenderBigShop</b>.</p>
        <p>Nuestro equipo la revisará y te escribiremos con los siguientes pasos
           (incluido el contrato de vendedor) en un plazo de <b>24-48h</b>.</p>
        <p style="margin-top:16px;color:#64748b;font-size:13px">
          Si no esperabas este correo, puedes ignorarlo.
        </p>`
    }).catch(() => {});

    return ok(res, {
      message: 'Solicitud recibida. Nuestro equipo la revisará en 24-48h.',
      id: app.id,
      status: app.status
    }, 201);

  } catch (e) {
    return error(res, e.message);
  }
});

module.exports = router;
