// Peças comuns das funções de relações governamentais (formulário em janela, CSV, rótulos) e as telas de
// Configurações que não são de cadastro: perfis e permissões, e-mail e programa para Windows.
// Também publica alertas pelo app e mostra o resumo do cliente no Painel geral.
(window.PanoramaModulos = window.PanoramaModulos || []).push(function (P) {
  'use strict';

  var $ = P.$, el = P.el;

  // ---------- rótulos usados em várias telas ----------
  var R = {
    POSICOES: { apoiador: 'Apoiador', favoravel: 'Favorável', neutro: 'Neutro', contrario: 'Contrário', opositor: 'Opositor', desconhecido: 'Não mapeado' },
    INFLUENCIAS: { alta: 'Alta', media: 'Média', baixa: 'Baixa' },
    TIPOS_CONTATO: { parlamentar: 'Parlamentar', assessor: 'Assessor parlamentar', executivo: 'Poder Executivo', regulador: 'Agência reguladora',
      judiciario: 'Judiciário e órgãos de controle', entidade: 'Entidade ou associação', imprensa: 'Imprensa', empresa: 'Empresa', outro: 'Outro' },
    TIPOS_INTERACAO: { reuniao: 'Reunião', audiencia: 'Audiência pública', ligacao: 'Ligação', email: 'E-mail', evento: 'Evento', visita: 'Visita ao gabinete', nota: 'Envio de nota técnica', outro: 'Outro' },
    PRIORIDADES: { alta: 'Alta', media: 'Média', baixa: 'Baixa' },
    STATUS_TAREFA: { aberta: 'A fazer', andamento: 'Em andamento', feita: 'Feita' }
  };
  function opcoesDe(mapa) { return Object.keys(mapa).map(function (k) { return { valor: k, rotulo: mapa[k] }; }); }

  // ---------- formulário em janela: campos descritos em lista ----------
  // campo: { nome, rotulo, tipo: text|email|tel|textarea|select|date|datetime-local|number|checkbox, opcoes, obrigatorio, ajuda, largura: 'meia' }
  var atual = null;
  function formulario(cfg) {
    atual = cfg;
    $('df-titulo').textContent = cfg.titulo;
    $('df-erro').textContent = '';
    $('df-apagar').hidden = !cfg.aoApagar;
    $('df-salvar').textContent = cfg.botao || 'Salvar';
    var v = cfg.valores || {};
    $('df-campos').replaceChildren.apply($('df-campos'), cfg.campos.map(function (c) {
      var id = 'dfc-' + c.nome, entrada;
      if (c.tipo === 'textarea') entrada = el('textarea', { id: id, rows: String(c.linhas || 4) });
      else if (c.tipo === 'select') {
        entrada = el('select', { id: id }, (c.opcoes || []).map(function (o) { return el('option', { value: o.valor, text: o.rotulo }); }));
      } else entrada = el('input', { id: id, type: c.tipo || 'text', autocomplete: 'off' });
      if (c.tipo === 'checkbox') entrada.checked = Boolean(v[c.nome]);
      else if (v[c.nome] !== undefined && v[c.nome] !== null) entrada.value = c.tipo === 'datetime-local' ? String(v[c.nome]).slice(0, 16) : v[c.nome];
      if (c.placeholder) entrada.placeholder = c.placeholder;
      if (c.tipo === 'checkbox') return el('label', { class: 'marca-linha' }, [entrada, el('span', { text: c.rotulo })]);
      return el('label', { class: c.largura === 'meia' ? 'meia' : '' }, [el('span', { text: c.rotulo + (c.obrigatorio ? ' *' : '') }), entrada,
        c.ajuda ? el('small', { class: 'discreto', text: c.ajuda }) : null]);
    }));
    var d = $('dialogo-form');
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    var primeiro = $('df-campos').querySelector('input, textarea, select');
    if (primeiro) primeiro.focus();
  }
  function fecharForm() { var d = $('dialogo-form'); if (d.close) d.close(); else d.removeAttribute('open'); atual = null; }
  $('df-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!atual) return;
    var valores = {}, falta = null;
    atual.campos.forEach(function (c) {
      var e = $('dfc-' + c.nome);
      var x = c.tipo === 'checkbox' ? e.checked : e.value.trim();
      if (c.tipo === 'number') x = x === '' ? null : Number(x);
      if (c.tipo === 'datetime-local' && x) x = new Date(x).toISOString();
      if ((c.tipo === 'date' || c.tipo === 'select') && x === '') x = null;
      if (c.obrigatorio && (x === '' || x === null) && !falta) falta = c.rotulo;
      if (c.tipo === 'email' && x && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) && !falta) falta = c.rotulo + ' (e-mail inválido)';
      valores[c.nome] = x === '' ? null : x;
    });
    if (falta) { $('df-erro').textContent = 'Preencha: ' + falta + '.'; return; }
    var botao = $('df-salvar'); botao.disabled = true;
    Promise.resolve(atual.aoSalvar(valores)).then(function () { botao.disabled = false; fecharForm(); },
      function (e) { botao.disabled = false; $('df-erro').textContent = erroAmigavel(e); });
  });
  $('df-fechar').addEventListener('click', fecharForm);
  $('df-cancelar').addEventListener('click', fecharForm);
  $('df-apagar').addEventListener('click', function () {
    var b = this;
    if (!b.dataset.confirmando) { b.dataset.confirmando = '1'; b.textContent = 'Toque de novo para apagar'; setTimeout(function () { delete b.dataset.confirmando; b.textContent = 'Apagar'; }, 3500); return; }
    delete b.dataset.confirmando; b.textContent = 'Apagar';
    Promise.resolve(atual.aoApagar()).then(fecharForm, function (e) { $('df-erro').textContent = erroAmigavel(e); });
  });

  function erroAmigavel(e) {
    var m = (e && (e.message || e.erro)) || '';
    if (/duplicate|unique/i.test(m)) return 'Já existe um cadastro igual.';
    if (/relation .* does not exist|schema cache|Could not find the table/i.test(m)) return 'O banco ainda não tem esta função. Peça ao master para rodar o arquivo relgov.sql no Supabase.';
    if (/permission|policy|row-level/i.test(m)) return 'Você não tem permissão para isso.';
    return m || 'Não foi possível salvar. Verifique a conexão e tente de novo.';
  }

  // ---------- CSV (abre no Excel com acentos e separador ;) ----------
  function csv(linhas, colunas) {
    var esc = function (v) { v = v === null || v === undefined ? '' : String(v); return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return '﻿' + [colunas.map(function (c) { return esc(c.rotulo); }).join(';')].concat(linhas.map(function (l) {
      return colunas.map(function (c) { return esc(typeof c.valor === 'function' ? c.valor(l) : l[c.valor]); }).join(';');
    })).join('\r\n');
  }
  function baixarCsv(nome, linhas, colunas) { P.baixar(nome, csv(linhas, colunas), 'text/csv;charset=utf-8'); P.avisar('Planilha baixada: ' + nome); }
  // Lê CSV com ; ou , e aspas; devolve objetos pelas colunas do cabeçalho (sem acento, minúsculas)
  function lerCsv(texto) {
    texto = texto.replace(/^﻿/, '');
    var sep = (texto.split('\n')[0].match(/;/g) || []).length >= (texto.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    var linhas = [], campo = '', linha = [], aspas = false;
    for (var i = 0; i < texto.length; i++) {
      var ch = texto[i];
      if (aspas) { if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') aspas = false; else campo += ch; }
      else if (ch === '"') aspas = true;
      else if (ch === sep) { linha.push(campo); campo = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && texto[i + 1] === '\n') i++; linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
      else campo += ch;
    }
    if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
    linhas = linhas.filter(function (l) { return l.some(function (c) { return c.trim(); }); });
    if (!linhas.length) return [];
    var norm = function (t) { return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); };
    var cab = linhas[0].map(norm);
    return linhas.slice(1).map(function (l) { var o = {}; cab.forEach(function (c, k) { o[c] = (l[k] || '').trim(); }); return o; });
  }
  function escolherArquivo(aceita) {
    return new Promise(function (ok) {
      var i = el('input', { type: 'file', accept: aceita || '.csv,text/csv' });
      i.addEventListener('change', function () {
        var f = i.files && i.files[0]; if (!f) return;
        var r = new FileReader(); r.onload = function () { ok(String(r.result || '')); }; r.readAsText(f, 'utf-8');
      });
      i.click();
    });
  }

  // ---------- datas ----------
  function dataBr(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
  function dataHora(iso) {
    if (!iso) return '';
    try { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); } catch (e) { return ''; }
  }
  function hojeIso() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function normalizar(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function selo(texto, classe) { return el('span', { class: 'selo ' + (classe || ''), text: texto }); }
  function cabecalho(titulo, descricao, botoes) {
    return el('div', { class: 'cabeca-secao' }, [
      el('div', {}, [el('h2', { class: 'titulo-secao', text: titulo }), descricao ? el('p', { class: 'discreto', text: descricao }) : null]),
      botoes && botoes.length ? el('div', { class: 'botoes-secao' }, botoes) : null
    ]);
  }
  function botao(texto, acao, classe) { return el('button', { type: 'button', class: 'botao botao-pequeno ' + (classe || ''), text: texto, onclick: acao }); }
  function semCliente(painel) {
    if (P.estado.demo || P.estado.cliente) return false;
    painel.replaceChildren(el('p', { class: 'vazio', text: 'Escolha um cliente no topo para ver esta seção.' }));
    return true;
  }
  function papel() { return P.estado.demo ? 'master' : P.papel(P.estado.perfil); }
  function gere() { var p = papel(); return p === 'master' || p === 'coordenador'; }
  function podeEnviar() { return gere() || Boolean(P.estado.perfil && P.estado.perfil.pode_enviar_email); }

  // Proposições monitoradas do cliente (para ligar reuniões, tarefas e agenda)
  function monitoradas() {
    if (P.estado.demo) {
      try { return Promise.resolve((JSON.parse(P.ler('panorama-demo-proposicoes-v1') || '{}').proposicoes) || []); } catch (e) { return Promise.resolve([]); }
    }
    return P.tabela('proposicoes').listar({ campos: 'id, casa, sigla, numero, ano, ementa, prioridade, posicionamento, situacao, proximo_passo, especialidade_id, id_externo' });
  }
  function identProp(p) { return String(p.sigla || '').toUpperCase() + ' ' + p.numero + '/' + p.ano; }

  // Consulta às APIs das Casas. Um 504 ou uma cópia em cache sem cabeçalho CORS aparece como falha de rede:
  // tenta de novo pedindo o mesmo dado por outro endereço equivalente (muda a chave do cache da Câmara).
  function jsonCasas(url, tentativa) {
    tentativa = tentativa || 0;
    var alvo = url;
    if (tentativa === 1 && url.indexOf('camara.leg.br') >= 0) alvo = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'formato=json';
    if (tentativa === 2 && url.indexOf('camara.leg.br') >= 0 && url.indexOf('?') < 0) alvo = url + '/';
    return fetch(alvo, { headers: { Accept: 'application/json' } }).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); })
      .catch(function (e) {
        if (tentativa >= 2) throw e;
        return new Promise(function (ok) { setTimeout(ok, 800); }).then(function () { return jsonCasas(url, tentativa + 1); });
      });
  }

  window.PanoramaRG = {
    jsonCasas: jsonCasas,
    R: R, opcoesDe: opcoesDe, formulario: formulario, erroAmigavel: erroAmigavel, csv: csv, baixarCsv: baixarCsv, lerCsv: lerCsv,
    escolherArquivo: escolherArquivo, dataBr: dataBr, dataHora: dataHora, hojeIso: hojeIso, normalizar: normalizar, selo: selo,
    cabecalho: cabecalho, botao: botao, semCliente: semCliente, papel: papel, gere: gere, podeEnviar: podeEnviar,
    monitoradas: monitoradas, identProp: identProp
  };

  // ---------- alertas publicados pelo app ----------
  $('novo-alerta').addEventListener('click', function () {
    formulario({
      titulo: 'Publicar alerta para ' + (P.nomeCliente(P.estado.cliente) || 'o cliente'),
      campos: [
        { nome: 'titulo', rotulo: 'Título', obrigatorio: true },
        { nome: 'tema', rotulo: 'Tema', placeholder: 'Ex.: Tributário', largura: 'meia' },
        { nome: 'link', rotulo: 'Link da fonte', tipo: 'url', placeholder: 'https://', largura: 'meia' },
        { nome: 'resumo', rotulo: 'Resumo', tipo: 'textarea', linhas: 2 },
        { nome: 'conteudo', rotulo: 'Análise completa', tipo: 'textarea', linhas: 8 }
      ],
      botao: 'Publicar',
      aoSalvar: function (v) {
        if (v.link && !/^https?:\/\//.test(v.link)) throw new Error('O link precisa começar com https://');
        return P.sb.from('alertas').insert(Object.assign({ cliente_id: P.estado.cliente }, v)).then(function (r) {
          if (r.error) throw r.error; P.avisar('Alerta publicado'); P.renderAlertas();
        });
      }
    });
  });

  // ---------- resumo do cliente no Painel geral ----------
  function renderResumo() {
    var caixa = $('resumo-cliente');
    if (!P.estado.demo && !P.estado.cliente) { caixa.replaceChildren(); return; }
    var hoje = hojeIso(), daqui7 = new Date(Date.now() + 7 * 864e5).toISOString();
    Promise.all([
      P.tabela('tarefas').listar().catch(function () { return null; }),
      P.tabela('interacoes').listar({ ordem: 'quando', desc: true, limite: 200 }).catch(function () { return null; }),
      monitoradas().catch(function () { return []; }),
      P.tabela('mapa_parlamentares').listar().catch(function () { return null; })
    ]).then(function (r) {
      var tarefas = r[0], inter = r[1], props = r[2], mapa = r[3];
      if (tarefas === null && inter === null) { caixa.replaceChildren(); return; }
      var abertas = (tarefas || []).filter(function (t) { return t.status !== 'feita'; });
      var vencidas = abertas.filter(function (t) { return t.prazo && t.prazo < hoje; }).length;
      var semana = abertas.filter(function (t) { return t.prazo && t.prazo >= hoje && t.prazo <= daqui7.slice(0, 10); }).length;
      var proximas = (inter || []).filter(function (i) { return i.quando >= new Date().toISOString() && i.quando <= daqui7; }).length;
      var aliados = (mapa || []).filter(function (m) { return m.posicao === 'apoiador' || m.posicao === 'favoravel'; }).length;
      $('menu-tarefas').textContent = vencidas + semana ? String(vencidas + semana) : '';
      function cartao(n, rotulo, secao, alerta) {
        return el('button', { type: 'button', class: 'cartao-resumo' + (alerta && n ? ' alerta' : ''), onclick: function () { P.irPara('?secao=' + secao); } },
          [el('b', { text: String(n) }), el('span', { text: rotulo })]);
      }
      caixa.replaceChildren(el('div', { class: 'grade-resumo' }, [
        cartao(props.length, props.length === 1 ? 'proposição monitorada' : 'proposições monitoradas', 'monitoradas'),
        cartao(vencidas, vencidas === 1 ? 'tarefa atrasada' : 'tarefas atrasadas', 'tarefas', true),
        cartao(semana, 'prazos nos próximos 7 dias', 'tarefas'),
        cartao(proximas, proximas === 1 ? 'reunião agendada na semana' : 'reuniões agendadas na semana', 'interacoes'),
        cartao(aliados, aliados === 1 ? 'parlamentar favorável mapeado' : 'parlamentares favoráveis mapeados', 'mapa')
      ]));
    });
  }

  // ---------- Configurações: perfis e permissões ----------
  var FUNCOES = [
    ['Painel geral, agenda e parlamentares (dados públicos das Casas)', 1, 1, 1],
    ['Proposições, palavras-chave e especialidades dos seus clientes', 1, 1, 1],
    ['Contatos, reuniões, tarefas e mapa de stakeholders', 1, 1, 1],
    ['Listas de e-mail e rascunhos de campanhas', 1, 1, 1],
    ['Enviar e-mails em massa', 1, 1, 'se liberado'],
    ['Publicar alertas para o cliente', 1, 1, 0],
    ['Ver todos os clientes da organização', 1, 1, 0],
    ['Criar clientes e cadastrar atendimentos', 1, 1, 0],
    ['Liberar clientes e envio de e-mail para atendimentos', 1, 1, 0],
    ['Criar organizações e definir coordenadores e master', 1, 0, 0]
  ];
  function renderPerfis() {
    var caixa = $('painel-perfis');
    var marca = function (v) { return el('td', { class: 'centro', text: v === 1 ? '✓' : v === 0 ? '—' : v }); };
    var tabela = el('table', { class: 'tabela-tipos tabela-perfis' }, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'O que cada nível pode fazer' }), el('th', { text: 'Master' }), el('th', { text: 'Coordenador' }), el('th', { text: 'Atendimento' })])]),
      el('tbody', {}, FUNCOES.map(function (f) { return el('tr', {}, [el('td', { text: f[0] }), marca(f[1]), marca(f[2]), marca(f[3])]); }))
    ]);
    var partes = [el('section', { class: 'bloco' }, [el('h2', { text: 'Níveis de acesso' }),
      el('p', { class: 'discreto', text: 'Master é o dono do app. Cada organização tem coordenadores, que veem todos os clientes dela, e atendimentos, que veem só os clientes liberados. Os clientes não entram no app.' }),
      el('div', { class: 'rolagem-tabela' }, [tabela])])];
    if (gere() && !P.estado.demo) {
      var lista = el('ul', { class: 'lista-simples' }, [el('li', { class: 'vazio', text: 'Carregando…' })]);
      partes.push(el('section', { class: 'bloco' }, [el('h2', { text: 'Quem pode enviar e-mails em massa' }),
        el('p', { class: 'discreto', text: 'Master e coordenadores sempre podem. Marque os atendimentos que também podem enviar.' }), lista]));
      P.sb.from('perfis').select('user_id, email, nome, papel, pode_enviar_email').order('email').then(function (r) {
        if (r.error) { lista.replaceChildren(el('li', { class: 'vazio', text: erroAmigavel(r.error) })); return; }
        var atend = (r.data || []).filter(function (p) { return p.papel === 'atendimento'; });
        if (!atend.length) { lista.replaceChildren(el('li', { class: 'vazio', text: 'Nenhum atendimento cadastrado ainda.' })); return; }
        lista.replaceChildren.apply(lista, atend.map(function (p) {
          var caixaMarca = el('input', { type: 'checkbox' }); caixaMarca.checked = Boolean(p.pode_enviar_email);
          caixaMarca.addEventListener('change', function () {
            P.sb.rpc('definir_envio_email', { pessoa: p.user_id, valor: caixaMarca.checked }).then(function (x) {
              if (x.error) { caixaMarca.checked = !caixaMarca.checked; P.avisar(erroAmigavel(x.error)); } else P.avisar('Permissão salva');
            });
          });
          return el('li', {}, [el('label', { class: 'marca-linha' }, [caixaMarca, el('span', { text: (p.nome ? p.nome + ' · ' : '') + p.email })])]);
        }));
      });
    }
    caixa.replaceChildren.apply(caixa, partes);
  }

  // ---------- Configurações: e-mail ----------
  function renderEmailCfg() {
    $('painel-emailcfg').replaceChildren(el('section', { class: 'bloco' }, [
      el('h2', { text: 'Serviço de envio' }),
      el('p', { text: 'Os e-mails em massa saem pelo Resend (resend.com), com o seu domínio. Para ligar:' }),
      el('ol', { class: 'passos' }, [
        el('li', { text: 'Crie a conta no Resend e verifique o domínio panoramaip.com.br (o Resend mostra os registros DNS para copiar).' }),
        el('li', { text: 'No Resend, crie uma API Key com permissão de envio.' }),
        el('li', { text: 'No Supabase, em Edge Functions > Secrets, crie RESEND_API_KEY com a chave e EMAIL_REMETENTE com o endereço que vai enviar (ex.: contato@panoramaip.com.br).' }),
        el('li', { text: 'Em Comunicação > Envio de e-mails, use "Enviar teste para mim" antes do primeiro envio.' })
      ]),
      el('p', { class: 'discreto', text: 'Todo e-mail leva um link para a pessoa deixar de receber (exigência da LGPD e dos provedores). Quem se descadastra sai automaticamente dos próximos envios daquele cliente.' })
    ]));
  }

  // ---------- Configurações: programa para Windows ----------
  function renderPrograma() {
    var noPrograma = Boolean(window.PanoramaDesktop);
    $('painel-programa').replaceChildren(el('section', { class: 'bloco' }, [
      el('h2', { text: 'Panorama RelGov para Windows' }),
      el('p', { text: noPrograma ? 'Você está usando o programa instalado. Ele abre esta mesma versão do app e recebe as novidades sozinho.' :
        'O app também existe como programa instalável no Windows, com menu próprio, atalho na área de trabalho e janela separada do navegador.' }),
      noPrograma ? null : el('p', {}, [el('a', { class: 'botao botao-pequeno', href: 'https://github.com/panoramainteligenciapolitica-droid/panorama-site/releases/latest', target: '_blank', rel: 'noopener', text: 'Baixar o instalador' })]),
      el('p', { class: 'discreto', text: 'No primeiro uso, o Windows pode mostrar "O Windows protegeu o computador", porque o instalador ainda não tem assinatura digital: clique em "Mais informações" e depois em "Executar assim mesmo".' })
    ]));
  }

  document.addEventListener('panorama-config', function () {
    $('temas-config').querySelector('[data-tema="emailcfg"]').hidden = !gere();
    renderPerfis(); renderEmailCfg(); renderPrograma();
  });

  return {
    aoAbrirAba: function (nome) {
      if (nome === 'geral') renderResumo();
      if (nome === 'alertas') $('novo-alerta').hidden = P.estado.demo || !gere() || !P.estado.cliente;
    },
    aoTrocarCliente: function () { if (P.estado.aba === 'geral') renderResumo(); }
  };
});
