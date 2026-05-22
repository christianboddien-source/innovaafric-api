'use strict';

const express = require('express');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const DB = require('../config/db');
const { success, error } = require('../helpers/response');
const { requireAuth }    = require('../middleware/auth');
const { triggerWebhook } = require('../helpers/response');

const JWT_SECRET = process.env.JWT_SECRET || 'innovaafric_secret_2026';

// POST /v1/auth/token — OAuth 2.0 client_credentials + password
router.post('/token', (req, res) => {
  const { grant_type, client_id, client_secret, scope, email, password } = req.body;

  if (grant_type === 'client_credentials') {
    const client = DB.api_clients.find(c => c.client_id === client_id);
    if (!client || !bcrypt.compareSync(client_secret, client.client_secret)) {
      return error(res, 'Credenciales de cliente inválidas', 401);
    }
    const requestedScopes = scope ? scope.split(' ') : client.scopes;
    const token = jwt.sign(
      { sub: client_id, type: 'client', scopes: requestedScopes },
      JWT_SECRET, { expiresIn: '1h' }
    );
    return success(res, { access_token: token, token_type: 'Bearer', expires_in: 3600, scope: requestedScopes.join(' ') });
  }

  if (grant_type === 'password') {
    const user = DB.users.find(u => u.email === email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return error(res, 'Email o contraseña incorrectos', 401);
    }
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, country: user.country },
      JWT_SECRET, { expiresIn: '8h' }
    );
    const refresh = jwt.sign({ sub: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: '30d' });
    return success(res, {
      access_token: token, refresh_token: refresh,
      token_type: 'Bearer', expires_in: 28800,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, kyc_status: user.kyc_status }
    });
  }

  return error(res, 'grant_type no soportado. Use client_credentials o password', 400);
});

// POST /v1/auth/refresh
router.post('/refresh', (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return error(res, 'refresh_token requerido', 400);
  try {
    const payload = jwt.verify(refresh_token, JWT_SECRET);
    const user = DB.users.find(u => u.id === payload.sub);
    if (!user) return error(res, 'Usuario no encontrado', 404);
    const newToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, country: user.country },
      JWT_SECRET, { expiresIn: '8h' }
    );
    return success(res, { access_token: newToken, token_type: 'Bearer', expires_in: 28800 });
  } catch {
    return error(res, 'refresh_token inválido o expirado', 401);
  }
});

// POST /v1/auth/register
router.post('/register', (req, res) => {
  const { name, email, phone, password, country, role = 'customer' } = req.body;
  if (!name || !email || !phone || !password || !country) {
    return error(res, 'Campos requeridos: name, email, phone, password, country', 400);
  }
  if (DB.users.find(u => u.email === email)) {
    return error(res, 'El email ya está registrado', 409);
  }
  const validRoles = ['customer', 'circular_autorizada', 'rider', 'supplier'];
  if (!validRoles.includes(role)) return error(res, `Rol inválido. Opciones: ${validRoles.join(', ')}`, 400);

  const user = {
    id: `usr_${uuidv4().slice(0, 8)}`,
    name, email, phone, country, role,
    password_hash: bcrypt.hashSync(password, 10),
    kyc_status: 'pending',
    created_at: new Date().toISOString()
  };
  DB.users.push(user);
  DB.wallets[user.id] = { balance_eur: 0, balance_usd: 0, balance_xaf: 0, balance_xof: 0 };
  triggerWebhook('user.registered', { id: user.id, email, role, country });
  return success(res, {
    id: user.id, name, email, role,
    kyc_status: 'pending',
    message: 'Cuenta creada. Complete la verificación KYC para activar pagos.'
  }, 201);
});

// POST /v1/auth/kyc
router.post('/kyc', requireAuth, (req, res) => {
  const { document_type, document_number } = req.body;
  if (!document_type || !document_number) {
    return error(res, 'document_type y document_number requeridos', 400);
  }
  const user = DB.users.find(u => u.id === req.user.sub);
  if (!user) return error(res, 'Usuario no encontrado', 404);
  user.kyc_status = 'under_review';
  user.kyc_document = { type: document_type, number: document_number, submitted_at: new Date().toISOString() };
  triggerWebhook('kyc.submitted', { user_id: user.id, document_type });
  return success(res, { status: 'under_review', message: 'Documentación recibida. Revisión en 24-48h.' });
});

module.exports = router;
