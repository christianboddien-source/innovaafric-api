'use strict';

const { v4: uuidv4 } = require('uuid');
const DB = require('../config/db');

const CHANNELS = ['in_app', 'email', 'sms'];

function notify(user_id, { title, body, type = 'info', channel = 'in_app', data = null }) {
  const notif = {
    id: `notif_${uuidv4().slice(0, 8)}`,
    user_id,
    title,
    body,
    type,       // info | success | warning | error
    channel,    // in_app | email | sms
    data,
    read: false,
    created_at: new Date().toISOString()
  };
  DB.notifications.push(notif);

  // En producción: integrar con SendGrid (email) / Twilio (SMS) / FCM (push)
  if (channel === 'email') {
    console.log(`[EMAIL → ${user_id}] ${title}: ${body}`);
  } else if (channel === 'sms') {
    console.log(`[SMS → ${user_id}] ${body}`);
  }

  return notif;
}

// Notificar por todos los canales a la vez
function notifyAll(user_id, payload) {
  CHANNELS.forEach(ch => notify(user_id, { ...payload, channel: ch }));
}

module.exports = { notify, notifyAll };
