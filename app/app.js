// App da área do cliente. Sem build: um script só, que o service worker guarda para uso offline.
// Login e dados vêm do Supabase (config.js); sem configuração, o app roda em demonstração com dados locais.
(function () {
  'use strict';

  var cfg = window.PANORAMA_CONFIG || {};
  var configurado = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
  var sb = configurado ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;

  var $ = function (id) { return document.getElementById(id); };
  var estado = { demo: false, sessao: null, emailLogin: '', notasDemo: [] };

  // ---------- armazenamento local, que pode falhar em janela privada ----------
  function ler(chave) { try { return localStorage.getItem(chave); } catch (e) { return null; } }
  function gravar(chave, valor) { try { if (valor === null) localStorage.removeItem(chave); else localStorage.setItem(chave, valor); } catch (e) { /* segue sem guardar */ } }

  // ---------- dados de exemplo para a demonstração ----------
  var EXEMPLOS = [
    { id: 'exemplo-1', tema: 'Serviços financeiros', publicado_em: '2026-10-27T14:00:00Z',
      titulo: 'Exemplo: comissão aprova parecer sobre crédito para pequenas empresas',
      resumo: 'O texto segue para votação no plenário. Prazo de emendas termina na próxima semana.',
      conteudo: 'Este é um alerta de exemplo, para mostrar como o app apresenta um conteúdo completo.\n\nO que aconteceu: a comissão aprovou o parecer do relator.\n\nPróximos passos: votação em plenário e prazo de emendas.\n\nImpacto para o setor: a ser analisado pela equipe da Panorama.' },
    { id: 'exemplo-2', tema: 'Comércio exterior', publicado_em: '2026-10-24T11:30:00Z',
      titulo: 'Exemplo: consulta pública sobre procedimentos aduaneiros',
      resumo: 'Contribuições podem ser enviadas por 30 dias. Recomendamos posicionamento conjunto do setor.',
      conteudo: 'Este é um alerta de exemplo.\n\nA consulta pública recebe contribuições por 30 dias a partir da publicação.' },
    { id: 'exemplo-3', tema: 'Segurança pública', publicado_em: '2026-10-21T09:00:00Z',
      titulo: 'Exemplo: audiência pública discute financiamento da segurança',
      resumo: 'Audiência reúne representantes dos estados e do governo federal.',
      conteudo: 'Este é um alerta de exemplo.\n\nA audiência foi convocada para discutir fontes de financiamento.' }
  ];

  // ---------- acesso a dados ----------
  function listarAlertas() {
    if (estado.demo) return Promise.resolve(EXEMPLOS);
    return sb.from('alertas').select('id, titulo, resumo, tema, publicado_em')
      .order('publicado_em', { ascending: false }).limit(100)
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  function obterAlerta(id) {
    if (estado.demo) return Promise.resolve(EXEMPLOS.find(function (a) { return a.id === id; }) || null);
    return sb.from('alertas').select('*').eq('id', id).maybeSingle()
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  function listarNotas() {
    if (estado.demo) return Promise.resolve(estado.notasDemo);
    return sb.from('notas').select('id, titulo, texto, link, criado_em')
      .order('criado_em', { ascending: false }).limit(100)
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  function salvarNota(n) {
    if (estado.demo) { estado.notasDemo.unshift(Object.assign({ id: 'nota-' + Date.now(), criado_em: new Date().toISOString() }, n)); return Promise.resolve(); }
    return sb.from('notas').insert(n).then(function (r) { if (r.error) throw r.error; });
  }
  function apagarNota(id) {
    if (estado.demo) { estado.notasDemo = estado.notasDemo.filter(function (n) { return n.id !== id; }); return Promise.resolve(); }
    return sb.from('notas').delete().eq('id', id).then(function (r) { if (r.error) throw r.error; });
  }

  // ---------- utilidades de tela ----------
  var telas = ['tela-carregando', 'tela-login', 'tela-inicio', 'tela-alerta', 'tela-recebido'];
  function mostrar(id) {
    telas.forEach(function (t) { $(t).hidden = t !== id; });
    $('sair').hidden = !(estado.sessao || estado.demo) || id === 'tela-login';
    $('faixa-demo').hidden = !estado.demo;
    window.scrollTo(0, 0);
  }
  var toastTimer;
  function avisar(texto) {
    var t = $('toast');
    t.textContent = texto;
    t.classList.add('visivel');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('visivel'); }, 2600);
  }
  function el(tag, attrs, filhos) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (filhos || []).forEach(function (f) { if (f) e.appendChild(f); });
    return e;
  }
  var formatoData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  function data(iso) { try { return formatoData.format(new Date(iso)); } catch (e) { return ''; } }
  function linkDoAlerta(id) { return new URL('./?alerta=' + encodeURIComponent(id), location.href).href; }

  // ---------- compartilhar para outros apps (WhatsApp, e-mail etc.) ----------
  function copiar(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto).then(function () { avisar('Link copiado'); }, function () { avisar('Não foi possível copiar'); });
    }
    avisar('Copie o link: ' + texto);
    return Promise.resolve();
  }
  function compartilhar(alerta) {
    var url = linkDoAlerta(alerta.id);
    if (navigator.share) {
      return navigator.share({ title: alerta.titulo, text: alerta.titulo, url: url }).catch(function (e) {
        if (e && e.name !== 'AbortError') return copiar(url);
      });
    }
    return copiar(url);
  }

  // ---------- telas ----------
  function renderInicio(aba) {
    mostrar('tela-inicio');
    selecionarAba(aba || 'alertas');
    var lista = $('lista-alertas');
    lista.replaceChildren(el('li', { class: 'vazio', text: 'Carregando alertas…' }));
    listarAlertas().then(function (alertas) {
      if (!alertas.length) { lista.replaceChildren(el('li', { class: 'vazio', text: 'Nenhum alerta publicado ainda.' })); return; }
      lista.replaceChildren.apply(lista, alertas.map(function (a) {
        return el('li', { class: 'item' }, [
          el('div', { class: 'item-topo' }, [a.tema ? el('span', { class: 'tema', text: a.tema }) : null, el('span', { text: data(a.publicado_em) })]),
          el('h2', {}, [el('a', { href: '?alerta=' + encodeURIComponent(a.id), text: a.titulo, onclick: function (ev) { ev.preventDefault(); irPara('?alerta=' + encodeURIComponent(a.id)); } })]),
          a.resumo ? el('p', { class: 'resumo', text: a.resumo }) : null,
          el('div', { class: 'item-acoes' }, [el('button', { type: 'button', text: 'Compartilhar', onclick: function () { compartilhar(a); } })])
        ]);
      }));
    }).catch(function () { lista.replaceChildren(el('li', { class: 'vazio', text: 'Não foi possível carregar os alertas. Verifique sua conexão.' })); });
    renderRecebidos();
  }

  function renderRecebidos() {
    var lista = $('lista-recebidos');
    listarNotas().then(function (notas) {
      if (!notas.length) { lista.replaceChildren(el('li', { class: 'vazio', text: 'Nada recebido ainda. No Android, escolha Panorama no menu Compartilhar de qualquer app.' })); return; }
      lista.replaceChildren.apply(lista, notas.map(function (n) {
        return el('li', { class: 'item' }, [
          el('div', { class: 'item-topo' }, [el('span', { text: data(n.criado_em) })]),
          el('h2', { text: n.titulo || 'Sem título' }),
          n.texto ? el('p', { class: 'resumo', text: n.texto }) : null,
          n.link ? el('p', {}, [el('a', { href: n.link, target: '_blank', rel: 'noopener', text: n.link })]) : null,
          el('div', { class: 'item-acoes' }, [el('button', { type: 'button', text: 'Apagar', onclick: function () {
            apagarNota(n.id).then(function () { avisar('Apagado'); renderRecebidos(); }, function () { avisar('Não foi possível apagar'); });
          } })])
        ]);
      }));
    }).catch(function () { lista.replaceChildren(el('li', { class: 'vazio', text: 'Não foi possível carregar os itens recebidos.' })); });
  }

  function selecionarAba(nome) {
    ['alertas', 'recebidos'].forEach(function (n) {
      $('aba-' + n).setAttribute('aria-selected', String(n === nome));
      $('painel-' + n).hidden = n !== nome;
    });
  }

  function renderAlerta(id) {
    mostrar('tela-alerta');
    var art = $('alerta');
    art.replaceChildren(el('p', { class: 'discreto', text: 'Carregando…' }));
    obterAlerta(id).then(function (a) {
      if (!a) { art.replaceChildren(el('p', { text: 'Este alerta não existe ou você não tem acesso a ele.' })); return; }
      document.title = a.titulo + ' · Panorama';
      art.replaceChildren(
        el('div', { class: 'item-topo' }, [a.tema ? el('span', { class: 'tema', text: a.tema }) : null, el('span', { text: data(a.publicado_em) })]),
        el('h1', { text: a.titulo }),
        a.resumo ? el('p', { class: 'discreto', text: a.resumo }) : null,
        a.conteudo ? el('div', { class: 'corpo', text: a.conteudo }) : null,
        a.link ? el('p', {}, [el('a', { href: a.link, target: '_blank', rel: 'noopener', text: 'Abrir fonte original' })]) : null,
        el('div', { class: 'acoes' }, [
          el('button', { class: 'botao', type: 'button', text: 'Compartilhar', onclick: function () { compartilhar(a); } }),
          el('button', { class: 'botao botao-linha', type: 'button', text: 'Copiar link', onclick: function () { copiar(linkDoAlerta(a.id)); } })
        ])
      );
    }).catch(function () { art.replaceChildren(el('p', { text: 'Não foi possível carregar este alerta.' })); });
  }

  // Conteúdo que chegou pelo menu Compartilhar do sistema (Android). Fica guardado até a pessoa decidir,
  // mesmo que precise fazer login antes.
  function renderRecebido(r) {
    mostrar('tela-recebido');
    $('recebido-titulo').textContent = r.titulo || 'Conteúdo compartilhado';
    $('recebido-texto').textContent = r.texto || '';
    var a = $('recebido-link');
    a.hidden = !r.link;
    if (r.link) { a.href = r.link; a.textContent = r.link; }
  }
  function lerCompartilhado(params) {
    var titulo = params.get('titulo') || '', texto = params.get('texto') || '', link = params.get('link') || '';
    if (!titulo && !texto && !link) return null;
    // Muitos apps mandam o link dentro do texto
    if (!link) { var m = texto.match(/https?:\/\/\S+/); if (m) { link = m[0]; texto = texto.replace(m[0], '').trim(); } }
    return { titulo: titulo.slice(0, 300), texto: texto.slice(0, 5000), link: /^https?:\/\//.test(link) ? link.slice(0, 2000) : '' };
  }
  function recebidoPendente() { try { return JSON.parse(ler('panorama-recebido') || 'null'); } catch (e) { return null; } }

  // ---------- navegação ----------
  function irPara(busca) { history.pushState(null, '', './' + busca); rotear(); }
  function rotear() {
    document.title = 'Panorama';
    var params = new URLSearchParams(location.search);
    var compartilhado = lerCompartilhado(params);
    if (compartilhado) {
      gravar('panorama-recebido', JSON.stringify(compartilhado));
      history.replaceState(null, '', './');
    }
    if (!estado.sessao && !estado.demo) { renderLogin(); return; }
    var pendente = recebidoPendente();
    if (pendente) { renderRecebido(pendente); return; }
    var id = params.get('alerta');
    if (id) renderAlerta(id); else renderInicio(params.get('aba'));
  }

  // ---------- login por código enviado ao e-mail ----------
  // Código em vez de só link: no iPhone, o link do e-mail abre no Safari, que não divide o login com o app instalado.
  function renderLogin() {
    mostrar('tela-login');
    $('caixa-demo').hidden = configurado;
    $('form-email').hidden = !configurado;
    $('form-codigo').hidden = true;
    mensagem('');
  }
  function mensagem(texto, erro) { var m = $('mensagem-login'); m.textContent = texto; m.classList.toggle('erro', Boolean(erro)); }

  $('form-email').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var email = $('email').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { mensagem('Digite um e-mail válido.', true); return; }
    var botao = ev.submitter || this.querySelector('button');
    botao.disabled = true;
    mensagem('Enviando…');
    sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: false, emailRedirectTo: new URL('./', location.href).href } }).then(function (r) {
      botao.disabled = false;
      if (r.error) {
        var semCadastro = /signup|not allowed|not found/i.test(r.error.message || '');
        mensagem(semCadastro ? 'Este e-mail não tem acesso. Fale com a Panorama para liberar.' : 'Não foi possível enviar agora. Tente de novo em instantes.', true);
        return;
      }
      estado.emailLogin = email;
      $('email-enviado').textContent = email;
      $('form-email').hidden = true;
      $('form-codigo').hidden = false;
      mensagem('');
      $('codigo').focus();
    });
  });

  $('form-codigo').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var codigo = $('codigo').value.replace(/\D/g, '');
    if (codigo.length < 6) { mensagem('Digite o código que chegou no e-mail.', true); return; }
    var botao = ev.submitter || this.querySelector('button[type=submit]');
    botao.disabled = true;
    sb.auth.verifyOtp({ email: estado.emailLogin, token: codigo, type: 'email' }).then(function (r) {
      botao.disabled = false;
      if (r.error) { mensagem('Código inválido ou vencido. Peça um novo.', true); return; }
      $('codigo').value = '';
    });
  });

  $('trocar-email').addEventListener('click', function () { $('form-codigo').hidden = true; $('form-email').hidden = false; mensagem(''); });
  $('ver-demo').addEventListener('click', function () { estado.demo = true; rotear(); });
  $('sair').addEventListener('click', function () {
    if (estado.demo) { estado.demo = false; rotear(); return; }
    sb.auth.signOut();
  });

  // ---------- botões das telas ----------
  $('aba-alertas').addEventListener('click', function () { selecionarAba('alertas'); });
  $('aba-recebidos').addEventListener('click', function () { selecionarAba('recebidos'); });
  document.querySelectorAll('[data-voltar]').forEach(function (b) {
    b.addEventListener('click', function () { if (history.length > 1 && document.referrer.indexOf(location.origin) === 0) history.back(); else irPara(''); });
  });
  $('salvar-recebido').addEventListener('click', function () {
    var r = recebidoPendente(); if (!r) { irPara(''); return; }
    var b = this; b.disabled = true;
    salvarNota(r).then(function () {
      b.disabled = false; gravar('panorama-recebido', null); avisar('Salvo em Recebidos'); irPara('?aba=recebidos');
    }, function () { b.disabled = false; avisar('Não foi possível salvar. Tente de novo.'); });
  });
  $('descartar-recebido').addEventListener('click', function () { gravar('panorama-recebido', null); irPara(''); });
  window.addEventListener('popstate', rotear);

  // ---------- instalação ----------
  var pedidoInstalacao = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); pedidoInstalacao = e; $('instalar').hidden = false; });
  window.addEventListener('appinstalled', function () { $('instalar').hidden = true; pedidoInstalacao = null; });
  $('instalar').addEventListener('click', function () {
    if (!pedidoInstalacao) return;
    pedidoInstalacao.prompt();
    pedidoInstalacao.userChoice.finally(function () { pedidoInstalacao = null; $('instalar').hidden = true; });
  });
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var instalado = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (ios && !instalado && !ler('panorama-aviso-ios')) $('aviso-ios').hidden = false;
  $('fechar-aviso-ios').addEventListener('click', function () { $('aviso-ios').hidden = true; gravar('panorama-aviso-ios', '1'); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () { /* app segue sem modo offline */ }); });
  }

  // ---------- início ----------
  if (!configurado) { rotear(); return; }
  var primeiro = true;
  sb.auth.onAuthStateChange(function (evento, sessao) {
    var mudou = Boolean(sessao) !== Boolean(estado.sessao);
    estado.sessao = sessao;
    if (primeiro || mudou) { primeiro = false; rotear(); }
  });
})();
