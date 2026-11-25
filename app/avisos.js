// Central de avisos: o que mudou nos clientes de cada pessoa (proposições novas, tramitação, prazos, tarefas, relatórios).
// Os avisos são criados pelo servidor (coleta, tramitação, função avisos). Aqui: lista com lidos e não lidos, contador no menu,
// notificações neste aparelho (Web Push no celular e no navegador; no programa do Windows, notificação do sistema enquanto
// o programa está aberto) e as preferências em Configurações > Minha conta.
(window.PanoramaModulos = window.PanoramaModulos || []).push(function (P) {
  'use strict';

  var $ = P.$, el = P.el, G = window.PanoramaRG;
  var TIPOS = { nova: 'Nova proposição', tramitacao: 'Tramitação', votacao: 'Votação', relator: 'Relator', pauta: 'Pauta', prazo: 'Prazo',
    tarefa: 'Tarefa', relatorio: 'Relatório', alerta: 'Alerta' };
  var estado = { lidos: {}, avisos: [], todos: false, ultimoVisto: null, timer: null };

  function ativo() { return Boolean(P.estado.sessao && !P.estado.demo && P.sb); }
  function quando(iso) {
    var d = new Date(iso), seg = (Date.now() - d) / 1000;
    if (seg < 3600) return 'há ' + Math.max(1, Math.round(seg / 60)) + ' min';
    if (seg < 86400) return 'há ' + Math.round(seg / 3600) + ' h';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  // ---------- dados ----------
  function carregar() {
    if (!ativo()) return Promise.resolve([]);
    var desde = new Date(Date.now() - 30 * 864e5).toISOString();
    return Promise.all([
      P.sb.from('avisos').select('id, cliente_id, user_id, tipo, titulo, texto, link, proposicao_id, criado_em').gte('criado_em', desde).order('criado_em', { ascending: false }).limit(300),
      P.sb.from('avisos_lidos').select('aviso_id').gte('lido_em', desde).limit(2000)
    ]).then(function (r) {
      if (r[0].error) throw r[0].error;
      estado.avisos = r[0].data || [];
      estado.lidos = {};
      (r[1].data || []).forEach(function (x) { estado.lidos[x.aviso_id] = true; });
      contar();
      return estado.avisos;
    });
  }
  function naoLidos() { return estado.avisos.filter(function (a) { return !estado.lidos[a.id]; }); }
  function contar() { var n = naoLidos().length; $('menu-avisos').textContent = n ? String(n > 99 ? '99+' : n) : ''; }
  function marcarLidos(lista) {
    var novos = lista.filter(function (a) { return !estado.lidos[a.id]; });
    if (!novos.length) return Promise.resolve();
    novos.forEach(function (a) { estado.lidos[a.id] = true; });
    contar();
    return P.sb.from('avisos_lidos').upsert(novos.map(function (a) { return { aviso_id: a.id }; }), { onConflict: 'user_id,aviso_id', ignoreDuplicates: true }).then(function () {});
  }

  // ---------- tela ----------
  function abrir(a) {
    marcarLidos([a]);
    if (a.cliente_id && a.cliente_id !== P.estado.cliente && (P.estado.clientes || []).some(function (c) { return c.id === a.cliente_id; })) {
      P.trocarCliente(a.cliente_id); P.renderSeletorCliente();
    }
    P.irPara(a.link || '?secao=avisos');
  }
  function render() {
    var painel = $('painel-avisos');
    if (!ativo()) { painel.replaceChildren(G.cabecalho('Avisos', 'Os avisos aparecem quando você entra com seu e-mail e senha.')); return; }
    painel.replaceChildren(el('p', { class: 'discreto', text: 'Carregando…' }));
    carregar().then(function () {
      var lista = estado.todos ? estado.avisos : estado.avisos.filter(function (a) { return !a.cliente_id || a.cliente_id === P.estado.cliente; });
      var nl = lista.filter(function (a) { return !estado.lidos[a.id]; }).length;
      painel.replaceChildren(
        G.cabecalho('Avisos', 'Proposições novas de interesse, tramitação das monitoradas, prazos e tarefas. Últimos 30 dias.', [
          G.botao('Marcar todos como lidos', function () { marcarLidos(lista).then(render); }, 'botao-linha'),
          G.botao('Notificações', function () { P.irPara('?config=1'); }, 'botao-linha')
        ]),
        el('div', { class: 'chips-filtro' }, [
          el('button', { type: 'button', 'aria-pressed': String(!estado.todos), text: 'Cliente escolhido', onclick: function () { estado.todos = false; render(); } }),
          el('button', { type: 'button', 'aria-pressed': String(estado.todos), text: 'Todos os meus clientes', onclick: function () { estado.todos = true; render(); } })
        ]),
        el('p', { class: 'discreto', text: nl ? nl + (nl === 1 ? ' não lido' : ' não lidos') : 'Tudo lido.' }),
        lista.length ? el('ul', { class: 'lista lista-avisos' }, lista.map(function (a) {
          return el('li', { class: 'item aviso' + (estado.lidos[a.id] ? ' lido' : '') }, [
            el('div', { class: 'item-topo' }, [el('span', { class: 'tema', text: TIPOS[a.tipo] || a.tipo }),
              estado.todos && a.cliente_id ? el('span', { text: P.nomeCliente(a.cliente_id) }) : null, el('span', { text: quando(a.criado_em) })]),
            el('h2', {}, [el('a', { href: a.link || '#', text: a.titulo, onclick: function (ev) { ev.preventDefault(); abrir(a); } })]),
            a.texto ? el('p', { class: 'resumo texto-aviso', text: a.texto }) : null,
            estado.lidos[a.id] ? null : el('div', { class: 'item-acoes' }, [el('button', { type: 'button', text: 'Marcar como lido', onclick: function () { marcarLidos([a]).then(render); } })])
          ]);
        })) : el('p', { class: 'vazio', text: 'Nenhum aviso nos últimos 30 dias. Eles aparecem quando a coleta acha proposições de interesse ou quando uma monitorada anda.' })
      );
    }, function (e) { painel.replaceChildren(el('p', { class: 'vazio', text: G.erroAmigavel(e) })); });
  }

  // ---------- notificações ----------
  function suportaPush() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !window.PanoramaDesktop; }
  function deB64u(t) { var s = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4)); return Uint8Array.from(s, function (c) { return c.charCodeAt(0); }); }
  function inscricaoAtual() {
    if (!suportaPush()) return Promise.resolve(null);
    return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).catch(function () { return null; });
  }
  function chamar(corpo) {
    return P.sb.functions.invoke('avisos', { body: corpo }).then(function (r) {
      if (r.error) throw new Error(/not found|404/i.test(r.error.message || '') ? 'A função avisos ainda não foi publicada no Supabase.' : r.error.message);
      if (r.data && r.data.erro) throw new Error(r.data.erro);
      return r.data;
    });
  }
  function ligarPush() {
    if (!suportaPush()) return Promise.reject(new Error(/iphone|ipad/i.test(navigator.userAgent) ? 'No iPhone, instale o app na Tela de Início (Compartilhar > Adicionar à Tela de Início) e ligue as notificações por ele.' : 'Este navegador não aceita notificações.'));
    return Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') throw new Error('As notificações foram bloqueadas. Libere nas configurações do navegador para este site.');
      return Promise.all([navigator.serviceWorker.ready, chamar({ acao: 'chave-publica' })]);
    }).then(function (r) {
      return r[0].pushManager.getSubscription().then(function (s) {
        return s || r[0].pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64u(r[1].chave) });
      });
    }).then(function (s) {
      var j = s.toJSON();
      return P.sb.from('push_inscricoes').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, aparelho: navigator.userAgent.slice(0, 200) }, { onConflict: 'endpoint' })
        .then(function (r) { if (r.error) throw r.error; });
    });
  }
  function desligarPush() {
    return inscricaoAtual().then(function (s) {
      if (!s) return;
      return P.sb.from('push_inscricoes').delete().eq('endpoint', s.endpoint).then(function () { return s.unsubscribe(); });
    });
  }

  // Enquanto o app está aberto (e sempre no programa do Windows, que não recebe Web Push), confere avisos novos a cada
  // 3 minutos e mostra a notificação do sistema, se a pessoa permitiu
  function conferirNovos() {
    if (!ativo()) return;
    carregar().then(function () {
      var maisNovo = estado.avisos[0] && estado.avisos[0].criado_em;
      var antes = estado.ultimoVisto;
      estado.ultimoVisto = maisNovo || antes || new Date().toISOString();
      if (!antes || !('Notification' in window) || Notification.permission !== 'granted') return;
      if (P.estado.perfil && P.estado.perfil.aviso_push === false) return;
      inscricaoAtual().then(function (s) {
        if (s) return; // com Web Push, o servidor já notifica este aparelho
        estado.avisos.filter(function (a) { return a.criado_em > antes && !estado.lidos[a.id]; }).slice(0, 5).forEach(function (a) {
          try {
            var n = new Notification(a.titulo, { body: (P.nomeCliente(a.cliente_id) ? P.nomeCliente(a.cliente_id) + ': ' : '') + String(a.texto || '').split('\n')[0].slice(0, 180), tag: a.id, icon: 'icones/icone-192.png' });
            n.onclick = function () { window.focus(); abrir(a); };
          } catch (e) { /* sem notificação */ }
        });
      });
      if (P.estado.aba === 'avisos') render();
    }).catch(function () {});
  }
  function iniciar() {
    clearInterval(estado.timer);
    if (!ativo()) { $('menu-avisos').textContent = ''; return; }
    conferirNovos();
    estado.timer = setInterval(conferirNovos, 3 * 60 * 1000);
  }

  // ---------- Configurações > Minha conta > Avisos ----------
  function renderPreferencias(msg, erro) {
    var caixa = $('minha-conta-avisos');
    if (!caixa) return;
    if (!ativo()) { caixa.hidden = true; return; }
    caixa.hidden = false;
    var perfil = P.estado.perfil || {};
    inscricaoAtual().then(function (s) {
      var email = el('input', { type: 'checkbox' }); email.checked = perfil.aviso_email !== false;
      var notif = el('input', { type: 'checkbox' }); notif.checked = perfil.aviso_push !== false;
      function salvar() {
        P.sb.rpc('salvar_preferencias_aviso', { email_diario: email.checked, notificacoes: notif.checked }).then(function (r) {
          if (r.error) { renderPreferencias(G.erroAmigavel(r.error), true); return; }
          perfil.aviso_email = email.checked; perfil.aviso_push = notif.checked; P.avisar('Preferências salvas');
        });
      }
      email.addEventListener('change', salvar); notif.addEventListener('change', salvar);
      var noWindows = Boolean(window.PanoramaDesktop);
      var permitido = 'Notification' in window && Notification.permission === 'granted';
      var estadoAparelho = noWindows ? (permitido ? 'O programa mostra as notificações do Windows enquanto estiver aberto.' : 'Ligue para o programa mostrar notificações do Windows enquanto estiver aberto.')
        : s ? 'Este aparelho recebe notificações, mesmo com o app fechado.' : 'Este aparelho ainda não recebe notificações.';
      caixa.replaceChildren(
        el('h2', { text: 'Avisos' }),
        el('label', { class: 'marca-linha' }, [email, el('span', { text: 'Receber o resumo do dia por e-mail, às 8h (só quando houver novidade)' })]),
        el('label', { class: 'marca-linha' }, [notif, el('span', { text: 'Receber notificações dos avisos' })]),
        el('p', { class: 'discreto', text: estadoAparelho }),
        el('div', { class: 'acoes' }, [
          noWindows ? (permitido ? null : G.botao('Ligar notificações do Windows', function () { Notification.requestPermission().then(function () { renderPreferencias(); }); }))
            : s ? G.botao('Desligar neste aparelho', function () { desligarPush().then(function () { renderPreferencias('Notificações desligadas neste aparelho.'); }); }, 'botao-linha')
            : G.botao('Ligar neste aparelho', function () { var b = this; b.disabled = true; ligarPush().then(function () { renderPreferencias('Pronto. Use "Testar" para conferir.'); }, function (e) { renderPreferencias(e.message, true); }); }),
          !noWindows && s ? G.botao('Testar', function () { chamar({ acao: 'testar' }).then(function (r) { renderPreferencias(r && r.enviados ? 'Notificação de teste enviada.' : 'Não chegou a nenhum aparelho. Desligue e ligue de novo.', !(r && r.enviados)); }, function (e) { renderPreferencias(e.message, true); }); }, 'botao-linha') : null
        ]),
        msg ? el('p', { class: 'mensagem' + (erro ? ' erro' : ''), text: msg }) : null
      );
    });
  }
  document.addEventListener('panorama-config', function () { renderPreferencias(); });

  // Clique numa notificação do sistema com o app aberto: o service worker manda a rota
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (ev) {
    if (ev.data && ev.data.tipo === 'abrir' && ev.data.link) { var u = new URL(ev.data.link, location.href); P.irPara(u.search || '?secao=avisos'); }
  });

  window.PanoramaAvisos = { iniciar: iniciar, conferir: conferirNovos };

  return {
    aoAbrirAba: function (nome) { if (nome === 'avisos') render(); if (!estado.timer && ativo()) iniciar(); },
    aoTrocarCliente: function () { if (P.estado.aba === 'avisos') render(); }
  };
});
