'use strict';

const { spawn } = require('child_process');

// Arrancar el servidor inmediatamente para que el healthcheck responda
require('../server.js');

// Migración en background — no bloquea el arranque
function runMigration(attempt) {
  if (attempt > 5) {
    console.warn('[start] Migración no completada tras 5 intentos.');
    return;
  }
  console.log(`[start] prisma migrate deploy — intento ${attempt}/5`);
  const proc = spawn('./node_modules/.bin/prisma', ['migrate', 'deploy'], { stdio: 'inherit' });
  proc.on('close', code => {
    if (code === 0) {
      console.log('[start] Migración completada.');
    } else {
      console.log(`[start] Falló (código ${code}). Reintentando en 5s...`);
      setTimeout(() => runMigration(attempt + 1), 5000);
    }
  });
}

setTimeout(() => runMigration(1), 2000);
