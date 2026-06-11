'use strict';
// Prueba e2e contra Railway: el comercio recibe la comanda, la marca lista
// y el rider la ve disponible. Uso: node scripts/test-comercio-flow.js

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
  // 1. Comercio: login + perfil
  const tokCom = await login('comercio.test@innovaafric.com', 'Comercio2026!');
  const me = await call('GET', '/comercio/me', tokCom);
  console.log(`1. COMERCIO: ${me.name} (${me.city}) | por preparar: ${me.stats.preparing} | ventas: ${me.stats.totalSalesXaf} XAF`);

  // 2. Sus comandas
  const orders = await call('GET', '/comercio/orders', tokCom);
  const prep = orders.orders.find(o => o.status === 'preparing');
  console.log(`2. COMANDAS: ${orders.count} | por preparar: ${prep ? prep.id + ' → ' + prep.deliveryAddress : '(ninguna)'}`);

  // 3. Marcar lista → avisar riders
  if (prep) {
    const d = await call('POST', `/comercio/orders/${prep.id}/ready`, tokCom, {});
    console.log(`3. AVISAR RIDERS: ${d.message}`);
  }

  // 4. El rider la ve disponible
  const tokRider = await login('rider.test@innovaafric.com', 'Rider2026!');
  const av = await call('GET', '/delivery/available-orders', tokRider);
  const found = prep ? av.orders.find(o => o.id === prep.id) : null;
  console.log(`4. RIDER VE: ${av.count} comanda(s) disponibles${found ? ' — incluida la del comercio ✓ (fee ' + found.riderFeeXaf + ' XAF)' : ''}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
