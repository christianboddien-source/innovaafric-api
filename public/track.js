/* track.js — registra una visita a las webs públicas del ecosistema.
   Carga en cada página: <script src="/track.js" data-site="innovaafric"></script>
   Si no se indica data-site, se deduce de la ruta. No bloquea ni ralentiza. */
(function () {
  try {
    var el = document.currentScript;
    var site = (el && el.getAttribute('data-site')) || '';
    if (!site) {
      var p = location.pathname;
      site = p.indexOf('/money') === 0 ? 'xendermoney'
        : p.indexOf('/shop') === 0 ? 'xendershop'
        : p.indexOf('/bigshop') === 0 ? 'xenderbigshop'
        : p.indexOf('/delivery') === 0 ? 'xenderdelivery'
        : p.indexOf('/app') === 0 ? 'app'
        : 'innovaafric';
    }
    var body = JSON.stringify({ site: site, path: location.pathname, ref: document.referrer || '' });
    var url = '/v1/track/visit';
    // sendBeacon no bloquea la navegación; fetch keepalive como respaldo
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    }
  } catch (e) { /* nunca romper la web por el tracking */ }
})();
