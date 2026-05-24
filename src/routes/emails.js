'use strict';

const express    = require('express');
const nodemailer = require('nodemailer');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, requireRole } = require('../middleware/auth');
const requireAdmin = requireRole('admin');
const { ok, error } = require('../helpers/response');

const router = express.Router();
const prisma = new PrismaClient();

/* ── Transporter SMTP (configurable vía .env) ─────── */
function buildTransporter() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  // Modo desarrollo: Ethereal (cuenta temporal automática)
  return null;
}

/* ── GET /emails — historial de envíos ────────────── */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const [logs, total] = await Promise.all([
      prisma.emailLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset)
      }),
      prisma.emailLog.count()
    ]);
    const stats = {
      total,
      sent:   await prisma.emailLog.count({ where: { status: 'sent' } }),
      failed: await prisma.emailLog.count({ where: { status: 'failed' } })
    };
    ok(res, { logs, stats });
  } catch (e) {
    error(res, e.message);
  }
});

/* ── POST /emails/send ────────────────────────────── */
router.post('/send', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { to, subject, body, type } = req.body;
    if (!to || !subject || !body) return error(res, 'Faltan: to, subject, body', 400);

    // Resolver destinatarios
    let recipients = [];
    if (to === 'all') {
      recipients = await prisma.user.findMany({ select: { email: true, name: true } });
    } else if (to.startsWith('country:')) {
      const country = to.split(':')[1];
      recipients = await prisma.user.findMany({
        where: { country },
        select: { email: true, name: true }
      });
    } else if (to.startsWith('role:')) {
      const role = to.split(':')[1];
      recipients = await prisma.user.findMany({
        where: { role },
        select: { email: true, name: true }
      });
    } else {
      // Email directo
      recipients = [{ email: to, name: to }];
    }

    if (!recipients.length) return error(res, 'No se encontraron destinatarios', 404);

    let status = 'sent';
    let sentCount = 0;
    const transporter = buildTransporter();

    if (transporter) {
      // Envío real vía SMTP
      const htmlBody = body.replace(/\n/g, '<br>');
      for (const r of recipients) {
        try {
          await transporter.sendMail({
            from:    `"INNOVAAFRIC" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to:      r.email,
            subject,
            text:    body,
            html:    `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto">
              <div style="background:#080e1a;padding:24px;border-radius:12px 12px 0 0;text-align:center">
                <h1 style="color:#00AEEF;margin:0;font-size:22px">InnovaAFRIC</h1>
                <p style="color:#64748b;font-size:11px;margin:4px 0 0">We Simplify Life</p>
              </div>
              <div style="background:#0d1526;padding:28px;border-radius:0 0 12px 12px">
                <p style="color:#e2e8f0;font-size:14px;line-height:1.7">${htmlBody}</p>
              </div>
              <p style="color:#475569;font-size:11px;text-align:center;margin-top:12px">
                © 2026 INNOVAAFRIC · <a href="mailto:support@innovaafric.com" style="color:#00AEEF">Soporte</a>
              </p>
            </div>`
          });
          sentCount++;
        } catch (_) { /* continuar con el siguiente */ }
      }
    } else {
      // Modo simulación: solo registrar
      console.log(`[EMAIL MOCK] To: ${to} | Subject: ${subject} | Recipients: ${recipients.length}`);
      sentCount = recipients.length;
    }

    // Registrar en EmailLog
    const log = await prisma.emailLog.create({
      data: {
        toFilter:   to,
        subject,
        body,
        type:       type || 'info',
        sentBy:     req.user.id,
        recipients: sentCount,
        status:     sentCount > 0 ? 'sent' : 'failed'
      }
    });

    ok(res, { log, sent: sentCount, total: recipients.length });
  } catch (e) {
    error(res, e.message);
  }
});

module.exports = router;
