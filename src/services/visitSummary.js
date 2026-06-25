'use strict';

// Scheduler del resumen diario de visitas por push.
// Comprueba cada 10 min; a la hora objetivo (VISIT_SUMMARY_HOUR, por defecto 20h
// hora del servidor) envía una vez al día el resumen a los admin suscritos.
// In-memory: tras un redeploy podría reenviarse si coincide con la hora; aceptable.

const track = require('../routes/track');

const HOUR = Number(process.env.VISIT_SUMMARY_HOUR || 20);
let lastSent = null;

async function tick() {
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (now.getHours() === HOUR && lastSent !== today) {
      lastSent = today;
      const r = await track.sendDailySummary();
      console.log(`[visitSummary] enviado (${r.total} visitas, push sent=${r.push && r.push.sent}).`);
    }
  } catch (e) {
    console.warn('[visitSummary] error:', e.message);
  }
}

function start() {
  setInterval(tick, 10 * 60 * 1000); // cada 10 minutos
  tick();
}

module.exports = { start };
