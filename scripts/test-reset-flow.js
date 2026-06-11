'use strict';
// Prueba e2e del flujo de recuperación contra Railway.
// Firma el token de reset con el JWT_SECRET del .env (mismo que producción)
// para no depender del email. Uso: node scripts/test-reset-flow.js

require('dotenv').config();
const jwt = require('jsonwebtoken');

const BASE = 'https://innovaafric-api-production.up.railway.app/v1';
const SECRET = process.env.JWT_SECRET || 'innovaafric_secret_2026';

async function main() {
  // 1. forgot-password (respuesta genérica, sin revelar si existe)
  let r = await fetch(`${BASE}/auth/forgot-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'circular.test@innovaafric.com' })
  });
  let j = await r.json();
  console.log('1. FORGOT:', r.status, '-', j.data.message.slice(0, 60) + '... | email enviado:', j.data.sent);

  // 2. obtener el id del usuario con login
  r = await fetch(`${BASE}/auth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'password', email: 'circular.test@innovaafric.com', password: 'Circular2026!' })
  });
  j = await r.json();
  const userId = j.data.user.id;

  // 3. reset-password con token firmado (misma contraseña para no romper las credenciales de prueba)
  const resetToken = jwt.sign({ sub: userId, email: 'circular.test@innovaafric.com', type: 'password_reset' }, SECRET, { expiresIn: '30m' });
  r = await fetch(`${BASE}/auth/reset-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: resetToken, newPassword: 'Circular2026!' })
  });
  j = await r.json();
  console.log('2. RESET:', r.status, '-', j.data?.message || j.error?.message);

  // 4. login con la contraseña "nueva"
  r = await fetch(`${BASE}/auth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'password', email: 'circular.test@innovaafric.com', password: 'Circular2026!' })
  });
  j = await r.json();
  console.log('3. LOGIN POST-RESET:', r.status, '-', j.data?.user?.name || j.error?.message);
  const tok = j.data.access_token;

  // 5. token inválido → 401
  r = await fetch(`${BASE}/auth/reset-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'token_falso', newPassword: 'loquesea123' })
  });
  j = await r.json();
  console.log('4. TOKEN FALSO:', r.status, '-', j.error?.message);

  // 6. endpoint del QR: cliente por id
  r = await fetch(`${BASE}/auth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'password', email: 'cliente.test@innovaafric.com', password: 'Cliente2026!' })
  });
  const clientId = (await r.json()).data.user.id;
  r = await fetch(`${BASE}/circulares/client/${clientId}`, { headers: { Authorization: 'Bearer ' + tok } });
  j = await r.json();
  console.log('5. QR→CLIENTE:', r.status, '-', j.data?.client?.name, j.data?.client?.phone);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
