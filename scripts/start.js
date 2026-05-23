'use strict';

const { spawnSync } = require('child_process');

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

let migrated = false;

for (let i = 0; i < MAX_RETRIES; i++) {
  console.log(`[start] prisma migrate deploy — intento ${i + 1}/${MAX_RETRIES}`);

  const result = spawnSync(
    './node_modules/.bin/prisma',
    ['migrate', 'deploy'],
    { stdio: 'inherit' }
  );

  if (result.status === 0) {
    console.log('[start] Migración completada.');
    migrated = true;
    break;
  }

  console.log(`[start] Falló (código ${result.status}). Reintentando en ${RETRY_DELAY_MS / 1000}s...`);
  if (i < MAX_RETRIES - 1) sleep(RETRY_DELAY_MS);
}

if (!migrated) {
  console.warn('[start] Migración no completada tras todos los intentos. Arrancando servidor de todos modos...');
}

require('../server.js');
