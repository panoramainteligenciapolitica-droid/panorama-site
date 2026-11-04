// Aba Geral: quantas proposições deram entrada na Câmara e no Senado, por tipo, num período.
// Os números vêm da tabela "entradas", que a coleta diária preenche com tudo o que foi apresentado.
// Na demonstração, os números são de exemplo, gerados sempre iguais para cada dia.
(window.PanoramaModulos = window.PanoramaModulos || []).push(function (P) {
  'use strict';

  var $ = P.$, el = P.el;
  var TIPOS = {
    PL: 'Projeto de Lei', PLP: 'Projeto de Lei Complementar', PEC: 'Proposta de Emenda à Constituição',
    MPV: 'Medida Provisória', PDL: 'Projeto de Decreto Legislativo', PLN: 'Projeto de Lei do Congresso',
    PRC: 'Projeto de Resolução da Câmara', PRS: 'Projeto de Resolução do Senado',
    REQ: 'Requerimento', RQS: 'Requerimento do Senado', RIC: 'Requerimento de Informação', RCP: 'Requerimento de CPI',
    INC: 'Indicação', INS: 'Indicação', EMC: 'Emenda em comissão', EMP: 'Emenda de Plenário', EMS: 'Emenda no Senado',
    PFC: 'Proposta de Fiscalização e Controle', SUG: 'Sugestão', MSC: 'Mensagem', SBT: 'Substitutivo',
    PRL: 'Parecer de relator', PAR: 'Parecer', REL: 'Relatório', OF: 'Ofício', DCR: 'Denúncia por crime de responsabilidade'
  };
  var VISIVEIS = 10;
  // Cor fixa por tipo (não muda com o período nem com o filtro); os demais tipos ficam em cinza
  var CORES = { PL: '#2a78d6', REQ: '#eb6834', RQS: '#1baf7a', RIC: '#eda100', INC: '#e87ba4', PDL: '#008300', EMC: '#6250d6', PLP: '#e34948' };
  var CINZA = '#b4bccb';
  function cor(sigla) { return CORES[sigla] || CINZA; }
  var filtro = { periodo: '7', casa: '', inicio: '', fim: '', todos: false };
  var pedido = 0, atual = null;

  // ---------- datas (no fuso do aparelho) ----------
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function deIso(t) { var p = t.split('-'); return new Date(+p[0], p[1] - 1, +p[2]); }
  function somar(d, dias) { var n = new Date(d); n.setDate(n.getDate() + dias); return n; }
  function curta(t) { var p = t.split('-'); return p[2] + '/' + p[1]; }
  function longa(t) { var p = t.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function hoje() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  function intervalo(ultimoDia) {
    var h = hoje(), fim = iso(h);
    switch (filtro.periodo) {
      case 'dia': return { inicio: ultimoDia || fim, fim: ultimoDia || fim };
      case '7': return { inicio: iso(somar(h, -6)), fim: fim };
      case '15': return { inicio: iso(somar(h, -14)), fim: fim };
      case 'semana': return { inicio: iso(somar(h, -((h.getDay() + 6) % 7))), fim: fim };
      case 'mes': return { inicio: iso(new Date(h.getFullYear(), h.getMonth(), 1)), fim: fim };
      default:
        var a = filtro.inicio || iso(somar(h, -6)), b = filtro.fim || fim;
        return a <= b ? { inicio: a, fim: b } : { inicio: b, fim: a };
    }
  }

  function descrever(r) {
    if (r.inicio === r.fim) return 'em ' + longa(r.inicio);
    var mesmoAno = r.inicio.slice(0, 4) === r.fim.slice(0, 4);
    return 'de ' + (mesmoAno ? curta(r.inicio) : longa(r.inicio)) + ' a ' + longa(r.fim);
  }

  // ---------- exemplos da demonstração ----------
  // Média por dia útil de cada tipo; fim de semana tem bem menos.
  var MEDIAS = {
    CD: { REQ: 110, PL: 42, RIC: 22, INC: 14, EMC: 9, PDL: 6, PLP: 3, PRC: 1, PEC: .5, MPV: .3 },
    SF: { RQS: 24, PL: 12, PDL: 2, PLP: 1, PRS: .5, PEC: .4, EMS: 6 }
  };
  function sorteio(texto) {
    var h = 2166136261;
    for (var i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 10000) / 10000;
  }
  function quantidade(dia, casa, sigla) {
    var semana = deIso(dia).getDay(), fator = semana === 0 ? .04 : semana === 6 ? .08 : semana === 1 || semana === 5 ? .7 : 1;
    var media = (MEDIAS[casa][sigla] || 0) * fator, r = sorteio(casa + sigla + dia);
    return media < 1 ? (r < media ? 1 : 0) : Math.round(media * (.6 + .8 * r));
  }
  function exemploDoDia(dia) {
    var linhas = [];
    Object.keys(MEDIAS).forEach(function (casa) {
      Object.keys(MEDIAS[casa]).forEach(function (sigla) {
        var n = quantidade(dia, casa, sigla);
        if (n) linhas.push({ casa: casa, sigla: sigla, total: n });
      });
    });
    return linhas;
  }
  var ultimoExemplo = function () { return iso(somar(hoje(), -1)); };

  // Ementas de exemplo (fictícias), montadas a partir de modelos por tipo e de assuntos variados
  var ASSUNTOS = ['a segurança nas escolas públicas', 'o crédito consignado de aposentados', 'as tarifas portuárias', 'a proteção de dados de consumidores',
    'o saneamento básico em municípios pequenos', 'a energia solar em residências', 'o transporte por aplicativo', 'o atendimento de urgência no SUS',
    'a educação em tempo integral', 'as apostas esportivas on-line', 'o combate a incêndios florestais', 'a acessibilidade em prédios públicos',
    'a agricultura familiar', 'as fintechs de crédito', 'a mediação digital nos tribunais', 'o despacho aduaneiro de exportação'];
  var MODELOS = {
    PL: 'Dispõe sobre {a} e dá outras providências.', PLP: 'Altera normas gerais de direito financeiro para tratar d{a}.',
    PEC: 'Altera a Constituição Federal para dispor sobre {a}.', MPV: 'Institui medidas emergenciais sobre {a}.',
    PDL: 'Susta os efeitos de ato do Poder Executivo que regulamenta {a}.', PRC: 'Cria frente parlamentar para acompanhar {a}.',
    PRS: 'Institui comissão temporária para acompanhar {a}.', REQ: 'Requer a realização de audiência pública para debater {a}.',
    RQS: 'Requer audiência pública na comissão para debater {a}.', RIC: 'Requer informações ao ministério competente sobre {a}.',
    INC: 'Sugere ao Poder Executivo medidas sobre {a}.', EMC: 'Emenda ao projeto que trata d{a}, para ajustar prazos.', EMS: 'Emenda ao projeto que trata d{a}, para ajustar prazos.'
  };
  var BASE_NUMERO = { PL: 5200, PLP: 180, PEC: 40, MPV: 1310, PDL: 600, PRC: 90, PRS: 60, REQ: 3900, RQS: 800, RIC: 4100, INC: 2500, EMC: 300, EMS: 200 };
  function itensExemplo(casa, siglas, r) {
    var itens = [], limite = ultimoExemplo();
    for (var d = deIso(r.fim > limite ? limite : r.fim); iso(d) >= r.inicio; d = somar(d, -1)) {
      var dia = iso(d), ordemDia = Math.round((d - new Date(2026, 0, 1)) / 864e5);
      (casa ? [casa] : ['CD', 'SF']).forEach(function (cs) {
        siglas.forEach(function (sg) {
          var n = MEDIAS[cs][sg] !== undefined ? quantidade(dia, cs, sg) : 0;
          var porDia = Math.max(1, Math.ceil(MEDIAS[cs][sg] || 1));
          for (var i = 0; i < n; i++) {
            var assunto = ASSUNTOS[Math.floor(sorteio(cs + sg + dia + i) * ASSUNTOS.length)];
            var modelo = MODELOS[sg] || 'Trata d{a}.';
            var texto = modelo.replace('d{a}', 'd' + assunto).replace('{a}', assunto);
            itens.push({ id_externo: cs + ':ex-' + sg + '-' + dia + '-' + i, casa: cs, sigla: sg, numero: String((BASE_NUMERO[sg] || 100) + ordemDia * porDia + i), ano: dia.slice(0, 4),
              data_apresentacao: dia, ementa: texto, autor: '', url: '', exemplo: true });
          }
        });
      });
    }
    return itens;
  }

  var fonte = {
    ultimoDia: function () {
      if (P.estado.demo) return Promise.resolve(ultimoExemplo());
      return P.sb.from('entradas').select('data_apresentacao').order('data_apresentacao', { ascending: false }).limit(1)
        .then(function (r) { if (r.error) throw r.error; return r.data && r.data[0] ? r.data[0].data_apresentacao : ''; });
    },
    listar: function (casa, siglas, r, de, quantos) {
      if (P.estado.demo) {
        var todos = itensExemplo(casa, siglas, r);
        return Promise.resolve({ itens: todos.slice(de, de + quantos), total: todos.length });
      }
      var q = P.sb.from('entradas').select('id_externo, casa, sigla, numero, ano, ementa, autor, url, url_inteiro_teor, data_apresentacao', { count: 'exact' })
        .in('sigla', siglas).gte('data_apresentacao', r.inicio).lte('data_apresentacao', r.fim);
      if (casa) q = q.eq('casa', casa);
      return q.order('data_apresentacao', { ascending: false }).order('id_externo', { ascending: false }).range(de, de + quantos - 1)
        .then(function (res) { if (res.error) throw res.error; return { itens: res.data || [], total: res.count || 0 }; });
    },
    contar: function (r) {
      if (P.estado.demo) {
        var linhas = [], limite = ultimoExemplo();
        for (var d = deIso(r.inicio); iso(d) <= r.fim && iso(d) <= limite; d = somar(d, 1)) linhas = linhas.concat(exemploDoDia(iso(d)));
        return Promise.resolve(linhas);
      }
      return P.sb.rpc('contar_entradas', { inicio: r.inicio, fim: r.fim })
        .then(function (res) { if (res.error) throw res.error; return res.data || []; });
    }
  };

  // ---------- tela ----------
  function agrupar(linhas) {
    var porTipo = {};
    linhas.forEach(function (l) {
      if (filtro.casa && l.casa !== filtro.casa) return;
      var t = porTipo[l.sigla] || (porTipo[l.sigla] = { sigla: l.sigla, CD: 0, SF: 0, total: 0 });
      t[l.casa] += Number(l.total) || 0;
      t.total += Number(l.total) || 0;
    });
    return Object.keys(porTipo).map(function (k) { return porTipo[k]; })
      .sort(function (a, b) { return b.total - a.total || a.sigla.localeCompare(b.sigla); });
  }

  function numero(n) { return n.toLocaleString('pt-BR'); }

  function renderTabela(tipos) {
    var tabela = $('tabela-geral'), ambas = !filtro.casa;
    var mostrar = filtro.todos || tipos.length <= VISIVEIS + 1 ? tipos : tipos.slice(0, VISIVEIS);
    var resto = tipos.slice(mostrar.length);
    var cabeca = el('tr', {}, [el('th', { scope: 'col', text: 'Tipo' })].concat(
      ambas ? [el('th', { scope: 'col', class: 'num', text: 'Câmara' }), el('th', { scope: 'col', class: 'num', text: 'Senado' })] : [],
      [el('th', { scope: 'col', class: 'num', text: ambas ? 'Total' : 'Quantidade' })]));
    // Tocar no tipo abre a lista de todas daquele tipo; tocar no número de uma Casa abre só as daquela Casa
    function abrir(siglas, casa) {
      P.irPara('?entradas=' + encodeURIComponent(siglas.join(',')) + (casa ? '&casa=' + casa : '') + '&de=' + atual.inicio + '&ate=' + atual.fim);
    }
    function numeroCasa(t, casa, siglas) {
      if (!t[casa]) return el('td', { class: 'num zero', text: '0' });
      return el('td', { class: 'num' }, [el('button', { type: 'button', class: 'abre-num', text: numero(t[casa]),
        'aria-label': numero(t[casa]) + ' ' + t.sigla + ' na ' + (casa === 'CD' ? 'Câmara' : 'Senado') + ', ver a lista',
        onclick: function () { abrir(siglas, casa); } })]);
    }
    function linha(t, nome, classe, siglas) {
      return el('tr', { class: classe || '' }, [
        el('th', { scope: 'row' }, [el('button', { type: 'button', class: 'abre-tipo', onclick: function () { abrir(siglas, filtro.casa); } },
          [el('span', { class: 'sigla-tipo' }, [el('span', { class: 'amostra', 'aria-hidden': 'true', style: 'background:' + (siglas.length > 1 ? CINZA : cor(t.sigla)) }), document.createTextNode(t.sigla)]), el('span', { class: 'nome-tipo', text: nome })])])
      ].concat(
        ambas ? [numeroCasa(t, 'CD', siglas), numeroCasa(t, 'SF', siglas)] : [],
        [el('td', { class: 'num total', text: numero(t.total) })]));
    }
    renderBarra(tipos);
    var corpo = mostrar.map(function (t) { return linha(t, TIPOS[t.sigla] || '', '', [t.sigla]); });
    if (resto.length) {
      var outros = resto.reduce(function (a, t) { a.CD += t.CD; a.SF += t.SF; a.total += t.total; return a; }, { sigla: 'Outros', CD: 0, SF: 0, total: 0 });
      corpo.push(linha(outros, resto.map(function (t) { return t.sigla; }).join(', '), 'outros', resto.map(function (t) { return t.sigla; })));
    }
    tabela.replaceChildren(el('caption', { class: 'so-leitor', text: 'Proposições apresentadas por tipo' }),
      el('thead', {}, [cabeca]), el('tbody', {}, corpo));
    tabela.hidden = !tipos.length;
    var botao = $('todos-tipos');
    botao.hidden = tipos.length <= VISIVEIS + 1;
    botao.textContent = filtro.todos ? 'Mostrar só os principais tipos' : 'Mostrar todos os ' + tipos.length + ' tipos';
  }

  // Uma barra só com todos os tipos, para comparar a parte de cada um no total
  function renderBarra(tipos) {
    var barra = $('barra-geral'), total = tipos.reduce(function (s, t) { return s + t.total; }, 0);
    barra.hidden = !total;
    if (!total) return barra.replaceChildren();
    var coloridos = tipos.filter(function (t) { return CORES[t.sigla]; });
    var cinzas = tipos.filter(function (t) { return !CORES[t.sigla]; });
    var partes = coloridos.map(function (t) { return { rotulo: t.sigla + (TIPOS[t.sigla] ? ' · ' + TIPOS[t.sigla] : ''), total: t.total, cor: cor(t.sigla), siglas: [t.sigla] }; });
    if (cinzas.length) partes.push({ rotulo: 'Outros tipos (' + cinzas.map(function (t) { return t.sigla; }).join(', ') + ')', cor: CINZA,
      total: cinzas.reduce(function (s, t) { return s + t.total; }, 0), siglas: cinzas.map(function (t) { return t.sigla; }) });
    var dica = $('dica-barra');
    barra.replaceChildren.apply(barra, partes.map(function (pt) {
      var pct = pt.total / total * 100, texto = pt.rotulo + ': ' + numero(pt.total) + ' (' + pct.toLocaleString('pt-BR', { maximumFractionDigits: pct < 10 ? 1 : 0 }) + '%)';
      var seg = el('button', { type: 'button', class: 'segmento', style: 'flex-grow:' + pt.total + ';background:' + pt.cor, 'aria-label': texto + ', ver a lista',
        onclick: function () { P.irPara('?entradas=' + encodeURIComponent(pt.siglas.join(',')) + (filtro.casa ? '&casa=' + filtro.casa : '') + '&de=' + atual.inicio + '&ate=' + atual.fim); } });
      var mostrarDica = function () { dica.textContent = texto; };
      seg.addEventListener('mouseenter', mostrarDica); seg.addEventListener('focus', mostrarDica);
      var limpar = function () { dica.textContent = ''; }; seg.addEventListener('mouseleave', limpar); seg.addEventListener('blur', limpar);
      return seg;
    }));
  }

  function render() {
    var meu = ++pedido;
    $('total-geral').replaceChildren(el('p', { class: 'discreto', text: 'Contando…' }));
    fonte.ultimoDia().then(function (ultimo) {
      var r = intervalo(ultimo); atual = r;
      return fonte.contar(r).then(function (linhas) {
        if (meu !== pedido) return;
        var tipos = agrupar(linhas);
        var total = tipos.reduce(function (s, t) { return s + t.total; }, 0);
        var casa = filtro.casa === 'CD' ? ' na Câmara' : filtro.casa === 'SF' ? ' no Senado' : '';
        $('total-geral').replaceChildren(
          el('b', { text: numero(total) }),
          el('span', { text: (total === 1 ? ' proposição apresentada' : ' proposições apresentadas') + casa + ' ' + descrever(r) })
        );
        renderTabela(tipos);
        var notas = [];
        if (!total) notas.push(ultimo ? 'Nada registrado neste período.' : 'Ainda não há entradas registradas. Elas aparecem depois da primeira coleta diária.');
        if (filtro.periodo === 'dia' && ultimo && ultimo !== iso(hoje())) notas.push('Último dia com registros: ' + longa(ultimo) + '.');
        if (P.estado.demo) notas.push('Números de exemplo, só para a demonstração.');
        else notas.push('Contagem de tudo o que foi apresentado nas duas Casas, inclusive requerimentos e emendas, segundo os dados abertos de cada uma.');
        $('nota-geral').textContent = notas.join(' ');
      });
    }).catch(function () {
      if (meu !== pedido) return;
      $('total-geral').replaceChildren(el('p', { class: 'discreto', text: 'Não foi possível contar as proposições. Verifique sua conexão.' }));
      $('tabela-geral').hidden = true; $('todos-tipos').hidden = true; $('nota-geral').textContent = '';
    });
  }

  function marcar(grupo, atributo, valor) {
    $(grupo).querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(atributo) === valor)); });
  }

  $('periodo-geral').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-periodo]'); if (!b) return;
    filtro.periodo = b.getAttribute('data-periodo');
    marcar('periodo-geral', 'data-periodo', filtro.periodo);
    var livre = filtro.periodo === 'livre';
    $('datas-geral').hidden = !livre;
    if (livre && !$('geral-inicio').value) {
      $('geral-inicio').value = filtro.inicio = iso(somar(hoje(), -29));
      $('geral-fim').value = filtro.fim = iso(hoje());
    }
    render();
  });
  ['geral-inicio', 'geral-fim'].forEach(function (id) {
    $(id).max = iso(hoje());
    $(id).addEventListener('change', function () { filtro.inicio = $('geral-inicio').value; filtro.fim = $('geral-fim').value; render(); });
  });
  $('casa-geral').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-casa]'); if (!b) return;
    filtro.casa = b.getAttribute('data-casa');
    marcar('casa-geral', 'data-casa', filtro.casa);
    render();
  });
  $('todos-tipos').addEventListener('click', function () { filtro.todos = !filtro.todos; render(); });

  // ---------- lista de um tipo (tela-entradas) ----------
  var POR_PAGINA = 50, lista = null;
  function dataBr(t) { return t ? longa(String(t).slice(0, 10)) : ''; }
  function cartao(p) {
    var casa = p.casa === 'CD' ? 'Câmara' : 'Senado';
    return el('li', { class: 'item item-prop' }, [
      el('div', { class: 'item-topo' }, [el('span', { class: 'selo casa casa-' + p.casa, text: casa }), p.exemplo ? el('span', { class: 'selo exemplo', text: 'Exemplo' }) : null,
        el('span', { text: dataBr(p.data_apresentacao) })]),
      el('h2', { text: p.sigla + ' ' + (p.numero || '?') + '/' + (p.ano || '') }),
      p.ementa ? el('p', { class: 'ementa', text: p.ementa }) : null,
      p.autor ? el('p', { class: 'situacao', text: p.autor }) : null,
      el('div', { class: 'item-acoes' }, [
        el('button', { type: 'button', class: 'acao-forte', text: 'Monitorar', onclick: function () {
          P.estado.preencher = p; P.irPara('?cadastrar=1&entrada=' + encodeURIComponent(p.id_externo));
        } }),
        p.url ? el('a', { href: p.url, target: '_blank', rel: 'noopener', text: 'Abrir na ' + casa }) : null
      ])
    ]);
  }
  function maisItens() {
    var l = lista, botao = $('mais-entradas');
    botao.disabled = true;
    return fonte.listar(l.casa, l.siglas, l.r, l.itens.length, POR_PAGINA).then(function (res) {
      if (l !== lista) return;
      l.itens = l.itens.concat(res.itens); l.total = res.total;
      $('lista-entradas').replaceChildren.apply($('lista-entradas'), l.itens.length ? l.itens.map(cartao)
        : [el('li', { class: 'vazio', text: 'Nenhuma proposição deste tipo no período.' })]);
      $('sub-entradas').textContent = numero(l.total) + (l.total === 1 ? ' proposição apresentada ' : ' proposições apresentadas ') + descrever(l.r) +
        (l.total > l.itens.length ? '. Mostrando ' + numero(l.itens.length) + '.' : '.');
      botao.hidden = l.itens.length >= l.total; botao.disabled = false;
      botao.textContent = 'Mostrar mais ' + Math.min(POR_PAGINA, l.total - l.itens.length);
    }).catch(function () {
      if (l !== lista) return;
      botao.disabled = false;
      $('lista-entradas').replaceChildren(el('li', { class: 'vazio', text: 'Não foi possível carregar a lista. Verifique sua conexão.' }));
    });
  }
  function renderLista(params) {
    P.mostrar('tela-entradas');
    var siglas = params.get('entradas').split(',').filter(Boolean), casa = params.get('casa') || '';
    var dataOk = function (t) { return /^\d{4}-\d{2}-\d{2}$/.test(t || ''); };
    var r = dataOk(params.get('de')) && dataOk(params.get('ate')) ? { inicio: params.get('de'), fim: params.get('ate') } : intervalo('');
    var nome = siglas.length === 1 ? (TIPOS[siglas[0]] ? siglas[0] + ' · ' + TIPOS[siglas[0]] : siglas[0]) : 'Outros tipos (' + siglas.join(', ') + ')';
    $('titulo-entradas').textContent = nome;
    $('casa-entradas').textContent = casa === 'CD' ? 'Câmara dos Deputados' : casa === 'SF' ? 'Senado Federal' : 'Câmara e Senado';
    $('sub-entradas').textContent = 'Carregando…';
    $('lista-entradas').replaceChildren();
    $('mais-entradas').hidden = true;
    lista = { siglas: siglas, casa: casa, r: r, itens: [], total: 0 };
    maisItens();
  }
  $('mais-entradas').addEventListener('click', maisItens);

  return {
    aoAbrirAba: function (nome) { if (nome === 'geral') render(); },
    rota: function (params) {
      if (params.get('entradas')) { renderLista(params); return true; }
      return false;
    }
  };
});
