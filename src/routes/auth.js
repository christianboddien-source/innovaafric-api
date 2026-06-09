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
    const user = await prisma.user.findUnique({ where: { email }, include: { wallet: true } });
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return error(res, 'Email o contraseña incorrectos', 401);
    }
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, country: user.country,
        scope: user.scope || null, city: user.city || null, department: user.department || null },
      JWT_SECRET, { expiresIn: '8h' }
    );
    const refresh = jwt.sign({ sub: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: '30d' });
    const wallet = user.wallet;
    return success(res, {
      access_token: token, refresh_token: refresh,
      token_type: 'Bearer', expires_in: 28800,
      user: { id: user.id, name: user.name, email: user.email, role: user.role,
              country: user.country, city: user.city, phone: user.phone,
              kyc_status: user.kycStatus, ia_code: user.referralCode || null },
      wallet: wallet ? {
        balanceXaf: wallet.balanceXaf || 0,
        balanceEur: wallet.balanceEur || 0,
        balanceUsd: wallet.balanceUsd || 0,
        balanceXof: wallet.balanceXof || 0
      } : null
    });
  }

  if (grant_type === 'supabase_exchange') {
    const { supabase_token } = req.body;
    if (!supabase_token) return error(res, 'supabase_token requerido', 400);

    // Verify token with Supabase
    const sbUrl  = process.env.SUPABASE_URL || 'https://spnfvmvrlexyiljwyola.supabase.co';
    const sbAnon = process.env.SUPABASE_ANON_KEY || 'sb_publishable_Aqe-VLEi6MfY8AvlpRfnLQ_OAom278u';
    const sbResp = await fetch(`${sbUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${supabase_token}`, 'apikey': sbAnon }
    });
    if (!sbResp.ok) return error(res, 'Token de Supabase inválido o expirado', 401);
    const sbUser = await sbResp.json();
    if (!sbUser || !sbUser.id) return error(res, 'No se pudo verificar usuario Supabase', 401);

    // Find Railway user by email, supabase UUID, or generated id
    const shortId = 'usr_' + sbUser.id.slice(0, 8);
    let user = await prisma.user.findFirst({
      where: { OR: [{ email: sbUser.email }, { id: sbUser.id }, { id: shortId }] },
      include: { wallet: true }
    });

    // Auto-create Railway user if they exist in Supabase but not in Railway
    if (!user && sbUser.email) {
      const meta = sbUser.user_metadata || {};
      const newId = shortId;
      const [created] = await prisma.$transaction([
        prisma.user.create({
          data: {
            id: newId,
            name: meta.full_name || meta.name || sbUser.email.split('@')[0],
            email: sbUser.email,
            phone: meta.phone || '',
            country: meta.country || 'CM',
            role: meta.role || 'customer',
            passwordHash: bcrypt.hashSync(uuidv4(), 10), // random password — login via Supabase
            kycStatus: 'pending',
            referralCode: 'IA-' + newId.replace('usr_','').slice(0,6).toUpperCase()
          }
        }),
        prisma.wallet.create({
          data: { userId: newId, balanceEur: 0, balanceUsd: 0, balanceXaf: 0, balanceXof: 0 }
        })
      ]);
      user = await prisma.user.findUnique({ where: { id: newId }, include: { wallet: true } });
    }

    if (!user) return error(res, 'No se pudo encontrar ni crear usuario', 500);

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, country: user.country,
        scope: user.scope || null, city: user.city || null },
      JWT_SECRET, { expiresIn: '8h' }
    );
    const refresh = jwt.sign({ sub: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: '30d' });

    // Return wallet data alongside token
    const wallet = user.wallet;
    return success(res, {
      access_token: token, refresh_token: refresh,
      token_type: 'Bearer', expires_in: 28800,
      user: {
        id: user.id, name: user.name, email: user.email, role: user.role,
        country: user.country, city: user.city, phone: user.phone,
        kyc_status: user.kycStatus, referral_code: user.referralCode,
        ia_code: (sbUser.user_metadata && sbUser.user_metadata.ia_code) || user.referralCode || null
      },
      wallet: wallet ? {
        balanceXaf: wallet.balanceXaf || 0,
        balanceEur: wallet.balanceEur || 0,
        balanceUsd: wallet.balanceUsd || 0,
        balanceXof: wallet.balanceXof || 0
      } : null
    });
  }

  return error(res, 'grant_type no soportado. Use client_credentials, password o supabase_exchange', 400);
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
  const { name, email, phone, password, country, role = 'customer', zone, vehicle } = req.body;
  if (!name || !email || !phone || !password || !country) {
    return error(res, 'Campos requeridos: name, email, phone, password, country', 400);
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return error(res, 'El email ya está registrado', 409);

  if (!PUBLIC_ROLES.includes(role)) return error(res, `Rol inválido. Opciones: ${PUBLIC_ROLES.join(', ')}`, 400);

  const userId  = `usr_${uuidv4().slice(0, 8)}`;
  const riderId = `rider_${uuidv4().slice(0, 8)}`;

  const ops = [
    prisma.user.create({
      data: { id: userId, name, email, phone, country, role, passwordHash: bcrypt.hashSync(password, 10), kycStatus: 'pending' }
    }),
    prisma.wallet.create({
      data: { userId, balanceEur: 0, balanceUsd: 0, balanceXaf: 0, balanceXof: 0 }
    })
  ];

  // Si se registra como rider → crear registro Rider vinculado automáticamente
  if (role === 'rider') {
    ops.push(prisma.rider.create({
      data: {
        id: riderId,
        name,
        phone,
        zone:    zone    || country,   // usa el país si no se especifica zona
        vehicle: vehicle || 'moto',    // moto por defecto
        status:  'available',
        userId                         // vínculo directo al User (wallet)
      }
    }));
  }

  const [user] = await prisma.$transaction(ops);

  await triggerWebhook('user.registered', { id: user.id, email, role, country });
  return success(res, {
    id: user.id, name, email, role,
    kyc_status: 'pending',
    rider_id: role === 'rider' ? riderId : undefined,
    message: role === 'rider'
      ? 'Cuenta de rider creada con wallet XenderMoney. Listo para recibir pagos automáticos.'
      : 'Cuenta creada. Complete la verificación KYC para activar pagos.'
  }, 201);
});

// GET /v1/auth/sync — Lista todos los usuarios Railway + estado Supabase
router.get('/sync', requireAuth, async (req, res) => {
  const callerUser = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!callerUser || !['admin','ceo'].includes(callerUser.role)) {
    return error(res, 'Solo admins pueden sincronizar usuarios', 403);
  }
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, country: true, kycStatus: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  });
  return success(res, { total: users.length, users });
});

// POST /v1/auth/sync — Sincroniza un usuario de Supabase a Railway (upsert)
router.post('/sync', requireAuth, async (req, res) => {
  const callerUser = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!callerUser || !['admin','ceo'].includes(callerUser.role)) {
    return error(res, 'Solo admins pueden sincronizar usuarios', 403);
  }
  const { supabase_token } = req.body;
  if (!supabase_token) return error(res, 'supabase_token requerido', 400);

  const sbUrl  = process.env.SUPABASE_URL || 'https://spnfvmvrlexyiljwyola.supabase.co';
  const sbAnon = process.env.SUPABASE_ANON_KEY || 'sb_publishable_Aqe-VLEi6MfY8AvlpRfnLQ_OAom278u';

  // Fetch all users from Supabase admin API
  const sbResp = await fetch(`${sbUrl}/auth/v1/admin/users`, {
    headers: { 'Authorization': `Bearer ${supabase_token}`, 'apikey': sbAnon }
  });
  if (!sbResp.ok) return error(res, 'Error al obtener usuarios de Supabase', 400);
  const { users: sbUsers } = await sbResp.json();
  if (!sbUsers) return error(res, 'Sin usuarios en Supabase', 400);

  let synced = 0, skipped = 0;
  for (const sbUser of sbUsers) {
    if (!sbUser.email) { skipped++; continue; }
    const shortId = 'usr_' + sbUser.id.slice(0, 8);
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: sbUser.email }, { id: shortId }] }
    });
    if (existing) { skipped++; continue; }
    const meta = sbUser.user_metadata || {};
    await prisma.$transaction([
      prisma.user.create({
        data: {
          id: shortId,
          name: meta.full_name || meta.name || sbUser.email.split('@')[0],
          email: sbUser.email,
          phone: meta.phone || '',
          country: meta.country || 'CM',
          role: meta.role || 'customer',
          passwordHash: bcrypt.hashSync(uuidv4(), 10),
          kycStatus: 'pending',
          referralCode: 'IA-' + shortId.replace('usr_','').slice(0,6).toUpperCase()
        }
      }),
      prisma.wallet.create({
        data: { userId: shortId, balanceEur: 0, balanceUsd: 0, balanceXaf: 0, balanceXof: 0 }
      })
    ]);
    synced++;
  }
  return success(res, { message: `Sincronización completada: ${synced} creados, ${skipped} ya existentes`, synced, skipped });
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

// POST /v1/auth/generate-access-url — genera URL de acceso directo para un usuario admin
// Solo super_admin puede generarla para otros; cualquier admin puede generar la suya propia
router.post('/generate-access-url', requireAuth, async (req, res) => {
  const actorRole = req.user.role;
  const isSuper   = ['super_admin', 'admin'].includes(actorRole);
  const { userId, expiresInDays = 30, dashboardUrl = 'https://innovaafric-prod.vercel.app/InnovaAFRIC_Admin.html' } = req.body;

  // Determinar el usuario objetivo
  const targetId = userId && isSuper ? userId : req.user.id || req.user.sub;

  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, email: true, name: true, role: true, country: true }
  });
  if (!user) return error(res, 'Usuario no encontrado', 404);

  // Solo super_admin puede generar URLs para otros
  if (userId && userId !== (req.user.id || req.user.sub) && !isSuper) {
    return error(res, 'Solo un Super Admin puede generar URLs para otros usuarios', 403);
  }

  const expiresIn = expiresInDays * 24 * 3600;
  const token = jwt.sign(
    {
      sub:     user.id,
      email:   user.email,
      role:    user.role,
      country: user.country,
      type:    'dashboard_access'
    },
    JWT_SECRET,
    { expiresIn }
  );

  const url = `${dashboardUrl}#token=${token}`;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  return success(res, {
    url,
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    expiresAt,
    expiresInDays,
    note: `Comparte esta URL solo con ${user.name || user.email}. Expira el ${new Date(expiresAt).toLocaleDateString('es-ES')}.`
  });
});

module.exports = router;
