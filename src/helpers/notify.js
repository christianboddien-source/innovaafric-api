'use strict';

const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/prisma');

async function notify(userId, { title, body, type = 'info', channel = 'in_app', data = null }) {
  try {
    const notif = await prisma.notification.create({
      data: {
        id: `notif_${uuidv4().slice(0, 8)}`,
        userId, title, body, type, channel,
        data: data ? JSON.stringify(data) : null
      }
    });
    if (channel === 'email') console.log(`[EMAIL → ${userId}] ${title}: ${body}`);
    else if (channel === 'sms') console.log(`[SMS → ${userId}] ${body}`);
    return notif;
  } catch { /* notificación no crítica */ }
}

async function notifyAll(userId, payload) {
  await Promise.all(['in_app', 'email', 'sms'].map(ch => notify(userId, { ...payload, channel: ch })));
}

module.exports = { notify, notifyAll };
