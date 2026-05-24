'use strict';

const express = require('express');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const prisma  = require('../config/prisma');
const { success, error, triggerWebhook } = require('../helpers/response');
const { requireAuth } = require('../middleware/auth');
const { PUBLIC_ROLES } = require('../config/roles');

const JWT_SECRET = process.env.JWT_SECRET || 'innovaafric_secret_2026';

// POST /v1/auth/token — OAuth 2.0 client_credentials + password
router.post('/token', async (req, res) => {
  const { grant_type, client_id, client_secret, scope, email, password } = req.body;

  if (grant_type === 'client_credentials') {
    const client = await prisma.apiClient.findUnique({ where: { clientId: client_id } });
    if (!client || !bcrypt.compareSync(client_secret, client.clientSecret)) {
      return error(res, 'Credenciales de cliente inválidas', 401);
    }
    const requestedScopes = scope ? scope.split(' ') : client.scopes.split(',');
    const token = jwt.sign(
      { sub: client_id, type: 'client', scopes: requestedScopes },
      JWT_SECRET, { expiresIn: '1h' }
    );
    return success(res, { access_token: token, token_type: 'Bearer', expires_in: 3600, scope: requestedScopes.join(' ') });
  }

  if (grant_type === 'password') {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return error(res, 'Email o contraseña incorrectos', 401);
    }
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, country: user.country,
        scope: user.scope || null, city: user.city || null, department: user.department || null },
      JWT_SECRET, { expiresIn: '8h' }
    );
    const refresh = jwt.sign({ sub: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: '30d' });
    return success(res, {
      access_token: token, refresh_token: refresh,
      token_type: 'Bearer', expires_in: 28800,
      user: { id: user.id, name: user.name, email: user.email, role: user.role,
              country: user.country, scope: user.scope, city: user.city,
              department: user.department, kyc_status: user.kycStatus }
    });
  }

  return error(res, 'grant_type no soportado. Use client_credentials o password', 400);
});

// POST /v1/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return error(res, 'refresh_token requerido', 400);
  try {
    const payload = jwt.verify(refresh_token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return error(res, 'Usuario no encontrado', 404);
    const newToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, country: user.country,
        scope: user.scope || null, city: user.city || null, department: user.department || null },
      JWT_SECRET, { expiresIn: '8h' }
    );
    return success(res, { access_token: newToken, token_type: 'Bearer', expires_in: 28800 });
  } catch {
    return error(res, 'refresh_token inválido o expirado', 401);
  }
});

// POST /v1/auth/register
router.post('/register', async (req, res) => {
  const { name, email, phone, password, country, role = 'customer' } = req.body;
  if (!name || !email || !phone || !password || !country) {
    return error(res, 'Campos requeridos: name, email, phone, password, country', 400);
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return error(res, 'El email ya está registrado', 409);

  if (!PUBLIC_ROLES.includes(role)) return error(res, `Rol inválido. Opciones: ${PUBLIC_ROLES.join(', ')}`, 400);

  const userId = `usr_${uuidv4().slice(0, 8)}`;
  const [user] = await prisma.$transaction([
    prisma.user.create({
      data: { id: userId, name, email, phone, country, role, passwordHash: bcrypt.hashSync(password, 10), kycStatus: 'pending' }
    }),
    prisma.wallet.create({
      data: { userId, balanceEur: 0, balanceUsd: 0, balanceXaf: 0, balanceXof: 0 }
    })
  ]);

  await triggerWebhook('user.registered', { id: user.id, email, role, country });
  return success(res, {
    id: user.id, name, email, role,
    kyc_status: 'pending',
    message: 'Cuenta creada. Complete la verificación KYC para activar pagos.'
  }, 201);
});

// POST /v1/auth/kyc
router.post('/kyc', requireAuth, async (req, res) => {
  const { document_type, document_number } = req.body;
  if (!document_type || !document_number) {
    return error(res, 'document_type y document_number requeridos', 400);
  }
  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user) return error(res, 'Usuario no encontrado', 404);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      kycStatus: 'under_review',
      kycDocument: JSON.stringify({ type: document_type, number: document_number, submitted_at: new Date().toISOString() })
    }
  });
  await triggerWebhook('kyc.submitted', { user_id: user.id, document_type });
  return success(res, { status: 'under_review', message: 'Documentación recibida. Revisión en 24-48h.' });
});

module.exports = router;
