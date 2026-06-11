'use strict';
// Prueba e2e contra Railway: el cliente sigue su pedido en vivo.
// Flujo: rider acepta la comanda lista → hace ping GPS → el cliente la trackea.
// Uso: node scripts/test-tracking-flow.js

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
  // 1. Cliente ve sus pedidos
  const tokCli = await login('cliente.test@innovaafric.com', 'Cliente2026!');
  const mine = await call('GET', '/bigshop/my-orders', tokCli);
  console.log(`1. PEDIDOS DEL CLIENTE: ${mine.count} — estados: ${mine.orders.map(o => o.status).join(', ')}`);

  // 2. Si hay una lista (ready), el rider la acepta y hace ping GPS
  const ready = mine.orders.find(o => o.status === 'ready');
  const tokRider = await login('rider.test@innovaafric.com', 'Rider2026!');
  if (ready) {
    await call('POST', `/delivery/orders/${ready.id}/accept`, tokRider, {});
    console.log(`2. RIDER ACEPTÓ la comanda ${ready.id}`);
  } else {
    console.log('2. (sin comandas ready — uso una in_transit existente)');
  }
  await call('POST', '/locations/ping', tokRider, { lat: 4.0496, lng: 9.7062 });

  // 3. El cliente trackea el pedido en curso
  const mine2 = await call('GET', '/bigshop/my-orders', tokCli);
  const active = mine2.orders.find(o => o.status === 'in_transit');
  if (!active) { console.log('3. No hay pedido in_transit que trackear'); return; }
  const t = await call('GET', `/delivery/track-order/${active.id}`, tokCli);
  console.log(`3. TRACKING: ${t.statusLabel} | comercio: ${t.merchant?.name || '—'}`);
  console.log(`   Timeline: ${t.timeline.map(s => (s.done ? '●' : '○')).join(' ')}`);
  console.log(`   Rider: ${t.rider?.name} (${t.rider?.vehicle}) tel ${t.rider?.phone}`);
  console.log(`   Posición en vivo: ${t.rider?.position ? t.rider.position.lat + ', ' + t.rider.position.lng + ' ✓' : '(sin ping reciente)'}`);

  // 4. Seguridad: otro usuario NO puede trackear este pedido
  const tokCirc = await login('circular.test@innovaafric.com', 'Circular2026!');
  const r = await fetch(`${BASE}/delivery/track-order/${active.id}`, { headers: { Authorization: 'Bearer ' + tokCirc } });
  console.log(`4. PRIVACIDAD: otro usuario recibe ${r.status} (esperado 403) ✓`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
