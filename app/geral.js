// Aba Geral: quantas proposições deram entrada na Câmara e no Senado, por tipo, num período.
// Os números vêm direto dos dados abertos das duas Casas (casas.js), consultados na hora.
// No app com login, se as Casas não responderem, usa a tabela "entradas" que a coleta diária preenche.
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
    PRL: 'Parecer de relator', PAR: 'Parecer de comissão', REL: 'Relatório', OF: 'Ofício', DCR: 'Denúncia por crime de responsabilidade',
    PET: 'Petição', REC: 'Recurso', PDS: 'Projeto de Decreto Legislativo do Senado', TVR: 'Ato de concessão de rádio e TV',
    // documentos de tramitação (só aparecem ao incluí-los)
    RPD: 'Requerimento de pauta ou votação', RPDR: 'Requerimento de pauta ou votação', PARF: 'Parecer para redação final',
    RDF: 'Redação final', ERD: 'Emenda de redação', DTQ: 'Destaque', VTS: 'Voto em separado', ATA: 'Ata', DOC: 'Documento', AVN: 'Aviso',
    'SBT-A': 'Substitutivo adotado pela comissão', 'EMC-A': 'Emenda adotada pela comissão', 'SBE-A': 'Subemenda adotada pela comissão',
    SBE: 'Subemenda', SBR: 'Subemenda de relator', SSP: 'Subemenda substitutiva de Plenário', EMR: 'Emenda de relator',
    PRLP: 'Parecer preliminar', PPP: 'Parecer proferido em Plenário', PRLE: 'Parecer preliminar às emendas de Plenário',
    PEP: 'Parecer às emendas de Plenário', RRL: 'Relatório do relator (CMO)'
  };
  var VISIVEIS = 10;
  // Cor fixa por tipo (não muda com o período nem com o filtro); os demais tipos ficam em cinza
  var CORES = { PL: '#2a78d6', REQ: '#eb6834', RQS: '#1baf7a', RIC: '#eda100', INC: '#e87ba4', PDL: '#008300', EMC: '#6250d6', PLP: '#e34948' };
  var CINZA = '#b4bccb';
  function cor(sigla) { return CORES[sigla] || CINZA; }
  var filtro = { periodo: '7', casa: '', inicio: '', fim: '', todos: false, docs: false };
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

  // ---------- dados: consulta direta às Casas; no app com login, a tabela "entradas" é a reserva ----------
  var C = window.PanoramaCasas;
  var faltou = [];
  function aoVivo(r) {
    return C.periodo(r.inicio, r.fim).then(function (res) {
      faltou = res.erros;
      if (res.erros.length === 2) throw new Error('As duas Casas ficaram sem resposta');
      return res.itens;
    });
  }
  function doBanco() { return !P.estado.demo && P.sb; }
  function bancoListar(casa, siglas, r, de, quantos) {
    var q = P.sb.from('entradas').select('id_externo, casa, sigla, numero, ano, ementa, autor, url, url_inteiro_teor, data_apresentacao', { count: 'exact' })
      .in('sigla', siglas).gte('data_apresentacao', r.inicio).lte('data_apresentacao', r.fim);
    if (casa) q = q.eq('casa', casa);
    return q.order('data_apresentacao', { ascending: false }).order('id_externo', { ascending: false }).range(de, de + quantos - 1)
      .then(function (res) { if (res.error) throw res.error; return { itens: res.data || [], total: res.count || 0 }; });
  }

  function bancoContar(r) {
    return P.sb.rpc('contar_entradas', { inicio: r.inicio, fim: r.fim }).then(function (res) {
      if (res.error) throw res.error;
      return (res.data || []).map(function (l) { return { casa: l.casa, sigla: l.sigla, total: Number(l.total) || 0 }; });
    });
  }
  function separarFora(linhas) {
    var fora = 0, ok = linhas.filter(function (l) {
      var conta = filtro.docs || C.principal(l); if (!conta && (!filtro.casa || l.casa === filtro.casa)) fora += l.total; return conta;
    });
    ok.fora = fora;
    return ok;
  }
  // No app com login, os dias até ontem vêm do banco (a coleta diária guarda tudo em "entradas"), que é rápido e
  // não depende da Câmara responder; só o dia de hoje é consultado na hora. Se o banco falhar, consulta tudo na hora.
  function partes(r) {
    var h = iso(hoje()), ontem = iso(somar(hoje(), -1));
    return {
      banco: r.inicio <= ontem ? { inicio: r.inicio, fim: r.fim < h ? r.fim : ontem } : null,
      vivo: r.fim >= h ? { inicio: r.inicio > h ? r.inicio : h, fim: r.fim } : null
    };
  }
  function vivoLinhas(r) {
    return aoVivo(r).then(function (itens) { return itens.map(function (p) { return { casa: p.casa, sigla: p.sigla, total: 1 }; }); });
  }
  function ordenar(lista) {
    return lista.sort(function (a, b) { return a.data_apresentacao < b.data_apresentacao ? 1 : a.data_apresentacao > b.data_apresentacao ? -1 : Number(b.numero) - Number(a.numero); });
  }

  var fonte = {
    ultimoDia: function () {
      var h = hoje();
      if (!doBanco()) {
        return aoVivo({ inicio: iso(somar(h, -9)), fim: iso(h) }).then(function (itens) {
          return itens.reduce(function (m, p) { return p.data_apresentacao > m ? p.data_apresentacao : m; }, '');
        });
      }
      return aoVivo({ inicio: iso(h), fim: iso(h) }).catch(function () { return []; }).then(function (itens) {
        if (itens.some(function (p) { return C.principal(p); })) return iso(h);
        return P.sb.from('entradas').select('data_apresentacao').lte('data_apresentacao', iso(h)).order('data_apresentacao', { ascending: false }).limit(1)
          .then(function (res) { return (res.data && res.data[0] && res.data[0].data_apresentacao) || iso(somar(h, -1)); });
      });
    },
    listar: function (casa, siglas, r, de, quantos) {
      var tudoAoVivo = function () {
        return aoVivo(r).then(function (itens) {
          var todos = ordenar(itens.filter(function (p) { return (!casa || p.casa === casa) && siglas.indexOf(p.sigla) >= 0; }));
          return { itens: todos.slice(de, de + quantos), total: todos.length };
        });
      };
      if (!doBanco()) return tudoAoVivo();
      var pt = partes(r);
      return (pt.vivo ? aoVivo(pt.vivo).catch(function () { return []; }) : Promise.resolve([])).then(function (itens) {
        var deHoje = ordenar(itens.filter(function (p) { return (!casa || p.casa === casa) && siglas.indexOf(p.sigla) >= 0; }));
        var mostrar = deHoje.slice(de, de + quantos);
        if (!pt.banco) return { itens: mostrar, total: deHoje.length };
        var inicioBanco = Math.max(0, de - deHoje.length), falta = quantos - mostrar.length;
        return bancoListar(casa, siglas, pt.banco, inicioBanco, Math.max(falta, 1)).then(function (b) {
          return { itens: mostrar.concat(falta > 0 ? b.itens : []), total: deHoje.length + b.total };
        });
      }).catch(function () { return tudoAoVivo(); });
    },
    contar: function (r) {
      if (!doBanco()) return vivoLinhas(r).then(separarFora);
      var pt = partes(r);
      return Promise.all([
        pt.banco ? bancoContar(pt.banco) : Promise.resolve([]),
        pt.vivo ? vivoLinhas(pt.vivo).catch(function () { faltou = ['CD', 'SF']; return []; }) : Promise.resolve((faltou = [], []))
      ]).then(function (x) { return separarFora(x[0].concat(x[1])); }, function () { return vivoLinhas(r).then(separarFora); });
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
    var aviso = function (texto) {
      $('total-geral').replaceChildren(el('p', { class: 'discreto', text: texto }));
      $('barra-geral').hidden = true; $('tabela-geral').hidden = true; $('todos-tipos').hidden = true; $('incluir-docs').hidden = true; $('nota-geral').textContent = '';
    };
    var previo = intervalo('');
    if ((deIso(previo.fim) - deIso(previo.inicio)) / 864e5 + 1 > C.MAX_DIAS) { aviso('Escolha um período de até ' + C.MAX_DIAS + ' dias.'); return; }
    $('total-geral').replaceChildren(el('p', { class: 'discreto', text: 'Contando as proposições…' }));
    (filtro.periodo === 'dia' ? fonte.ultimoDia() : Promise.resolve('')).then(function (ultimo) {
      var r = intervalo(ultimo); atual = r;
      return fonte.contar(r).then(function (linhas) {
        if (meu !== pedido) return;
        var tipos = agrupar(linhas);
        var total = tipos.reduce(function (s, t) { return s + t.total; }, 0);
        var casa = filtro.casa === 'CD' ? ' na Câmara' : filtro.casa === 'SF' ? ' no Senado' : '';
        $('total-geral').replaceChildren(
          el('b', { text: numero(total) }),
          el('span', { text: (filtro.docs ? (total === 1 ? ' proposição ou documento apresentado' : ' proposições e documentos apresentados') : (total === 1 ? ' proposição apresentada' : ' proposições apresentadas')) + casa + ' ' + descrever(r) })
        );
        renderTabela(tipos);
        var notas = [];
        if (faltou.length === 2 && doBanco()) notas.push('A Câmara e o Senado não responderam agora; os números de hoje ainda não entraram.');
        if (faltou.length === 1) notas.push((faltou[0] === 'CD' ? 'A Câmara' : 'O Senado') + ' não respondeu agora; os números' + (doBanco() ? ' de hoje' : '') + ' são só ' + (faltou[0] === 'CD' ? 'do Senado.' : 'da Câmara.'));
        if (!total) notas.push('Nada apresentado neste período.');
        if (linhas.fora) notas.push('Fora da conta: ' + numero(linhas.fora) + ' documentos de tramitação (pareceres, emendas, substitutivos, redações e requerimentos de pauta).');
        if (filtro.periodo === 'dia' && ultimo && ultimo !== iso(hoje())) notas.push('Último dia com proposições apresentadas: ' + longa(ultimo) + '.');
        notas.push(doBanco() ? 'Fonte: dados abertos da Câmara e do Senado, guardados pela coleta diária; o dia de hoje é consultado agora.' : 'Fonte: dados abertos da Câmara e do Senado, consultados agora.');
        var docs = $('incluir-docs');
        docs.hidden = !linhas.fora && !filtro.docs;
        docs.textContent = filtro.docs ? 'Contar só as proposições' : 'Incluir os documentos de tramitação';
        $('nota-geral').textContent = notas.join(' ');
      });
    }).catch(function () {
      if (meu !== pedido) return;
      aviso('Não foi possível consultar a Câmara e o Senado agora. Verifique sua conexão e tente de novo.');
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
  $('incluir-docs').addEventListener('click', function () { filtro.docs = !filtro.docs; filtro.todos = false; render(); });

  // ---------- lista de um tipo (tela-entradas) ----------
  var POR_PAGINA = 50, lista = null;
  function dataBr(t) { return t ? longa(String(t).slice(0, 10)) : ''; }
  function cartao(p) {
    var casa = p.casa === 'CD' ? 'Câmara' : 'Senado';
    return el('li', { class: 'item item-prop' }, [
      el('div', { class: 'item-topo' }, [el('span', { class: 'selo casa casa-' + p.casa, text: casa }), p.exemplo ? el('span', { class: 'selo exemplo', text: 'Exemplo' }) : null,
        el('span', { text: dataBr(p.data_apresentacao) })]),
      el('h2', {}, [el('button', { type: 'button', class: 'numero-prop', title: 'Ler o inteiro teor', text: p.sigla + ' ' + (p.numero || '?') + '/' + (p.ano || ''),
        onclick: function () { if (window.PanoramaTeor) window.PanoramaTeor.abrir(p); } })]),
      p.ementa ? el('p', { class: 'ementa', text: p.ementa }) : null,
      p.autor ? el('p', { class: 'situacao', text: p.autor }) : null,
      el('div', { class: 'item-acoes' }, [
        el('button', { type: 'button', class: 'acao-forte', text: 'Monitorar', onclick: function () {
          P.estado.preencher = p; P.irPara('?cadastrar=1&entrada=' + encodeURIComponent(p.id_externo));
        } }),
        el('button', { type: 'button', text: 'Inteiro teor', onclick: function () { if (window.PanoramaTeor) window.PanoramaTeor.abrir(p); } }),
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
