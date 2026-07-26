'use strict';

// Helper de correo compartido para todo el flujo de comercios.
// Reutiliza la misma configuración SMTP que ya usa /v1/emails (variables de
// entorno de Railway) y registra cada envío en EmailLog. Si no hay SMTP
// configurado, funciona en modo simulación (log en consola) sin romper nada.

const nodemailer = require('nodemailer');
const prisma = require('../config/prisma');

let _transporter;
let _built = false;

function getTransporter() {
  if (_built) return _transporter;
  _built = true;
  if (process.env.SMTP_HOST) {
    _transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  } else {
    _transporter = null; // modo simulación (dev)
  }
  return _transporter;
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Envoltorio de marca para el cuerpo del email (mismo estilo que /v1/emails).
function brandShell(innerHtml, brand) {
  const name = brand || 'XenderBigShop';
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f5f2ea">
    <div style="background:#080e1a;padding:24px;border-radius:12px 12px 0 0;text-align:center">
      <h1 style="color:#f4a623;margin:0;font-size:22px">${name}</h1>
      <p style="color:#94a3b8;font-size:11px;margin:4px 0 0;letter-spacing:1px">WE SIMPLIFY LIFE</p>
    </div>
    <div style="background:#ffffff;padding:28px;border-radius:0 0 12px 12px;color:#1e293b;font-size:14px;line-height:1.7">
      ${innerHtml}
    </div>
    <p style="color:#94a3b8;font-size:11px;text-align:center;margin:12px 0">
      © ${new Date().getFullYear()} INNOVAAFRIC · XenderBigShop ·
      <a href="mailto:contact@xenderbigshop.com" style="color:#f4a623">contact@xenderbigshop.com</a>
    </p>
  </div>`;
}

/**
 * Envía un email y lo registra en EmailLog.
 */
async function sendMail({ to, subject, html, text, from, type = 'info', wrap = true, log = true }) {
  const t = getTransporter();
  const fromAddr = from ||
    `"XenderBigShop" <${process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@xenderbigshop.com'}>`;
  const finalHtml = wrap ? brandShell(html) : html;
  const finalText = text || stripHtml(html);

  let status = 'sent';
  try {
    if (t) {
      await t.sendMail({ from: fromAddr, to, subject, text: finalText, html: finalHtml });
    } else {
      console.log(`[MAIL MOCK] to=${to} | subject="${subject}"`);
    }
  } catch (e) {
    status = 'failed';
    console.error('[MAIL] error enviando a', to, '-', e.message);
  }

  if (log) {
    try {
      await prisma.emailLog.create({
        data: {
          toFilter: String(to), subject, body: finalText.slice(0, 4000),
          type, sentBy: 'system', recipients: 1, status
        }
      });
    } catch (_) { /* no bloquear por el log */ }
  }
  return status === 'sent';
}

module.exports = { sendMail, getTransporter, brandShell, stripHtml };
