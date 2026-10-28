// Guarda a casca do app para abrir sem internet. Só cuida dos arquivos em /app/;
// login e dados (Supabase) passam direto pela rede.
// Ao mudar qualquer arquivo da lista, aumente a versão para os celulares baixarem a nova.
var VERSAO = 'panorama-app-v1';
var CASCA = [
  './',
  'app.css',
  'app.js',
  'config.js',
  'manifest.webmanifest',
  'vendor/supabase-2.45.4.js',
  'icones/icone-192.png',
  'icones/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSAO).then(function (c) { return c.addAll(CASCA); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (chaves) {
    return Promise.all(chaves.filter(function (k) { return k.indexOf('panorama-app-') === 0 && k !== VERSAO; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.indexOf('/app/') !== 0) return;

  // Páginas: rede primeiro, para pegar a versão nova; sem rede, a casca guardada
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(function () { return caches.match('./', { ignoreSearch: true }); }));
    return;
  }
  // Arquivos: responde do guardado na hora e atualiza em segundo plano
  e.respondWith(caches.open(VERSAO).then(function (c) {
    return c.match(req).then(function (guardado) {
      var daRede = fetch(req).then(function (r) { if (r.ok) c.put(req, r.clone()); return r; });
      if (guardado) { daRede.catch(function () {}); return guardado; }
      return daRede;
    });
  }));
});
