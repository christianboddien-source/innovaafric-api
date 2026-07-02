'use strict';
const router    = require('express').Router();
const speakeasy = require('speakeasy');
const QRCode    = require('qrcode');
const prisma    = require('../config/prisma');
const { requireAuth: authenticate, requireRole } = require('../middleware/auth');
const { success: ok, error } = require('../helpers/response');

// GET /v1/2fa/status — indica si el usuario tiene el 2FA activado
router.get('/status', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    return ok(res, { enabled: !!(user && user.twoFactorEnabled) });
  } catch (e) {
    return error(res, e.message);
  }
});

// POST /v1/2fa/setup — genera secret + QR para escanear con Authenticator
router.post('/setup', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (user.twoFactorEnabled) return error(res, '2FA ya está activado', 400);

    const secret = speakeasy.generateSecret({
      name: `InnovaAFRIC (${user.email})`,
      length: 20
    });

    // Guardamos el secret en base pero sin activar todavía
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret.base32 }
    });

    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    return ok(res, {
      secret: secret.base32,
      qrCode: qrDataUrl,
      message: 'Escanea el QR con Google Authenticator o Authy, luego verifica con /2fa/verify'
    });
  } catch (e) {
    return error(res, e.message);
  }
});

// POST /v1/2fa/verify — verifica código TOTP y activa 2FA
router.post('/verify', authenticate, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return error(res, 'Código requerido', 400);

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user.twoFactorSecret) return error(res, 'Primero ejecuta /2fa/setup', 400);

    const valid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: String(token),
      window: 1
    });

    if (!valid) return error(res, 'Código inválido o expirado', 401);

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true }
    });

    return ok(res, { message: '2FA activado correctamente' });
  } catch (e) {
    return error(res, e.message);
  }
});

// POST /v1/2fa/disable — desactiva 2FA (requiere código válido)
router.post('/disable', authenticate, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return error(res, 'Código requerido para desactivar', 400);

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user.twoFactorEnabled) return error(res, '2FA no está activado', 400);

    const valid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: String(token),
      window: 1
    });

    if (!valid) return error(res, 'Código inválido', 401);

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null }
    });

    return ok(res, { message: '2FA desactivado' });
  } catch (e) {
    return error(res, e.message);
  }
});

// POST /v1/2fa/check — valida código en login (llamado desde auth middleware)
router.post('/check', authenticate, async (req, res) => {
  try {
    const { token } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (!user.twoFactorEnabled) return ok(res, { required: false });
    if (!token) return ok(res, { required: true, verified: false });

    const valid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: String(token),
      window: 1
    });

    return ok(res, { required: true, verified: valid });
  } catch (e) {
    return error(res, e.message);
  }
});

module.exports = router;
