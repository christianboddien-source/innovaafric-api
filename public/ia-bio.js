/* ia-bio.js — Desbloqueo biométrico (WebAuthn) compartido por las apps de rol.
   Se apoya en el PIN de apertura ya existente (#lockScreen / openPinKey / hasOpenPin):
   la biometría es un atajo de desbloqueo; el PIN sigue siendo el fallback.
   Modelo de confianza = local (igual que el PIN): usa el autenticador de
   plataforma del dispositivo (huella/cara) como verificación de usuario.
   No requiere backend ni token. */
(function () {
  'use strict';

  function supported() {
    return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
  }
  function key() { return location.pathname.replace(/\W/g, '_') + '_biocred'; }
  function enrolled() { return !!localStorage.getItem(key()); }
  function rand(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
  function bufToB64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
  function b64ToBuf(b64) { const s = atob(b64); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a.buffer; }

  // ¿La app exige PIN de apertura? (función global de cada app de rol)
  function appHasPin() { try { return typeof hasOpenPin === 'function' ? hasOpenPin() : !!localStorage.getItem(location.pathname.replace(/\W/g, '_') + '_openpin'); } catch (_) { return false; } }
  function hideLock() { var l = document.getElementById('lockScreen'); if (l) l.classList.add('hidden'); }

  async function enroll() {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: rand(32),
        rp: { name: 'INNOVAAFRIC' },
        user: { id: rand(16), name: 'innovaafric-app', displayName: 'InnovaAFRIC' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60000,
        attestation: 'none'
      }
    });
    if (!cred) throw new Error('No se pudo registrar la biometría');
    localStorage.setItem(key(), bufToB64(cred.rawId));
  }

  async function unlock() {
    if (!enrolled()) return false;
    await navigator.credentials.get({
      publicKey: {
        challenge: rand(32),
        allowCredentials: [{ type: 'public-key', id: b64ToBuf(localStorage.getItem(key())), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000
      }
    });
    hideLock();
    return true;
  }

  function paint() {
    const b = document.getElementById('bioBtn');
    if (b) { b.textContent = '👆'; b.style.opacity = enrolled() ? '1' : '0.45'; b.title = enrolled() ? 'Desbloqueo biométrico activado (toca para quitar)' : 'Activar desbloqueo con huella/cara'; }
  }

  async function toggle() {
    if (!supported()) { alert('Este dispositivo/navegador no soporta biometría (WebAuthn).'); return; }
    if (enrolled()) {
      if (confirm('¿Quitar el desbloqueo biométrico de este dispositivo?')) { localStorage.removeItem(key()); paint(); }
      return;
    }
    if (!appHasPin()) { alert('Primero configura un PIN de apertura (🔐). La biometría se usa junto al PIN como atajo de desbloqueo.'); return; }
    try {
      await enroll();
      paint();
      alert('✅ Desbloqueo biométrico activado. La próxima vez podrás abrir con tu huella o cara.');
    } catch (e) {
      alert('No se pudo activar la biometría: ' + (e && e.message ? e.message : e));
    }
  }

  // Inyecta el botón 👆 en la cabecera (junto a 🔕) y el botón de desbloqueo en el lock screen
  function injectButtons() {
    if (!supported()) return;
    // botón de cabecera
    const pushBtn = document.getElementById('pushBtn');
    if (pushBtn && !document.getElementById('bioBtn')) {
      const b = document.createElement('button');
      b.id = 'bioBtn';
      b.textContent = '👆';
      b.addEventListener('click', toggle);
      pushBtn.parentNode.insertBefore(b, pushBtn.nextSibling);
      paint();
    }
    // botón de desbloqueo dentro de la pantalla de bloqueo
    const lock = document.getElementById('lockScreen');
    if (lock && enrolled() && !document.getElementById('bioUnlockBtn')) {
      const u = document.createElement('button');
      u.id = 'bioUnlockBtn';
      u.textContent = '👆 Desbloquear con biometría';
      u.style.cssText = 'margin-top:10px;max-width:280px';
      u.addEventListener('click', function () { unlock().catch(function (e) { console.warn('bio', e); }); });
      lock.appendChild(u);
    }
  }

  window.iaBio = { toggle, unlock, enrolled, supported };

  if (document.readyState !== 'loading') injectButtons();
  else document.addEventListener('DOMContentLoaded', injectButtons);
})();
