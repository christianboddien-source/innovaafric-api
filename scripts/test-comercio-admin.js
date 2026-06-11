'use strict';
// Prueba e2e contra Railway: seguridad del alta de comercios + URL por perfil.
// Uso: node scripts/test-comercio-admin.js

const BASE = 'https://innovaafric-api-production.up.railway.app/v1';

async function login(email, password) {
  const r = await fetch(`${BASE}/auth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'password', email, password })
  });
  const j = await r.json();
  if (!j.success) throw new Error(`login: ${j.error?.message}`);
  return j.data.access_token;
}

async function raw(method, path, token, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: r.status, json: await r.json() };
}

async function main() {
  // 1. Un NO-admin no puede registrar ni listar comercios
  const tokCirc = await login('circular.test@innovaafric.com', 'Circular2026!');
  const reg = await raw('POST', '/comercio/register', tokCirc, { name: 'X', email: 'x@x.com', country: 'X' });
  console.log(`1. REGISTER sin admin: ${reg.status} (esperado 403) — ${reg.json.error?.message}`);
  const list = await raw('GET', '/comercio/list', tokCirc);
  console.log(`2. LIST sin admin: ${list.status} (esperado 403)`);

  // 2. URL de acceso por perfil: cada uno genera la suya y apunta a su app
  const cases = [
    ['comercio.test@innovaafric.com', 'Comercio2026!', '/comercio'],
    ['rider.test@innovaafric.com', 'Rider2026!', '/rider'],
    ['rep.test@innovaafric.com', 'Rep2026!', '/representante'],
    ['circular.test@innovaafric.com', 'Circular2026!', '/circular']
  ];
  for (const [email, pass, expected] of cases) {
    const tok = await login(email, pass);
    const r = await raw('POST', '/auth/generate-access-url', tok, {});
    const url = r.json.data?.url || '';
    const okFlag = url.includes(expected) ? '✓' : '✗ ERROR';
    console.log(`3. URL de ${email.split('@')[0].split('.')[0]}: …${url.split('#')[0].split('.app')[1] || url} ${okFlag}`);
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
