'use strict';
// Prueba e2e contra Railway: el rider marca la entrega y cobra su fee.
// Uso: node scripts/test-delivered-flow.js

const BASE = 'https://innovaafric-api-production.up.railway.app/v1';

async function login(email, password) {
  const r = await fetch(`${BASE}/auth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'password', email, password })
  });
  const j = await r.json();
  if (!j.success) throw new Error(`login: ${j.error?.message}`);
  return j.data;
}

async function call(method, path, token, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json();
  if (!j.success) throw new Error(`${path}: ${j.error?.message}`);
  return j.data;
}

async function main() {
  const auth = await login('rider.test@innovaafric.com', 'Rider2026!');
  const tok = auth.access_token;
  console.log(`0. WALLET DEL RIDER ANTES: ${auth.wallet?.balanceXaf ?? 0} XAF`);

  const mine = await call('GET', '/delivery/my-deliveries', tok);
  const inTransit = mine.orders.find(o => o.status === 'in_transit');
  if (!inTransit) { console.log('1. No hay entregas in_transit que confirmar'); return; }
  console.log(`1. ENTREGA EN CURSO: ${inTransit.deliveryAddress} | fee ${inTransit.riderFeeXaf} XAF | modo ${inTransit.riderPaymentMode}`);

  const d = await call('POST', `/delivery/orders/${inTransit.id}/delivered`, tok, {
    proof: 'Entregado en mano al cliente — prueba e2e'
  });
  console.log(`2. ENTREGADO: ${d.message} | pagado: ${d.paid}`);

  const auth2 = await login('rider.test@innovaafric.com', 'Rider2026!');
  console.log(`3. WALLET DEL RIDER DESPUÉS: ${auth2.wallet?.balanceXaf ?? 0} XAF`);

  const me = await call('GET', '/delivery/rider/me', tok);
  console.log(`4. RIDER: estado ${me.status} | entregas totales ${me.deliveriesTotal}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
