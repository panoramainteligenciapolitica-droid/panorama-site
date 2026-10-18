// O site anterior (da GoDaddy) pode ter deixado um service worker no navegador de quem o visitou,
// que continua mostrando a página antiga. Este arquivo o substitui: apaga o que ficou guardado,
// se desinstala e recarrega a página, que passa a vir do site atual.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    await self.registration.unregister();
    var abas = await self.clients.matchAll({ type: 'window' });
    abas.forEach(function (c) { c.navigate(c.url); });
  })());
});
