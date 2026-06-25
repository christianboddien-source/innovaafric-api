'use strict';

// Genera un par de claves VAPID para Web Push.
// Uso:  node scripts/gen-vapid.js
// Copia las dos claves a las variables de entorno de Railway:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  (y opcional VAPID_SUBJECT)

const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();

console.log('\n=== Claves VAPID generadas ===\n');
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('VAPID_SUBJECT=mailto:soporte@innovaafric.com');
console.log('\nPega estas variables en Railway (Variables) y redeploy.\n');
