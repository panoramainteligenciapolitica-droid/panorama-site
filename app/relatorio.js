// Relatório do cliente: proposições monitoradas, reuniões, tarefas, mapa de stakeholders e alertas do período.
// Sai para impressão ou PDF (pela janela de impressão do sistema) e para Word (.docx).
(window.PanoramaModulos = window.PanoramaModulos || []).push(function (P) {
  'use strict';

  var $ = P.$, el = P.el, G = window.PanoramaRG, R = G.R;
  var CASAS = { CD: 'Câmara', SF: 'Senado' };
  var POS_PROP = { analise: 'Em análise', favoravel: 'Favorável', contrario: 'Contrário', acompanhar: 'Acompanhar' };
  var periodo = '30';

  function intervalo() {
    var h = new Date(), ini, fim = new Date(h.getFullYear(), h.getMonth(), h.getDate(), 23, 59, 59);
    if (periodo === 'mes') ini = new Date(h.getFullYear(), h.getMonth(), 1);
    else if (periodo === 'anterior') { ini = new Date(h.getFullYear(), h.getMonth() - 1, 1); fim = new Date(h.getFullYear(), h.getMonth(), 0, 23, 59, 59); }
    else ini = new Date(h.getFullYear(), h.getMonth(), h.getDate() - (+periodo - 1));
    return [ini, fim];
  }
  function lerTudo() {
    var vazio = function () { return []; };
    return Promise.all([
      G.monitoradas().catch(vazio),
      P.tabela('especialidades').listar().catch(vazio),
      P.tabela('interacoes').listar({ ordem: 'quando' }).catch(vazio),
      P.tabela('tarefas').listar({ ordem: 'prazo' }).catch(vazio),
      P.tabela('mapa_parlamentares').listar().catch(vazio),
      P.estado.demo ? Promise.resolve([]) : P.tabela('alertas').listar({ ordem: 'publicado_em', desc: true, campos: 'id, titulo, resumo, publicado_em' }).catch(vazio)
    ]);
  }

  function render() {
    var painel = $('painel-relatorio');
    if (G.semCliente(painel)) return;
    var folha = el('article', { class: 'folha-relatorio', id: 'folha-relatorio' }, [el('p', { class: 'discreto', text: 'Montando o relatório…' })]);
    var texto = '';
    painel.replaceChildren(
      G.cabecalho('Relatório do cliente', 'Prestação de contas pronta para enviar: o que é monitorado, o que foi feito e o que vem pela frente.', [
        G.botao('Imprimir ou salvar PDF', function () { document.body.classList.add('imprimindo-relatorio'); window.print(); setTimeout(function () { document.body.classList.remove('imprimindo-relatorio'); }, 500); }),
        G.botao('Baixar Word (.docx)', function () {
          if (!texto) return;
          window.PanoramaTeor.baixar('relatorio-' + (P.nomeCliente(P.estado.cliente) || 'cliente').replace(/\W+/g, '-') + '-' + G.hojeIso() + '.docx', window.PanoramaTeor.docx(texto),
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        }, 'botao-linha')
      ]),
      el('div', { class: 'chips-filtro' }, [['30', 'Últimos 30 dias'], ['7', 'Últimos 7 dias'], ['mes', 'Este mês'], ['anterior', 'Mês passado'], ['90', 'Últimos 90 dias']].map(function (p) {
        return el('button', { type: 'button', 'aria-pressed': String(periodo === p[0]), text: p[1], onclick: function () { periodo = p[0]; render(); } });
      })),
      folha
    );
    lerTudo().then(function (r) {
      var props = r[0], esps = r[1], inter = r[2], tarefas = r[3], mapa = r[4], alertas = r[5];
      var iv = intervalo(), ini = iv[0].toISOString(), fim = iv[1].toISOString();
      var cliente = P.nomeCliente(P.estado.cliente) || 'Cliente';
      var nomeEsp = function (id) { var e = esps.find(function (x) { return x.id === id; }); return e ? e.nome : 'Sem especialidade'; };
      var noPeriodo = inter.filter(function (i) { return i.quando >= ini && i.quando <= fim; });
      var futuras = inter.filter(function (i) { return i.quando > fim; });
      var abertas = tarefas.filter(function (t) { return t.status !== 'feita'; });
      var feitas = tarefas.filter(function (t) { return t.status === 'feita' && t.concluida_em && t.concluida_em >= ini && t.concluida_em <= fim; });
      var alertasPer = alertas.filter(function (a) { return a.publicado_em >= ini && a.publicado_em <= fim; });
      var linhas = [];
      var titulo = 'Relatório de relações governamentais · ' + cliente;
      var periodoTxt = 'Período: ' + G.dataBr(ini) + ' a ' + G.dataBr(fim);
      linhas.push(titulo, periodoTxt, '');

      var porEsp = {};
      props.forEach(function (p) { var k = nomeEsp(p.especialidade_id); (porEsp[k] = porEsp[k] || []).push(p); });
      var ordemP = { alta: 0, media: 1, baixa: 2 };
      var secaoProps = el('section', {}, [el('h2', { text: '1. Proposições monitoradas (' + props.length + ')' })].concat(Object.keys(porEsp).sort().map(function (k) {
        linhas.push('1. Proposições monitoradas · ' + k);
        var l = porEsp[k].sort(function (a, b) { return (ordemP[a.prioridade] || 1) - (ordemP[b.prioridade] || 1); });
        l.forEach(function (p) {
          linhas.push(G.identProp(p) + ' (' + CASAS[p.casa] + ') · prioridade ' + (R.PRIORIDADES[p.prioridade] || '').toLowerCase() + ' · ' + (POS_PROP[p.posicionamento] || '') + '\n' + (p.ementa || '') +
            (p.situacao ? '\nSituação: ' + p.situacao : '') + (p.proximo_passo ? '\nPróximo passo: ' + p.proximo_passo : ''));
        });
        linhas.push('');
        return el('div', {}, [el('h3', { text: k }), el('table', { class: 'tabela-relatorio' }, [
          el('thead', {}, [el('tr', {}, ['Proposição', 'Ementa', 'Prioridade', 'Posição', 'Situação e próximo passo'].map(function (t) { return el('th', { text: t }); }))]),
          el('tbody', {}, l.map(function (p) {
            return el('tr', {}, [el('td', { text: G.identProp(p) + ' · ' + CASAS[p.casa] }), el('td', { text: p.ementa || '' }), el('td', { text: R.PRIORIDADES[p.prioridade] || '' }),
              el('td', { text: POS_PROP[p.posicionamento] || '' }), el('td', { text: [p.situacao, p.proximo_passo ? 'Próximo passo: ' + p.proximo_passo : ''].filter(Boolean).join('. ') })]);
          }))])]);
      })));
      if (!props.length) secaoProps.appendChild(el('p', { class: 'discreto', text: 'Nenhuma proposição monitorada.' }));

      function listaSec(numero, nome, itens, fmt, vazio) {
        linhas.push(numero + '. ' + nome);
        itens.forEach(function (x) { linhas.push('- ' + fmt(x)); });
        if (!itens.length) linhas.push(vazio);
        linhas.push('');
        return el('section', {}, [el('h2', { text: numero + '. ' + nome + ' (' + itens.length + ')' }),
          itens.length ? el('ul', {}, itens.map(function (x) { return el('li', { text: fmt(x) }); })) : el('p', { class: 'discreto', text: vazio })]);
      }
      var fmtInter = function (i) { return G.dataHora(i.quando) + ' · ' + (R.TIPOS_INTERACAO[i.tipo] || i.tipo) + ' · ' + i.assunto + (i.participantes ? ' (com ' + i.participantes + ')' : '') + (i.encaminhamentos ? '. Encaminhamentos: ' + i.encaminhamentos : ''); };
      var fmtTarefa = function (t) { return t.titulo + (t.prazo ? ' · prazo ' + G.dataBr(t.prazo) : '') + (t.responsavel ? ' · ' + t.responsavel : ''); };
      var contagem = {};
      mapa.forEach(function (m) { contagem[m.posicao] = (contagem[m.posicao] || 0) + 1; });
      var mapaTxt = Object.keys(R.POSICOES).filter(function (k) { return contagem[k]; }).map(function (k) { return R.POSICOES[k] + ': ' + contagem[k]; });
      var altas = mapa.filter(function (m) { return m.influencia === 'alta'; });
      linhas.push('5. Mapa de stakeholders', mapaTxt.join(' · ') || 'Nenhum parlamentar mapeado.');
      altas.forEach(function (m) { linhas.push('- ' + m.nome + ' (' + m.partido + '/' + m.uf + ') · ' + R.POSICOES[m.posicao] + ' · influência alta'); });
      linhas.push('');

      var secoes = [
        el('header', { class: 'cabeca-relatorio' }, [el('p', { class: 'sobretitulo', text: 'Panorama Inteligência Política' }), el('h1', { text: titulo }), el('p', { class: 'discreto', text: periodoTxt })]),
        secaoProps,
        listaSec(2, 'Reuniões e interações no período', noPeriodo, fmtInter, 'Nenhuma reunião registrada no período.'),
        listaSec(3, 'Próximas agendas', futuras, fmtInter, 'Nenhuma agenda marcada.'),
        listaSec(4, 'Tarefas abertas', abertas, fmtTarefa, 'Nenhuma tarefa aberta.'),
        el('section', {}, [el('h2', { text: '5. Mapa de stakeholders' }), el('p', { text: mapaTxt.join(' · ') || 'Nenhum parlamentar mapeado.' }),
          altas.length ? el('ul', {}, altas.map(function (m) { return el('li', { text: m.nome + ' (' + m.partido + '/' + m.uf + ') · ' + R.POSICOES[m.posicao] + ' · influência alta' }); })) : null]),
        listaSec(6, 'Tarefas concluídas no período', feitas, fmtTarefa, 'Nenhuma tarefa concluída no período.')
      ];
      if (!P.estado.demo) secoes.push(listaSec(7, 'Alertas enviados no período', alertasPer, function (a) { return G.dataBr(a.publicado_em) + ' · ' + a.titulo; }, 'Nenhum alerta no período.'));
      texto = linhas.join('\n').replace(/\n{3,}/g, '\n\n');
      folha.replaceChildren.apply(folha, secoes);
    });
  }

  return {
    aoAbrirAba: function (nome) { if (nome === 'relatorio') render(); },
    aoTrocarCliente: function () { if (P.estado.aba === 'relatorio') render(); }
  };
});
