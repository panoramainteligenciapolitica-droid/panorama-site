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
  var filtro = { periodo: '7', casa: '', inicio: '', fim: '', todos: false };
  var pedido = 0;

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
  function exemploDoDia(dia) {
    var semana = deIso(dia).getDay(), fator = semana === 0 ? .04 : semana === 6 ? .08 : semana === 1 || semana === 5 ? .7 : 1;
    var linhas = [];
    Object.keys(MEDIAS).forEach(function (casa) {
      Object.keys(MEDIAS[casa]).forEach(function (sigla) {
        var media = MEDIAS[casa][sigla] * fator, r = sorteio(casa + sigla + dia);
        var n = media < 1 ? (r < media ? 1 : 0) : Math.round(media * (.6 + .8 * r));
        if (n) linhas.push({ casa: casa, sigla: sigla, total: n });
      });
    });
    return linhas;
  }
  var ultimoExemplo = function () { return iso(somar(hoje(), -1)); };

  var fonte = {
    ultimoDia: function () {
      if (P.estado.demo) return Promise.resolve(ultimoExemplo());
      return P.sb.from('entradas').select('data_apresentacao').order('data_apresentacao', { ascending: false }).limit(1)
        .then(function (r) { if (r.error) throw r.error; return r.data && r.data[0] ? r.data[0].data_apresentacao : ''; });
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
    var maior = tipos.length ? tipos[0].total : 0;
    var mostrar = filtro.todos || tipos.length <= VISIVEIS + 1 ? tipos : tipos.slice(0, VISIVEIS);
    var resto = tipos.slice(mostrar.length);
    var cabeca = el('tr', {}, [el('th', { scope: 'col', text: 'Tipo' })].concat(
      ambas ? [el('th', { scope: 'col', class: 'num', text: 'Câmara' }), el('th', { scope: 'col', class: 'num', text: 'Senado' })] : [],
      [el('th', { scope: 'col', class: 'num', text: ambas ? 'Total' : 'Quantidade' })]));
    function linha(t, nome, classe) {
      var largura = maior ? Math.max(2, Math.round(t.total / maior * 100)) : 0;
      return el('tr', { class: classe || '' }, [
        el('th', { scope: 'row' }, [el('span', { class: 'sigla-tipo', text: t.sigla }), el('span', { class: 'nome-tipo', text: nome })])
      ].concat(
        ambas ? [el('td', { class: 'num', text: numero(t.CD) }), el('td', { class: 'num', text: numero(t.SF) })] : [],
        [el('td', { class: 'num total' }, [
          el('span', { class: 'trilho', 'aria-hidden': 'true' }, [el('span', { class: 'barra-tipo', style: 'width:' + largura + '%' })]),
          el('span', { class: 'valor', text: numero(t.total) })
        ])]));
    }
    var corpo = mostrar.map(function (t) { return linha(t, TIPOS[t.sigla] || ''); });
    if (resto.length) {
      var outros = resto.reduce(function (a, t) { a.CD += t.CD; a.SF += t.SF; a.total += t.total; return a; }, { sigla: 'Outros', CD: 0, SF: 0, total: 0 });
      corpo.push(linha(outros, resto.length + ' tipos', 'outros'));
    }
    tabela.replaceChildren(el('caption', { class: 'so-leitor', text: 'Proposições apresentadas por tipo' }),
      el('thead', {}, [cabeca]), el('tbody', {}, corpo));
    tabela.hidden = !tipos.length;
    var botao = $('todos-tipos');
    botao.hidden = tipos.length <= VISIVEIS + 1;
    botao.textContent = filtro.todos ? 'Mostrar só os principais tipos' : 'Mostrar todos os ' + tipos.length + ' tipos';
  }

  function render() {
    var meu = ++pedido;
    $('total-geral').replaceChildren(el('p', { class: 'discreto', text: 'Contando…' }));
    fonte.ultimoDia().then(function (ultimo) {
      var r = intervalo(ultimo);
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

  return {
    aoAbrirAba: function (nome) { if (nome === 'geral') render(); }
  };
});
