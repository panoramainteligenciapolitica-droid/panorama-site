// Testes de uso do app no modo de demonstração (navegador de verdade, sem Supabase), do jeito "errado":
// clique duplo em Apagar, e-mail repetido, campos vazios, prévia editável, link javascript: recebido.
// Uso: node testes/app-demo.js    (precisa do Playwright; sobe um servidor local na porta 8765)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const servidor = http.createServer((req, res) => {
  let u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u.endsWith('/')) u += 'index.html';
  if (u === '/app/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end("window.PANORAMA_CONFIG = { supabaseUrl: '', supabaseAnonKey: '', demo: true };"); }
  const f = path.join(RAIZ, path.normalize(u));
  if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(8765);

let falhas = 0;
const ok = (c, m) => { console.log((c ? 'ok    ' : 'FALHA ') + m); if (!c) falhas++; };

(async () => {
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage({ serviceWorkers: 'block' });
  const errosCsp = [];
  pagina.on('console', (m) => { if (/Content Security Policy/i.test(m.text()) && /localhost|127\.0\.0\.1|'self'/.test(m.text())) errosCsp.push(m.text()); });
  pagina.on('pageerror', (e) => { ok(false, 'erro de JavaScript: ' + e.message); });
  const aviso = async () => { await pagina.waitForSelector('#toast.visivel'); const t = await pagina.textContent('#toast'); await pagina.evaluate(() => document.getElementById('toast').classList.remove('visivel')); return t; };
  const BASE = 'http://localhost:8765/app/';

  await pagina.goto(BASE + '?secao=listas');
  await pagina.click('text=Nova lista');
  await pagina.click('#df-salvar');
  ok(/Preencha: Nome/.test(await pagina.textContent('#df-erro')), 'lista sem nome mostra "Preencha: Nome"');
  await pagina.fill('#dfc-nome', 'Gabinetes');
  await pagina.click('#df-salvar');
  await pagina.waitForSelector('text=Gabinetes');

  await pagina.click('text=Adicionar e-mails');
  await pagina.fill('#dfc-texto', 'a@x.com\nA@x.com\nb@x.com\nnão é e-mail');
  await pagina.click('#df-salvar');
  let t = await aviso();
  ok(/^2 adicionados · 1 já estavam/.test(t), 'e-mail repetido no mesmo lote não trava o resto (' + t + ')');
  await pagina.click('text=Adicionar e-mails');
  await pagina.fill('#dfc-texto', 'a@x.com\nc@x.com');
  await pagina.click('#df-salvar');
  t = await aviso();
  ok(/^1 adicionado · 1 já estavam/.test(t), 'e-mail que já estava na lista não barra os novos (' + t + ')');

  await pagina.click('li.item >> text=Editar');
  await pagina.dblclick('#df-apagar');
  await pagina.waitForTimeout(300);
  ok(await pagina.isVisible('#df-apagar') && /Toque de novo/.test(await pagina.textContent('#df-apagar')), 'clique duplo em Apagar só pede confirmação');
  await pagina.waitForTimeout(700);
  await pagina.click('#df-apagar');
  await pagina.waitForSelector('text=Nenhuma lista ainda.');
  ok(true, 'segundo toque, depois de um instante, apaga');

  await pagina.click('text=Nova lista'); await pagina.fill('#dfc-nome', 'Envio'); await pagina.click('#df-salvar');
  await pagina.click('li.item >> text=Adicionar e-mails'); await pagina.fill('#dfc-texto', 'd@x.com'); await pagina.click('#df-salvar'); await aviso();
  await pagina.click('li.item >> text=Escrever e-mail');
  await pagina.fill('#dfc-assunto', 'Teste'); await pagina.fill('#dfc-corpo', 'Olá {{nome}}');
  await pagina.click('#df-salvar');
  await pagina.waitForSelector('#dfc-previa');
  ok(await pagina.$eval('#dfc-previa', (e) => e.readOnly), 'a prévia do e-mail não aceita edição (o que se digitasse ali não seria enviado)');

  await pagina.goto(BASE + '?titulo=Teste&link=' + encodeURIComponent('javascript:alert(1)'));
  await pagina.waitForSelector('#tela-recebido:not([hidden])');
  const href = await pagina.$eval('#recebido-link', (a) => a.getAttribute('href') || '');
  ok(!/^javascript:/i.test(href) && await pagina.$eval('#recebido-link', (a) => a.hidden), 'link javascript: recebido de outro app não vira link');

  ok(errosCsp.length === 0, 'a CSP não bloqueia nada do próprio app' + (errosCsp[0] ? ' (' + errosCsp[0].slice(0, 150) + ')' : ''));
  await navegador.close(); servidor.close();
  console.log('\nfalhas: ' + falhas); process.exit(falhas ? 1 : 0);
})().catch((e) => { console.log('FALHA ' + e.message.split('\n')[0]); servidor.close(); process.exit(1); });
