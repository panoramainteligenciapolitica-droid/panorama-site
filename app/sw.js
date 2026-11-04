// Guarda a casca do app para abrir sem internet. Só cuida dos arquivos em /app/;
// login e dados (Supabase) passam direto pela rede.
// Ao mudar qualquer arquivo da lista, aumente a versão para os celulares baixarem a nova.
var VERSAO = 'panorama-app-v10';
var CASCA = [
  './',
  'app.css',
  'app.js',
  'similaridade.js',
  'casas.js',
  'geral.js',
  'proposicoes.js',
  'config.js',
  'manifest.webmanifest',
  'vendor/supabase-2.45.4.js',
  'icones/icone-192.png',
  'icones/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  // cache: 'reload' pula o cache do navegador (o GitHub Pages guarda por 10 minutos), para não misturar versões
  e.waitUntil(caches.open(VERSAO).then(function (c) {
    return c.addAll(CASCA.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
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

  // Tudo pela rede primeiro, para a página e os scripts serem sempre da mesma versão;
  // sem rede, usa o que está guardado (a casca do app abre offline)
  // (uma navegação não aceita opções extras: refaz o pedido pelo endereço)
  var daRede = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' });
  e.respondWith(daRede.then(function (r) {
    if (r.ok && req.mode !== 'navigate') { var copia = r.clone(); caches.open(VERSAO).then(function (c) { c.put(req, copia); }); }
    return r;
  }).catch(function () {
    return caches.match(req.mode === 'navigate' ? './' : req, { ignoreSearch: req.mode === 'navigate' });
  }));
});
