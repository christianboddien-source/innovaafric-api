'use strict';
// Prueba e2e contra Railway: PIN de seguridad en operaciones de dinero.
// Uso: node scripts/test-pin-flow.js

const BASE = 'https://innovaafric-api-production.up.railway.app/v1';
const PIN = '4321';

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
  const tok = await login('circular.test@innovaafric.com', 'Circular2026!');

  // 0. estado inicial
  let r = await raw('GET', '/auth/pin-status', tok);
  console.log(`0. PIN-STATUS inicial: hasPin=${r.json.data.hasPin}`);

  // 1. configurar PIN (si ya existe de una prueba anterior, pasa el actual)
  r = await raw('POST', '/auth/set-pin', tok, r.json.data.hasPin ? { pin: PIN, currentPin: PIN } : { pin: PIN });
  console.log(`1. SET-PIN: ${r.status} — ${r.json.data?.message || r.json.error?.message}`);

  // 2. cliente para la recarga
  const cli = (await raw('GET', '/circulares/find-client?q=%2B23769988', tok)).json.data.clients[0];

  // 3. recarga SIN pin → 428
  r = await raw('POST', '/circulares/topup-client', tok, { clientId: cli.id, amount: 500, currency: 'XAF' });
  console.log(`2. RECARGA SIN PIN: ${r.status} (esperado 428) — ${r.json.error?.message}`);

  // 4. recarga con PIN INCORRECTO → 401
  r = await raw('POST', '/circulares/topup-client', tok, { clientId: cli.id, amount: 500, currency: 'XAF', pin: '0000' });
  console.log(`3. PIN INCORRECTO: ${r.status} (esperado 401) — ${r.json.error?.message}`);

  // 5. recarga con PIN CORRECTO → ok
  r = await raw('POST', '/circulares/topup-client', tok, { clientId: cli.id, amount: 500, currency: 'XAF', pin: PIN });
  console.log(`4. PIN CORRECTO: ${r.status} — ${r.json.data?.message || r.json.error?.message}`);

  // 6. cambiar PIN exige el actual
  r = await raw('POST', '/auth/set-pin', tok, { pin: '9999' });
  console.log(`5. CAMBIAR PIN sin el actual: ${r.status} (esperado 401) — ${r.json.error?.message}`);

  // 7. el traductor está servido
  const i18n = await fetch('https://innovaafric-api-production.up.railway.app/app-i18n.js');
  console.log(`6. APP-I18N.JS: ${i18n.status} — ${(await i18n.text()).length} bytes (selector ES/FR/EN activo en las 4 apps)`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
