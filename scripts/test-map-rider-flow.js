'use strict';
// Prueba e2e contra Railway: flujo del rider + presencia GPS + visibilidad por rol.
// Uso: node scripts/test-map-rider-flow.js

const BASE = 'https://innovaafric-api-production.up.railway.app/v1';

async function login(email, password) {
  const r = await fetch(`${BASE}/auth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'password', email, password })
  });
  const j = await r.json();
  if (!j.success) throw new Error(`login ${email}: ${j.error?.message}`);
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
  // 1. Rider: login y perfil
  const tokRider = await login('rider.test@innovaafric.com', 'Rider2026!');
  const rider = await call('GET', '/delivery/rider/me', tokRider);
  console.log(`1. RIDER: ${rider.user.name} | zona ${rider.zone} | ${rider.vehicle} | estado ${rider.status}`);

  // 2. Comandas disponibles
  const av = await call('GET', '/delivery/available-orders', tokRider);
  console.log(`2. COMANDAS DISPONIBLES: ${av.count}`);

  // 3. Aceptar la primera (si hay)
  if (av.count > 0) {
    const o = av.orders[0];
    const acc = await call('POST', `/delivery/orders/${o.id}/accept`, tokRider, {});
    console.log(`3. ACEPTAR: ${acc.message} | fee ${acc.riderFee} XAF`);
  } else {
    console.log('3. ACEPTAR: (sin comandas pendientes — ya aceptada en una prueba anterior)');
  }

  // 4. Presencia GPS: rider y rep hacen ping en Duala
  await call('POST', '/locations/ping', tokRider, { lat: 4.0511, lng: 9.7679 });
  const tokRep = await login('rep.test@innovaafric.com', 'Rep2026!');
  await call('POST', '/locations/ping', tokRep, { lat: 4.0483, lng: 9.7542 });
  console.log('4. PING GPS: rider y representante activos en Duala');

  // 5. Mapa del rep: debe ver al rider
  const nearRep = await call('GET', '/locations/nearby', tokRep);
  console.log(`5. MAPA DEL REP: ve ${nearRep.count} → ${nearRep.people.map(p => p.role + ' ' + p.name).join(', ')}`);

  // 6. Riders del país del rep
  const riders = await call('GET', '/representatives/riders', tokRep);
  console.log(`6. RIDERS DE SU PAÍS: ${riders.count} → ${riders.riders.map(r => r.name + ' (' + r.status + ')').join(', ')}`);

  // 7. Mapa de la circular: debe ver al rep pero NO al rider
  const tokCirc = await login('circular.test@innovaafric.com', 'Circular2026!');
  const nearCirc = await call('GET', '/locations/nearby', tokCirc);
  console.log(`7. MAPA DE LA CIRCULAR: ve ${nearCirc.count} → roles: ${nearCirc.people.map(p => p.role).join(', ') || '(nadie)'}  [no debe incluir rider]`);

  // 8. Mis entregas del rider
  const mine = await call('GET', '/delivery/my-deliveries', tokRider);
  console.log(`8. MIS ENTREGAS DEL RIDER: ${mine.count}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
