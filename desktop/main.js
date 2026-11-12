// Panorama RelGov para Windows: abre o app publicado em panoramaip.com.br/app numa janela própria,
// com menu nativo por seções. Assim o programa instalado recebe as novidades do site sem reinstalar.
// Sem internet, usa a cópia do app que vem dentro do instalador (pasta app-local).
'use strict';

const { app, BrowserWindow, Menu, shell, protocol, net, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const ENDERECO = process.env.PANORAMA_URL || 'https://panoramaip.com.br/app/';
const ORIGEM = new URL(ENDERECO).origin;
const LOCAL = 'panorama://app/';

protocol.registerSchemesAsPrivileged([
  { scheme: 'panorama', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, allowServiceWorkers: false } }
]);

let janela = null;
let usandoLocal = false;

// Uma janela só: abrir o atalho de novo traz a janela que já está aberta
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!janela) return;
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  });
}

// ---------- tamanho e posição da janela, guardados entre uma abertura e outra ----------
const arquivoJanela = () => path.join(app.getPath('userData'), 'janela.json');
function lerJanela() {
  try { return JSON.parse(fs.readFileSync(arquivoJanela(), 'utf8')); } catch (e) { return { width: 1360, height: 860 }; }
}
function guardarJanela() {
  if (!janela || janela.isDestroyed()) return;
  const b = janela.getNormalBounds();
  try { fs.writeFileSync(arquivoJanela(), JSON.stringify(Object.assign(b, { max: janela.isMaximized() }))); } catch (e) { /* segue */ }
}

// ---------- navegação pelo menu: o app web entende ?secao=... ----------
function ir(rota) {
  if (!janela) return;
  const codigo = 'window.PanoramaIr ? (window.PanoramaIr(' + JSON.stringify(rota) + '), true) : false';
  janela.webContents.executeJavaScript(codigo).then((ok) => {
    if (!ok) janela.loadURL((usandoLocal ? LOCAL : ENDERECO) + rota);
  }).catch(() => {});
}

function montarMenu() {
  const item = (label, rota, accelerator) => ({ label, accelerator, click: () => ir(rota) });
  const modelo = [
    { label: '&Arquivo', submenu: [
      item('Painel geral', '?secao=geral', 'Ctrl+1'),
      { type: 'separator' },
      { label: 'Imprimir', accelerator: 'Ctrl+P', click: () => janela && janela.webContents.print() },
      { type: 'separator' },
      { role: 'quit', label: 'Sair' }
    ] },
    { label: '&Legislativo', submenu: [
      item('Proposições monitoradas', '?secao=monitoradas', 'Ctrl+2'),
      item('Novas proposições', '?secao=novas'),
      item('Palavras-chave e especialidades', '?secao=filtros'),
      { type: 'separator' },
      item('Agenda do Congresso', '?secao=agenda', 'Ctrl+3')
    ] },
    { label: '&Parlamentares', submenu: [
      item('Deputados', '?secao=deputados', 'Ctrl+4'),
      item('Senadores', '?secao=senadores'),
      item('Mapa de stakeholders', '?secao=mapa')
    ] },
    { label: '&Relacionamento', submenu: [
      item('Contatos', '?secao=contatos', 'Ctrl+5'),
      item('Reuniões e interações', '?secao=interacoes'),
      item('Tarefas e prazos', '?secao=tarefas')
    ] },
    { label: '&Comunicação', submenu: [
      item('Alertas', '?secao=alertas'),
      item('Envio de e-mails', '?secao=emails', 'Ctrl+6'),
      item('Listas de e-mail', '?secao=listas'),
      item('Recebidos', '?secao=recebidos')
    ] },
    { label: 'R&elatórios', submenu: [item('Relatório do cliente', '?secao=relatorio', 'Ctrl+7')] },
    { label: '&Exibir', submenu: [
      { role: 'reload', label: 'Recarregar' },
      { role: 'forceReload', label: 'Recarregar sem cache' },
      { type: 'separator' },
      { role: 'resetZoom', label: 'Tamanho normal' },
      { role: 'zoomIn', label: 'Aumentar' },
      { role: 'zoomOut', label: 'Diminuir' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Tela cheia' },
      { role: 'toggleDevTools', label: 'Ferramentas de desenvolvedor' }
    ] },
    { label: 'Aj&uda', submenu: [
      item('Configurações', '?config=1', 'Ctrl+,'),
      { label: 'Abrir no navegador', click: () => shell.openExternal(ENDERECO) },
      { label: 'Site da Panorama', click: () => shell.openExternal('https://panoramaip.com.br/') },
      { type: 'separator' },
      { label: 'Sobre', click: () => dialog.showMessageBox(janela, {
        type: 'info', title: 'Panorama RelGov',
        message: 'Panorama RelGov ' + app.getVersion(),
        detail: 'Panorama Inteligência Política\n' + (usandoLocal ? 'Rodando a cópia local (sem conexão com o site).' : 'Conectado a ' + ENDERECO)
      }) }
    ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(modelo));
}

// ---------- cópia local do app (sem internet) ----------
function servirLocal() {
  const raiz = path.join(__dirname, 'app-local');
  protocol.handle('panorama', (req) => {
    const url = new URL(req.url);
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!rel || rel.endsWith('/')) rel += 'index.html';
    const alvo = path.normalize(path.join(raiz, rel));
    if (!alvo.startsWith(raiz)) return new Response('Proibido', { status: 403 });
    return net.fetch(pathToFileURL(alvo).toString());
  });
}

function criarJanela() {
  const salvo = lerJanela();
  janela = new BrowserWindow({
    width: salvo.width || 1360, height: salvo.height || 860, x: salvo.x, y: salvo.y,
    minWidth: 900, minHeight: 600,
    title: 'Panorama RelGov',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16233f' : '#ffffff',
    icon: path.join(__dirname, 'build', 'icone.png'),
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: true }
  });
  janela.webContents.session.setSpellCheckerLanguages(['pt-BR']);
  if (salvo.max) janela.maximize();
  janela.once('ready-to-show', () => janela.show());
  ['resize', 'move', 'close'].forEach((ev) => janela.on(ev, guardarJanela));
  janela.on('closed', () => { janela = null; });

  // Links para fora do app abrem no navegador padrão do Windows
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  janela.webContents.on('will-navigate', (ev, url) => {
    const destino = new URL(url);
    const doApp = (destino.origin === ORIGEM && destino.pathname.startsWith('/app/')) || destino.protocol === 'panorama:';
    if (!doApp) { ev.preventDefault(); shell.openExternal(url); }
  });

  // Sem conexão com o site: abre a cópia local do app
  janela.webContents.on('did-fail-load', (ev, codigo, descricao, url, principal) => {
    if (!principal || usandoLocal || codigo === -3) return;
    usandoLocal = true;
    janela.loadURL(LOCAL);
  });

  janela.loadURL(ENDERECO);
}

app.whenReady().then(() => {
  app.setAppUserModelId('br.com.panoramaip.relgov');
  servirLocal();
  montarMenu();
  criarJanela();
});
app.on('window-all-closed', () => app.quit());
