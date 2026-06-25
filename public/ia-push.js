/* ia-push.js — Web Push compartido por las apps de rol (rider/comercio/representante/circular)
   Uso: botón 🔔 con onclick="iaPush.toggle(API, TOKEN)".
   Requiere /sw.js (service worker) y los endpoints /v1/push/* del backend. */
(function () {
  'use strict';

  function b64ToUint8(base64) {
    const pad = '='.repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  function supported() {
    return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  }

  async function reg() {
    await navigator.serviceWorker.register('/sw.js').catch(() => {});
    return navigator.serviceWorker.ready;
  }

  async function vapidKey(api) {
    const r = await fetch((api || '/v1') + '/push/vapid-public-key');
    const j = await r.json();
    const d = j.data || j;
    return d && d.enabled ? d.publicKey : null;
  }

  async function currentSub() {
    if (!supported()) return null;
    const sw = await reg();
    return sw.pushManager.getSubscription();
  }

  function paint(on) {
    const b = document.getElementById('pushBtn');
    if (b) {
      b.textContent = '🔔';                       // siempre campana clara
      b.style.opacity = on ? '1' : '0.45';         // atenuada cuando está apagada (igual que 👆)
      b.title = on ? '🔔 Notificaciones activadas (toca para desactivar)' : '🔔 Activar notificaciones';
    }
  }

  // Refleja el estado real al cargar la app
  async function refresh() {
    try { paint(!!(await currentSub())); } catch (_) {}
  }

  async function enable(api, token) {
    if (!supported()) { alert('Tu navegador no soporta notificaciones push.'); return false; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { alert('Permiso de notificaciones denegado.'); return false; }
    const key = await vapidKey(api);
    if (!key) { alert('Las notificaciones aún no están configuradas en el servidor.'); return false; }
    const sw = await reg();
    let sub = await sw.pushManager.getSubscription();
    if (!sub) {
      sub = await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key) });
    }
    const r = await fetch((api || '/v1') + '/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(sub)
    });
    if (!r.ok) { alert('No se pudo guardar la suscripción.'); return false; }
    paint(true);
    // notificación de bienvenida
    fetch((api || '/v1') + '/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ url: location.pathname })
    }).catch(() => {});
    return true;
  }

  async function disable(api, token) {
    const sub = await currentSub();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      fetch((api || '/v1') + '/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ endpoint })
      }).catch(() => {});
    }
    paint(false);
  }

  async function toggle(api, token) {
    if (!token) { alert('Inicia sesión primero.'); return; }
    try {
      const sub = await currentSub();
      if (sub) {
        if (confirm('¿Desactivar las notificaciones en este dispositivo?')) await disable(api, token);
      } else {
        await enable(api, token);
      }
    } catch (e) {
      alert('Error con las notificaciones: ' + (e && e.message ? e.message : e));
    }
  }

  window.iaPush = { toggle, enable, disable, refresh, supported };

  // pinta el estado inicial cuando la página esté lista
  if (document.readyState !== 'loading') refresh();
  else document.addEventListener('DOMContentLoaded', refresh);
})();
