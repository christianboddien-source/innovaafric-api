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
      runWalletSync();
    } else {
      console.log(`[start] Falló (código ${code}). Reintentando en 5s...`);
      setTimeout(() => runMigration(attempt + 1), 5000);
    }
  });
}

// Sincronización de saldos Supabase → Railway (idempotente: solo rellena
// wallets de Railway que estén a cero; nunca pisa actividad real)
function runWalletSync() {
  const proc = spawn('node', ['scripts/sync-supabase-wallets.js'], { stdio: 'inherit' });
  proc.on('close', code => {
    console.log(code === 0 ? '[start] Sync de wallets Supabase→Railway completado.'
                           : `[start] Sync de wallets falló (código ${code}) — se reintentará en el próximo deploy.`);
  });
}

setTimeout(() => runMigration(1), 2000);
