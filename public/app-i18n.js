'use strict';
// InnovaAFRIC app-i18n — traductor ES/FR/EN compartido por las apps
// (circular, representante, rider, comercio). Traduce los textos de la
// interfaz por coincidencia exacta; los mensajes del servidor quedan en ES.
// (Distinto de i18n.js, que es el sistema por claves de los sitios públicos.)
(function () {
  const D = {
    // ── login / sesión ──
    'Entrar': { fr: 'Connexion', en: 'Log in' },
    'Salir': { fr: 'Quitter', en: 'Log out' },
    'Contraseña': { fr: 'Mot de passe', en: 'Password' },
    '¿Has olvidado tu contraseña?': { fr: 'Mot de passe oublié ?', en: 'Forgot your password?' },
    '🔑 Recuperar contraseña': { fr: '🔑 Récupérer le mot de passe', en: '🔑 Recover password' },
    'Tu email': { fr: 'Ton email', en: 'Your email' },
    '📧 Enviarme enlace de recuperación': { fr: '📧 M’envoyer le lien de récupération', en: '📧 Send me a recovery link' },
    '🔓 Mi cuenta está bloqueada — solicitar desbloqueo': { fr: '🔓 Mon compte est bloqué — demander le déblocage', en: '🔓 My account is locked — request unlock' },
    '✉️ Contactar con soporte InnovaAFRIC': { fr: '✉️ Contacter le support InnovaAFRIC', en: '✉️ Contact InnovaAFRIC support' },
    'Nueva contraseña (mín. 8 caracteres)': { fr: 'Nouveau mot de passe (min. 8 caractères)', en: 'New password (min. 8 characters)' },
    'Repite la contraseña': { fr: 'Répète le mot de passe', en: 'Repeat the password' },
    'Guardar nueva contraseña': { fr: 'Enregistrer le nouveau mot de passe', en: 'Save new password' },
    'App oficial de recargas': { fr: 'App officielle de recharges', en: 'Official top-up app' },
    'Panel oficial de la red de representantes': { fr: 'Panneau officiel du réseau de représentants', en: 'Official representatives network panel' },
    'App oficial de repartidores': { fr: 'App officielle des livreurs', en: 'Official riders app' },
    'Panel oficial de comercios XenderBigShop': { fr: 'Panneau officiel des commerces XenderBigShop', en: 'Official XenderBigShop merchants panel' },

    // ── navegación ──
    'Inicio': { fr: 'Accueil', en: 'Home' },
    'Recargar': { fr: 'Recharger', en: 'Top up' },
    'Unidades': { fr: 'Unités', en: 'Units' },
    'Cobrar': { fr: 'Encaisser', en: 'Cash out' },
    'Caja': { fr: 'Caisse', en: 'Cash box' },
    'Historial': { fr: 'Historique', en: 'History' },
    'Circulares': { fr: 'Circulaires', en: 'Circulars' },
    'Comisiones': { fr: 'Commissions', en: 'Commissions' },
    'Mapa': { fr: 'Carte', en: 'Map' },
    'Comandas': { fr: 'Commandes', en: 'Orders' },

    // ── inicio / stats ──
    'Mis unidades de valor': { fr: 'Mes unités de valeur', en: 'My value units' },
    'Cuenta activa': { fr: 'Compte actif', en: 'Active account' },
    'Unidades compradas': { fr: 'Unités achetées', en: 'Units bought' },
    'Unidades vendidas': { fr: 'Unités vendues', en: 'Units sold' },
    'Ganancia acumulada (5%)': { fr: 'Gain cumulé (5%)', en: 'Accumulated earnings (5%)' },
    'Recargas realizadas': { fr: 'Recharges effectuées', en: 'Top-ups made' },
    '⚡ Acciones rápidas': { fr: '⚡ Actions rapides', en: '⚡ Quick actions' },
    '🕒 Últimas recargas': { fr: '🕒 Dernières recharges', en: '🕒 Latest top-ups' },
    '🕒 Actividad reciente de mi red': { fr: '🕒 Activité récente de mon réseau', en: '🕒 Recent network activity' },
    'Comisiones de red disponibles': { fr: 'Commissions réseau disponibles', en: 'Available network commissions' },
    'Circulares en mi red': { fr: 'Circulaires de mon réseau', en: 'Circulars in my network' },
    'Mis unidades': { fr: 'Mes unités', en: 'My units' },
    'Clientes registrados': { fr: 'Clients enregistrés', en: 'Registered clients' },
    'Mi descuento de compra': { fr: 'Ma remise d’achat', en: 'My purchase discount' },
    'Entregas completadas': { fr: 'Livraisons terminées', en: 'Completed deliveries' },
    'Ventas entregadas': { fr: 'Ventes livrées', en: 'Delivered sales' },
    'XAF acumulados': { fr: 'XAF cumulés', en: 'Accumulated XAF' },
    'Fecha': { fr: 'Date', en: 'Date' },
    'Cliente': { fr: 'Client', en: 'Client' },
    'Importe': { fr: 'Montant', en: 'Amount' },
    'Estado': { fr: 'Statut', en: 'Status' },
    'Nombre': { fr: 'Nom', en: 'Name' },
    'Zona': { fr: 'Zone', en: 'Zone' },
    'Vehículo': { fr: 'Véhicule', en: 'Vehicle' },
    'Divisa': { fr: 'Devise', en: 'Currency' },

    // ── acciones rápidas ──
    'Recargar cliente': { fr: 'Recharger client', en: 'Top up client' },
    'Comprar unidades': { fr: 'Acheter des unités', en: 'Buy units' },
    'Cobrar comisiones': { fr: 'Encaisser commissions', en: 'Cash out commissions' },
    'Cierre de hoy': { fr: 'Clôture du jour', en: 'Today’s closing' },
    'Mapa en vivo': { fr: 'Carte en direct', en: 'Live map' },
    'Mensajes': { fr: 'Messages', en: 'Messages' },
    'Mi red': { fr: 'Mon réseau', en: 'My network' },
    'Informe PDF': { fr: 'Rapport PDF', en: 'PDF report' },
    'Ver comandas': { fr: 'Voir commandes', en: 'View orders' },
    'Mis entregas': { fr: 'Mes livraisons', en: 'My deliveries' },
    '🖨️ Imprimir / PDF': { fr: '🖨️ Imprimer / PDF', en: '🖨️ Print / PDF' },
    '📤 Compartir': { fr: '📤 Partager', en: '📤 Share' },
    '🖨️ Descargar PDF': { fr: '🖨️ Télécharger PDF', en: '🖨️ Download PDF' },
    'Cancelar': { fr: 'Annuler', en: 'Cancel' },
    'Confirmar': { fr: 'Confirmer', en: 'Confirm' },

    // ── recargar / escáner ──
    '💸 Recargar wallet de un cliente': { fr: '💸 Recharger le wallet d’un client', en: '💸 Top up a client’s wallet' },
    'Buscar cliente (teléfono, email o nombre)': { fr: 'Chercher client (téléphone, email ou nom)', en: 'Find client (phone, email or name)' },
    '📷 Escanear QR del cliente': { fr: '📷 Scanner le QR du client', en: '📷 Scan client QR' },

    // ── unidades / cobro ──
    '🛒 Comprar unidades a InnovaAFRIC': { fr: '🛒 Acheter des unités à InnovaAFRIC', en: '🛒 Buy units from InnovaAFRIC' },
    'Unidades que necesitas': { fr: 'Unités nécessaires', en: 'Units you need' },
    'Solicitar unidades': { fr: 'Demander les unités', en: 'Request units' },
    '💰 Mis comisiones y cobro': { fr: '💰 Mes commissions et encaissement', en: '💰 My commissions & cash out' },
    '💰 Comisiones de mi red (50%)': { fr: '💰 Commissions de mon réseau (50%)', en: '💰 My network commissions (50%)' },
    '↗️ Trasladar unidades a mi wallet XenderMoney': { fr: '↗️ Transférer des unités vers mon wallet XenderMoney', en: '↗️ Move units to my XenderMoney wallet' },
    'Unidades a trasladar': { fr: 'Unités à transférer', en: 'Units to move' },
    'Importe a trasladar': { fr: 'Montant à transférer', en: 'Amount to move' },
    'Trasladar a mi wallet': { fr: 'Transférer vers mon wallet', en: 'Move to my wallet' },
    'Historial de traslados': { fr: 'Historique des transferts', en: 'Transfers history' },
    'Historial de cobros': { fr: 'Historique des encaissements', en: 'Cash-out history' },
    'Impuesto': { fr: 'Impôt', en: 'Tax' },
    'Neto recibido': { fr: 'Net reçu', en: 'Net received' },
    'Neto': { fr: 'Net', en: 'Net' },

    // ── caja ──
    '🧾 Cierre de caja': { fr: '🧾 Clôture de caisse', en: '🧾 Cash box closing' },
    'Día del cierre': { fr: 'Jour de clôture', en: 'Closing day' },
    'Ver resumen del día': { fr: 'Voir le résumé du jour', en: 'View daily summary' },
    '📋 Mi historial': { fr: '📋 Mon historique', en: '📋 My history' },
    'Recargas a clientes': { fr: 'Recharges aux clients', en: 'Client top-ups' },
    'Compras de unidades': { fr: 'Achats d’unités', en: 'Unit purchases' },

    // ── rider ──
    '🟢 Disponible': { fr: '🟢 Disponible', en: '🟢 Available' },
    '🔴 Desconectado': { fr: '🔴 Hors ligne', en: '🔴 Offline' },
    '📦 Comandas disponibles': { fr: '📦 Commandes disponibles', en: '📦 Available orders' },
    '🚚 Mis entregas': { fr: '🚚 Mes livraisons', en: '🚚 My deliveries' },
    '✅ Aceptar': { fr: '✅ Accepter', en: '✅ Accept' },
    '🧭 Ver ruta': { fr: '🧭 Voir l’itinéraire', en: '🧭 View route' },
    '🧭 Navegar': { fr: '🧭 Naviguer', en: '🧭 Navigate' },
    '✅ Entregado': { fr: '✅ Livré', en: '✅ Delivered' },
    '✅ Confirmar entrega': { fr: '✅ Confirmer la livraison', en: '✅ Confirm delivery' },
    'Nota de entrega (opcional)': { fr: 'Note de livraison (optionnel)', en: 'Delivery note (optional)' },
    'Foto de prueba (opcional)': { fr: 'Photo de preuve (optionnel)', en: 'Proof photo (optional)' },
    'Registrar entrega y cobrar': { fr: 'Enregistrer et encaisser', en: 'Register delivery & get paid' },
    '🗺️ Mapa en vivo — mi ciudad': { fr: '🗺️ Carte en direct — ma ville', en: '🗺️ Live map — my city' },
    '🗺️ Mapa en vivo — mi zona': { fr: '🗺️ Carte en direct — ma zone', en: '🗺️ Live map — my area' },

    // ── comercio ──
    '📢 Lista — avisar riders': { fr: '📢 Prête — prévenir les livreurs', en: '📢 Ready — notify riders' },
    '✕ Cancelar y reembolsar': { fr: '✕ Annuler et rembourser', en: '✕ Cancel & refund' },
    '💳 Mi QR de cobro': { fr: '💳 Mon QR d’encaissement', en: '💳 My payment QR' },
    'Mostrar QR': { fr: 'Afficher le QR', en: 'Show QR' },
    '🛵 Riders de mi país': { fr: '🛵 Livreurs de mon pays', en: '🛵 Riders in my country' },

    // ── chat / pin ──
    '💬 Chat con InnovaAFRIC': { fr: '💬 Chat avec InnovaAFRIC', en: '💬 Chat with InnovaAFRIC' },
    '💬 Mensajería': { fr: '💬 Messagerie', en: '💬 Messaging' },
    'Escribe tu mensaje…': { fr: 'Écris ton message…', en: 'Type your message…' },
    '🔐 PIN de seguridad': { fr: '🔐 Code PIN de sécurité', en: '🔐 Security PIN' },
    '🔐 Mi PIN de seguridad': { fr: '🔐 Mon code PIN', en: '🔐 My security PIN' },
    'Introduce tu PIN para confirmar la operación': { fr: 'Saisis ton PIN pour confirmer l’opération', en: 'Enter your PIN to confirm the operation' },
    'PIN actual (vacío si es la primera vez)': { fr: 'PIN actuel (vide la première fois)', en: 'Current PIN (empty if first time)' },
    'Nuevo PIN (4 a 6 dígitos)': { fr: 'Nouveau PIN (4 à 6 chiffres)', en: 'New PIN (4 to 6 digits)' },
    'Repite el nuevo PIN': { fr: 'Répète le nouveau PIN', en: 'Repeat the new PIN' },
    'Guardar PIN': { fr: 'Enregistrer le PIN', en: 'Save PIN' },

    // ── insignias y pies de login ──
    '⚡ Circular Autorizada': { fr: '⚡ Circulaire Autorisée', en: '⚡ Authorized Circular' },
    '🤝 Representante': { fr: '🤝 Représentant', en: '🤝 Representative' },
    '🛵 Rider XenderDelivery': { fr: '🛵 Livreur XenderDelivery', en: '🛵 XenderDelivery Rider' },
    '🏪 Comercio': { fr: '🏪 Commerce', en: '🏪 Merchant' },
    '🔑 Nueva contraseña': { fr: '🔑 Nouveau mot de passe', en: '🔑 New password' },
    'Solo para Circulares Autorizadas por InnovaAFRIC': { fr: 'Réservé aux Circulaires Autorisées par InnovaAFRIC', en: 'Only for Circulars authorized by InnovaAFRIC' },
    'o por un representante oficial.': { fr: 'ou par un représentant officiel.', en: 'or by an official representative.' },
    'Solo para representantes oficiales de InnovaAFRIC.': { fr: 'Réservé aux représentants officiels d’InnovaAFRIC.', en: 'Only for official InnovaAFRIC representatives.' },
    'Solo para riders registrados de XenderDelivery.': { fr: 'Réservé aux livreurs enregistrés XenderDelivery.', en: 'Only for registered XenderDelivery riders.' },
    'Solo para comercios registrados por InnovaAFRIC.': { fr: 'Réservé aux commerces enregistrés par InnovaAFRIC.', en: 'Only for merchants registered by InnovaAFRIC.' },

    // ── tablas y detalles ──
    'Cerrar': { fr: 'Fermer', en: 'Close' },
    'Recarga realizada': { fr: 'Recharge effectuée', en: 'Top-up completed' },
    'Referencia': { fr: 'Référence', en: 'Reference' },
    'Atendido por': { fr: 'Servi par', en: 'Served by' },
    'Teléfono': { fr: 'Téléphone', en: 'Phone' },
    'Pagado': { fr: 'Payé', en: 'Paid' },
    'Hora': { fr: 'Heure', en: 'Time' },
    'Recarga': { fr: 'Recharge', en: 'Top-up' },
    'Compra': { fr: 'Achat', en: 'Purchase' },
    'Circular': { fr: 'Circulaire', en: 'Circular' },
    'Tu 50%': { fr: 'Tes 50%', en: 'Your 50%' },
    'Nº de recargas': { fr: 'Nb de recharges', en: 'Top-ups count' },
    'Saldo de comisiones disponible': { fr: 'Solde de commissions disponible', en: 'Available commissions balance' },
    'Saldo de unidades': { fr: 'Solde d’unités', en: 'Units balance' },
    '↗️ Cobrar comisiones a mi wallet XenderMoney': { fr: '↗️ Encaisser mes commissions vers mon wallet XenderMoney', en: '↗️ Cash out my commissions to my XenderMoney wallet' },
    'Comisión por cada recarga': { fr: 'Commission par recharge', en: 'Commission per top-up' },
    'Comisión por cada compra de mi red': { fr: 'Commission par achat de mon réseau', en: 'Commission per network purchase' },
    'Recargas con comisión': { fr: 'Recharges avec commission', en: 'Top-ups with commission' },
    'Unidades disponibles': { fr: 'Unités disponibles', en: 'Available units' },
    'Unidades a recibir': { fr: 'Unités à recevoir', en: 'Units to receive' },
    'Pagas (95%)': { fr: 'Tu paies (95%)', en: 'You pay (95%)' },
    'Tu ganancia (5%)': { fr: 'Ton gain (5%)', en: 'Your earnings (5%)' },
    'Impuestos a pagar': { fr: 'Impôts à payer', en: 'Taxes to pay' },
    'Recibes en tu wallet': { fr: 'Tu reçois sur ton wallet', en: 'You receive in your wallet' },
    '📌 Tus techos como Circular': { fr: '📌 Tes plafonds de Circulaire', en: '📌 Your limits as Circular' },
    '🤝 Tu papel como Representante': { fr: '🤝 Ton rôle de Représentant', en: '🤝 Your role as Representative' },
    '🛵 Cómo funciona': { fr: '🛵 Comment ça marche', en: '🛵 How it works' },
    '🏪 Cómo funciona': { fr: '🏪 Comment ça marche', en: '🏪 How it works' },

    // ── leyendas del mapa ──
    '📍 Tú': { fr: '📍 Toi', en: '📍 You' },
    '⚡ Circulares': { fr: '⚡ Circulaires', en: '⚡ Circulars' },
    '🤝 Representantes': { fr: '🤝 Représentants', en: '🤝 Representatives' },
    '🤝 Reps': { fr: '🤝 Représ.', en: '🤝 Reps' },
    '🛵 Riders': { fr: '🛵 Livreurs', en: '🛵 Riders' },
    '🏢 InnovaAFRIC': { fr: '🏢 InnovaAFRIC', en: '🏢 InnovaAFRIC' },

    // ── stats del comercio ──
    '🧑‍🍳 Por preparar': { fr: '🧑‍🍳 À préparer', en: '🧑‍🍳 To prepare' },
    '📢 Esperando rider': { fr: '📢 En attente de livreur', en: '📢 Waiting for rider' },
    '🛵 En camino': { fr: '🛵 En route', en: '🛵 On the way' },
    '✅ Entregadas': { fr: '✅ Livrées', en: '✅ Delivered' },

    // ── autorizar circular (rep) ──
    '⚡ Mi red de circulares': { fr: '⚡ Mon réseau de circulaires', en: '⚡ My circulars network' },
    '➕ Autorizar nueva circular': { fr: '➕ Autoriser une nouvelle circulaire', en: '➕ Authorize new circular' },
    'Buscar usuario (teléfono, email o nombre)': { fr: 'Chercher utilisateur (téléphone, email ou nom)', en: 'Find user (phone, email or name)' },
    'Barrio / zona': { fr: 'Quartier / zone', en: 'Neighborhood / area' },
    'País': { fr: 'Pays', en: 'Country' },
    'Autorizar como Circular': { fr: 'Autoriser comme Circulaire', en: 'Authorize as Circular' }
  };

  let lang = localStorage.getItem('ia_lang') || 'es';

  function trText(node) {
    if (node.__orig === undefined) node.__orig = node.nodeValue;
    const orig = node.__orig;
    const t = orig.trim();
    if (!t) return;
    const e = D[t];
    if (!e) return;
    const out = lang === 'es' ? t : (e[lang] || t);
    const val = orig.replace(t, out);
    if (node.nodeValue !== val) node.nodeValue = val;
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { trText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    const it = document.createNodeIterator(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = it.nextNode())) trText(n);
    const els = root.querySelectorAll ? root.querySelectorAll('[placeholder]') : [];
    els.forEach(el => {
      if (el.__origPh === undefined) el.__origPh = el.placeholder;
      const e = D[el.__origPh.trim()];
      el.placeholder = e ? (lang === 'es' ? el.__origPh : (e[lang] || el.__origPh)) : el.__origPh;
    });
  }

  function apply() { walk(document.body); updateBtn(); }

  // Selector flotante 🌐 (ES → FR → EN)
  let btn;
  function updateBtn() {
    var lbl = '🌐 ' + lang.toUpperCase();
    if (btn) btn.textContent = lbl;
    document.querySelectorAll('.ia-lang-hdr').forEach(function (e) { e.textContent = lbl; });
  }
  // API global: las apps pueden cambiar idioma desde su propio botón (p. ej. en la barra superior)
  window.iaCycleLang = function () {
    lang = lang === 'es' ? 'fr' : lang === 'fr' ? 'en' : 'es';
    localStorage.setItem('ia_lang', lang);
    apply();
  };
  function makeBtn() {
    // Si la app ya tiene su propio botón de idioma en la barra superior (.ia-lang-hdr), no creamos el flotante
    if (document.querySelector('.ia-lang-hdr')) { updateBtn(); return; }
    btn = document.createElement('button');
    btn.id = 'ia-lang-btn';
    btn.style.cssText = 'position:fixed;bottom:92px;right:12px;z-index:2000;background:#121826;color:#22d3ee;' +
      'border:1px solid #232d42;border-radius:20px;padding:8px 13px;font-size:12px;font-weight:700;cursor:pointer;' +
      'box-shadow:0 2px 10px rgba(0,0,0,.4)';
    btn.onclick = window.iaCycleLang;
    document.body.appendChild(btn);
    updateBtn();
  }

  function start() {
    makeBtn();
    apply();
    // traduce también lo que las apps pintan dinámicamente (listas, tablas…)
    new MutationObserver(muts => {
      if (lang === 'es') return;
      muts.forEach(m => m.addedNodes.forEach(nd => walk(nd)));
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
