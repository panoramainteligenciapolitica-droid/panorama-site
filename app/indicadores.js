// Indicadores da equipe (Relatórios > Indicadores da equipe): o que foi feito no período, por cliente e por pessoa.
// Histórico de alterações (Configurações > Histórico, para master e coordenadores): quem criou, alterou ou apagou o quê,
// gravado pelo banco (tabela historico, melhorias.sql).
(window.PanoramaModulos = window.PanoramaModulos || []).push(function (P) {
  'use strict';

  var $ = P.$, el = P.el, G = window.PanoramaRG;
  var periodo = '30';
  var TABELAS = { proposicoes: 'Proposição', palavras: 'Palavra-chave', especialidades: 'Especialidade', contatos: 'Contato', interacoes: 'Reunião ou interação',
    tarefas: 'Tarefa', mapa_parlamentares: 'Mapa de stakeholders', listas_email: 'Lista de e-mail', campanhas_email: 'E-mail em massa', alertas: 'Alerta',
    notas_tecnicas: 'Nota técnica', clientes: 'Cliente' };

  function intervalo() {
    var h = new Date(), ini, fim = new Date(h.getFullYear(), h.getMonth(), h.getDate(), 23, 59, 59);
    if (periodo === 'mes') ini = new Date(h.getFullYear(), h.getMonth(), 1);
    else if (periodo === 'anterior') { ini = new Date(h.getFullYear(), h.getMonth() - 1, 1); fim = new Date(h.getFullYear(), h.getMonth(), 0, 23, 59, 59); }
    else ini = new Date(h.getFullYear(), h.getMonth(), h.getDate() - (+periodo - 1));
    return [ini.toISOString(), fim.toISOString()];
  }
  function ler(tabela, campos, ids) {
    return P.sb.from(tabela).select(campos).in('cliente_id', ids).limit(10000).then(function (r) { return r.error ? [] : r.data || []; });
  }
  function noPeriodo(v, iv) { return v && v >= iv[0] && v <= iv[1]; }

  function render() {
    var painel = $('painel-indicadores');
    if (P.estado.demo || !P.sb) { painel.replaceChildren(G.cabecalho('Indicadores da equipe', 'Os indicadores aparecem quando você entra com seu e-mail e senha.')); return; }
    var clientes = P.estado.clientes || [], ids = clientes.map(function (c) { return c.id; });
    if (!ids.length) { painel.replaceChildren(el('p', { class: 'vazio', text: 'Você ainda não tem clientes liberados.' })); return; }
    painel.replaceChildren(el('p', { class: 'discreto', text: 'Calculando…' }));
    var iv = intervalo(), hoje = G.hojeIso();
    Promise.all([
      ler('proposicoes', 'id, cliente_id, criado_em, criado_por, ultima_tramitacao_em', ids),
      ler('interacoes', 'cliente_id, quando, registrado_por', ids),
      ler('tarefas', 'cliente_id, status, concluida_em, prazo, responsavel_id', ids),
      ler('campanhas_email', 'cliente_id, status, enviados, falhas, enviado_em, criado_por', ids),
      ler('alertas', 'cliente_id, publicado_em, autor', ids),
      ler('notas_tecnicas', 'cliente_id, status, atualizado_em, autor', ids),
      P.sb.from('perfis').select('user_id, nome, email, papel').then(function (r) { return r.data || []; })
    ]).then(function (r) {
      var props = r[0], inter = r[1], tarefas = r[2], camps = r[3], alertas = r[4], notas = r[5], pessoas = r[6];
      var porCliente = clientes.map(function (c) {
        var de = function (l) { return l.filter(function (x) { return x.cliente_id === c.id; }); };
        var ps = de(props), ts = de(tarefas), cs = de(camps);
        return {
          nome: c.nome, monitoradas: ps.length,
          novas: ps.filter(function (x) { return noPeriodo(x.criado_em, iv); }).length,
          andaram: ps.filter(function (x) { return noPeriodo(x.ultima_tramitacao_em, iv); }).length,
          reunioes: de(inter).filter(function (x) { return noPeriodo(x.quando, iv); }).length,
          feitas: ts.filter(function (x) { return x.status === 'feita' && noPeriodo(x.concluida_em, iv); }).length,
          atrasadas: ts.filter(function (x) { return x.status !== 'feita' && x.prazo && x.prazo < hoje; }).length,
          emails: cs.filter(function (x) { return noPeriodo(x.enviado_em, iv); }).reduce(function (n, x) { return n + (x.enviados || 0); }, 0),
          alertas: de(alertas).filter(function (x) { return noPeriodo(x.publicado_em, iv); }).length,
          notas: de(notas).filter(function (x) { return noPeriodo(x.atualizado_em, iv); }).length
        };
      });
      var porPessoa = pessoas.map(function (p) {
        var meu = function (l, campo) { return l.filter(function (x) { return x[campo] === p.user_id; }); };
        return {
          nome: p.nome || p.email, papel: p.papel,
          reunioes: meu(inter, 'registrado_por').filter(function (x) { return noPeriodo(x.quando, iv); }).length,
          feitas: meu(tarefas, 'responsavel_id').filter(function (x) { return x.status === 'feita' && noPeriodo(x.concluida_em, iv); }).length,
          atrasadas: meu(tarefas, 'responsavel_id').filter(function (x) { return x.status !== 'feita' && x.prazo && x.prazo < hoje; }).length,
          cadastradas: meu(props, 'criado_por').filter(function (x) { return noPeriodo(x.criado_em, iv); }).length,
          campanhas: meu(camps, 'criado_por').filter(function (x) { return noPeriodo(x.enviado_em, iv); }).length,
          alertas: meu(alertas, 'autor').filter(function (x) { return noPeriodo(x.publicado_em, iv); }).length,
          notas: meu(notas, 'autor').filter(function (x) { return noPeriodo(x.atualizado_em, iv); }).length
        };
      }).filter(function (x) { return x.reunioes + x.feitas + x.atrasadas + x.cadastradas + x.campanhas + x.alertas + x.notas > 0 || pessoas.length < 15; });

      var colC = [['nome', 'Cliente'], ['monitoradas', 'Monitoradas'], ['novas', 'Novas no período'], ['andaram', 'Com movimentação'], ['reunioes', 'Reuniões'],
        ['feitas', 'Tarefas feitas'], ['atrasadas', 'Atrasadas hoje'], ['emails', 'E-mails entregues'], ['alertas', 'Alertas'], ['notas', 'Notas técnicas']];
      var colP = [['nome', 'Pessoa'], ['reunioes', 'Reuniões registradas'], ['feitas', 'Tarefas feitas'], ['atrasadas', 'Atrasadas hoje'], ['cadastradas', 'Proposições cadastradas'],
        ['campanhas', 'E-mails em massa'], ['alertas', 'Alertas'], ['notas', 'Notas técnicas']];
      function tabela(linhas, cols) {
        var total = {}; cols.slice(1).forEach(function (c) { total[c[0]] = linhas.reduce(function (n, x) { return n + (x[c[0]] || 0); }, 0); });
        return el('div', { class: 'rolagem-tabela' }, [el('table', { class: 'tabela-relatorio tabela-indicadores' }, [
          el('thead', {}, [el('tr', {}, cols.map(function (c) { return el('th', { text: c[1] }); }))]),
          el('tbody', {}, linhas.map(function (x) { return el('tr', {}, cols.map(function (c, i) { return el('td', { class: i ? 'num' : '', text: String(x[c[0]] === undefined ? '' : x[c[0]]) }); })); })),
          el('tfoot', {}, [el('tr', {}, cols.map(function (c, i) { return el('td', { class: i ? 'num' : '', text: i ? String(total[c[0]]) : 'Total' }); }))])
        ])]);
      }
      painel.replaceChildren(
        G.cabecalho('Indicadores da equipe', 'O que foi feito no período em cada cliente e por cada pessoa. Conta só o que está registrado no app.', [
          G.botao('Baixar planilha', function () {
            G.baixarCsv('indicadores-clientes-' + G.hojeIso() + '.csv', porCliente, colC.map(function (c) { return { rotulo: c[1], valor: c[0] }; }));
            G.baixarCsv('indicadores-pessoas-' + G.hojeIso() + '.csv', porPessoa, colP.map(function (c) { return { rotulo: c[1], valor: c[0] }; }));
          }, 'botao-linha')
        ]),
        el('div', { class: 'chips-filtro' }, [['30', 'Últimos 30 dias'], ['mes', 'Este mês'], ['anterior', 'Mês passado'], ['90', 'Últimos 90 dias']].map(function (x) {
          return el('button', { type: 'button', 'aria-pressed': String(periodo === x[0]), text: x[1], onclick: function () { periodo = x[0]; render(); } });
        })),
        el('h3', { text: 'Por cliente' }), tabela(porCliente, colC),
        el('h3', { text: 'Por pessoa' }), tabela(porPessoa, colP),
        el('p', { class: 'discreto', text: 'Reuniões contam para quem registrou; tarefas, para o responsável escolhido na tarefa. Taxa de abertura de e-mails não é medida: o app conta os entregues ao provedor.' })
      );
    }, function (e) { painel.replaceChildren(el('p', { class: 'vazio', text: G.erroAmigavel(e) })); });
  }

  // ---------- histórico de alterações ----------
  var filtroCliente = '';
  function renderHistorico() {
    var caixa = $('painel-historico');
    caixa.replaceChildren(el('p', { class: 'discreto', text: 'Carregando…' }));
    var q = P.sb.from('historico').select('quando, quem, cliente_id, tabela, acao, resumo, dados').order('quando', { ascending: false }).limit(300);
    if (filtroCliente) q = q.eq('cliente_id', filtroCliente);
    q.then(function (r) {
      if (r.error) throw r.error;
      var linhas = r.data || [];
      var sel = el('select', { 'aria-label': 'Cliente' }, [el('option', { value: '', text: 'Todos os clientes' })].concat((P.estado.clientes || []).map(function (c) { return el('option', { value: c.id, text: c.nome }); })));
      sel.value = filtroCliente;
      sel.addEventListener('change', function () { filtroCliente = sel.value; renderHistorico(); });
      caixa.replaceChildren(el('section', { class: 'bloco' }, [
        el('h2', { text: 'Histórico de alterações' }),
        el('p', { class: 'discreto', text: 'Quem criou, alterou ou apagou cada cadastro, nos clientes que você coordena. As atualizações automáticas do app (coleta e tramitação) não entram.' }),
        el('div', { class: 'linha-form' }, [sel, G.botao('Baixar planilha', function () {
          G.baixarCsv('historico-' + G.hojeIso() + '.csv', linhas, [{ rotulo: 'Quando', valor: function (x) { return G.dataHora(x.quando); } }, { rotulo: 'Quem', valor: 'quem' },
            { rotulo: 'Cliente', valor: function (x) { return P.nomeCliente(x.cliente_id); } }, { rotulo: 'O quê', valor: function (x) { return TABELAS[x.tabela] || x.tabela; } },
            { rotulo: 'Ação', valor: 'acao' }, { rotulo: 'Item', valor: 'resumo' }, { rotulo: 'Mudanças', valor: function (x) { return x.dados ? JSON.stringify(x.dados) : ''; } }]);
        }, 'botao-linha')]),
        linhas.length ? el('ul', { class: 'lista-simples lista-historico' }, linhas.map(function (x) {
          var campos = x.dados && x.acao === 'alterou' ? Object.keys(x.dados).filter(function (k) { return ['id', 'cliente_id'].indexOf(k) < 0; }) : [];
          return el('li', {}, [
            el('span', { class: 'discreto', text: G.dataHora(x.quando) }),
            el('span', { text: (x.quem || 'Alguém') + ' ' + x.acao + ' ' + (TABELAS[x.tabela] || x.tabela).toLowerCase() + (x.resumo ? ': ' + x.resumo : '') +
              (campos.length ? ' (' + campos.join(', ') + ')' : '') + (x.cliente_id && !filtroCliente ? ' · ' + P.nomeCliente(x.cliente_id) : '') })
          ]);
        })) : el('p', { class: 'vazio', text: 'Nada registrado ainda.' })
      ]));
    }).catch(function (e) { caixa.replaceChildren(el('p', { class: 'vazio', text: /historico/.test((e && e.message) || '') ? 'Rode o arquivo melhorias.sql no Supabase para ligar o histórico.' : G.erroAmigavel(e) })); });
  }
  document.addEventListener('panorama-config', function () {
    var b = $('temas-config').querySelector('[data-tema="historico"]');
    b.hidden = P.estado.demo || !G.gere();
  });
  document.addEventListener('panorama-tema', function (ev) { if (ev.detail === 'historico') renderHistorico(); });

  return {
    aoAbrirAba: function (nome) { if (nome === 'indicadores') render(); }
  };
});
