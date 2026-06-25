'use strict';

// ─────────────────────────────────────────────────────────────
// Claves VAPID para Web Push.
//
// Prioridad: variables de entorno (Railway) > estas por defecto.
// Las de entorno SIEMPRE ganan, así puedes rotar las claves sin tocar
// el código simplemente definiendo VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
// (y opcional VAPID_SUBJECT) en Railway.
//
// Para rotar: `node scripts/gen-vapid.js`, pega el par en Railway y redeploy.
//
// Nota de seguridad: la clave privada VAPID solo identifica a este
// servidor de aplicación ante los servicios de push. No da acceso a datos
// ni a la base de datos. Aun así, si algún día se considera sensible,
// muévela a una variable de entorno y borra el valor de aquí.
// ─────────────────────────────────────────────────────────────

module.exports = {
  publicKey: process.env.VAPID_PUBLIC_KEY
    || 'BJOpuYpuhVEn5T8yRJrrnBb9xEt1wp-ELAfKS8ARRdoVkqOBBKfl-YM6baHx8qiFzxXi2thMbknSSZ81DW1dp-w',
  privateKey: process.env.VAPID_PRIVATE_KEY
    || '5xEoFYJ8tkEums7QmLaYtop7TOleAn3GMGbt5yGXFdU',
  subject: process.env.VAPID_SUBJECT || 'mailto:soporte@innovaafric.com'
};
