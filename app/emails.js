// Comunicação em massa: listas de e-mail do cliente e campanhas enviadas pela função enviar-emails (Resend).
// O texto aceita {{nome}}, {{primeiro_nome}}, {{tratamento}} e {{email}}; cada envio leva o link de descadastro.
(window.PanoramaModulos = window.PanoramaModulos || []).push(function (P) {
  'use strict';

  var $ = P.$, el = P.el, G = window.PanoramaRG;
  var STATUS = { rascunho: 'Rascunho', enviando: 'Enviando', parcial: 'Parcialmente enviada', enviada: 'Enviada', erro: 'Erro no envio' };
  var MODELOS = [
    { nome: 'Pedido de reunião', assunto: 'Pedido de audiência: [assunto]', corpo: 'Excelentíssimo(a) {{tratamento}} {{nome}},\n\nEm nome de [cliente], solicitamos a gentileza de uma audiência para apresentar nossa posição sobre [proposição].\n\nFicamos à disposição para a data e o horário mais convenientes para o gabinete.\n\nRespeitosamente,\n[assinatura]' },
    { nome: 'Nota técnica', assunto: 'Nota técnica sobre [proposição]', corpo: 'Prezado(a) {{tratamento}} {{nome}},\n\nEncaminhamos a nota técnica de [cliente] sobre [proposição], com a análise de impacto e as sugestões de redação.\n\nLink da nota: https://\n\nColocamo-nos à disposição para esclarecimentos.\n\nAtenciosamente,\n[assinatura]' },
    { nome: 'Agradecimento', assunto: 'Agradecimento', corpo: 'Prezado(a) {{tratamento}} {{nome}},\n\nAgradecemos a atenção dispensada na reunião sobre [tema] e o apoio à pauta de [cliente].\n\nAtenciosamente,\n[assinatura]' },
    { nome: 'Boletim', assunto: 'Boletim semanal de [cliente]', corpo: 'Olá, {{primeiro_nome}}.\n\nOs destaques da semana no Congresso:\n\n1. \n2. \n3. \n\nAté a próxima,\n[assinatura]' }
  ];

  function chamar(corpo) {
    return P.sb.functions.invoke('enviar-emails', { body: corpo }).then(function (r) {
      if (!r.error) return r.data;
      var ctx = r.error.context;
      if (ctx && ctx.json) return ctx.json().then(function (j) { throw new Error(j.erro || r.error.message); }, function () { throw r.error; });
      throw new Error(/not found|404/i.test(r.error.message || '') ? 'A função enviar-emails ainda não foi publicada no Supabase.' : r.error.message);
    });
  }

  // ================= listas =================
  function renderListas() {
    var painel = $('painel-listas');
    if (G.semCliente(painel)) return;
    painel.replaceChildren(el('p', { class: 'discreto', text: 'Carregando listas…' }));
    Promise.all([P.tabela('listas_email').listar({ ordem: 'nome' }), P.tabela('lista_membros').listar({ campos: 'id, lista_id, nome, email, tratamento' }), P.tabela('descadastros').listar().catch(function () { return []; })]).then(function (r) {
      var listas = r[0], membros = r[1], fora = {};
      r[2].forEach(function (d) { fora[d.email.toLowerCase()] = true; });
      painel.replaceChildren(
        G.cabecalho('Listas de e-mail', 'Grupos de destinatários do cliente. Monte a partir de parlamentares (Deputados, Senadores), de contatos ou de uma planilha.', [
          G.botao('Nova lista', function () { editarLista(null); }),
          G.botao('Lista de parlamentares', function () { P.irPara('?secao=deputados'); }, 'botao-linha')
        ]),
        listas.length ? el('ul', { class: 'lista' }, listas.map(function (l) {
          var deles = membros.filter(function (m) { return m.lista_id === l.id; });
          var descad = deles.filter(function (m) { return fora[m.email.toLowerCase()]; }).length;
          var detalhes = el('div', { class: 'membros', hidden: '' });
          return el('li', { class: 'item' }, [
            el('h2', { text: l.nome }),
            l.descricao ? el('p', { class: 'resumo', text: l.descricao }) : null,
            el('p', { class: 'discreto', text: deles.length + ' destinatários' + (descad ? ' · ' + descad + ' descadastrados (não recebem)' : '') }),
            el('div', { class: 'item-acoes' }, [
              el('button', { type: 'button', text: 'Ver destinatários', onclick: function () { detalhes.hidden = !detalhes.hidden; if (!detalhes.hidden) desenharMembros(detalhes, l, deles, fora); } }),
              el('button', { type: 'button', text: 'Adicionar e-mails', onclick: function () { adicionarMembros(l); } }),
              el('button', { type: 'button', text: 'Importar planilha', onclick: function () { importarMembros(l); } }),
              el('button', { type: 'button', text: 'Baixar', onclick: function () { G.baixarCsv('lista-' + l.nome.replace(/\W+/g, '-') + '.csv', deles, [{ rotulo: 'Nome', valor: 'nome' }, { rotulo: 'E-mail', valor: 'email' }, { rotulo: 'Tratamento', valor: 'tratamento' }]); } }),
              el('button', { type: 'button', text: 'Editar', onclick: function () { editarLista(l); } }),
              el('button', { type: 'button', class: 'acao-forte', text: 'Escrever e-mail', onclick: function () { novaCampanha(l.id); } })
            ]),
            detalhes
          ]);
        })) : el('p', { class: 'vazio', text: 'Nenhuma lista ainda.' })
      );
    }, function (e) { painel.replaceChildren(el('p', { class: 'vazio', text: G.erroAmigavel(e) })); });
  }
  function desenharMembros(caixa, l, deles, fora) {
    caixa.replaceChildren(el('ul', { class: 'lista-simples' }, deles.length ? deles.map(function (m) {
      return el('li', {}, [el('span', { text: (m.tratamento ? m.tratamento + ' ' : '') + (m.nome || '') + ' <' + m.email + '>' + (fora[m.email.toLowerCase()] ? ' (descadastrado)' : '') }),
        el('button', { type: 'button', class: 'botao-texto', text: 'Tirar', onclick: function () { P.tabela('lista_membros').apagar(m.id).then(renderListas); } })]);
    }) : [el('li', { class: 'vazio', text: 'Lista vazia.' })]));
  }
  function editarLista(l) {
    G.formulario({
      titulo: l ? 'Editar lista' : 'Nova lista', campos: [{ nome: 'nome', rotulo: 'Nome', obrigatorio: true }, { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea', linhas: 2 }],
      valores: l || {},
      aoSalvar: function (v) { return (l ? P.tabela('listas_email').atualizar(l.id, v) : P.tabela('listas_email').inserir(v)).then(renderListas); },
      aoApagar: l ? function () { return P.tabela('listas_email').apagar(l.id).then(renderListas); } : null
    });
  }
  function adicionarMembros(l) {
    G.formulario({
      titulo: 'Adicionar a ' + l.nome,
      campos: [{ nome: 'texto', rotulo: 'E-mails', tipo: 'textarea', linhas: 6, obrigatorio: true, ajuda: 'Um por linha. Pode ser só o e-mail ou "Nome <email@dominio>".' },
        { nome: 'tratamento', rotulo: 'Tratamento (opcional)', placeholder: 'Ex.: Senhor(a), Deputado(a)' }],
      aoSalvar: function (v) {
        var novos = v.texto.split(/\n|;/).map(function (linha) {
          var m = linha.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/) || [null, '', linha.trim()];
          return { lista_id: l.id, nome: m[1].trim() || null, email: m[2].trim().toLowerCase(), tratamento: v.tratamento, origem: 'manual' };
        }).filter(function (x) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email); });
        if (!novos.length) throw new Error('Nenhum e-mail válido.');
        return P.tabela('lista_membros').inserirVarios(novos).then(function (n) { P.avisar(n + ' adicionados'); renderListas(); });
      }
    });
  }
  function importarMembros(l) {
    G.escolherArquivo().then(function (texto) {
      var novos = G.lerCsv(texto).map(function (o) {
        return { lista_id: l.id, nome: o.nome || o.name || null, email: String(o['e-mail'] || o.email || '').trim().toLowerCase(), tratamento: o.tratamento || null, origem: 'planilha' };
      }).filter(function (x) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email); });
      if (!novos.length) { P.avisar('A planilha precisa de uma coluna "email"'); return; }
      P.tabela('lista_membros').inserirVarios(novos).then(function (n) { P.avisar(n + ' importados'); renderListas(); }, function (e) { P.avisar(G.erroAmigavel(e)); });
    });
  }

  // ================= campanhas =================
  function renderEmails() {
    var painel = $('painel-emails');
    if (G.semCliente(painel)) return;
    painel.replaceChildren(el('p', { class: 'discreto', text: 'Carregando…' }));
    Promise.all([P.tabela('campanhas_email').listar({ ordem: 'criado_em', desc: true }), P.tabela('listas_email').listar({ ordem: 'nome' })]).then(function (r) {
      var camps = r[0], listas = r[1];
      var nomeLista = function (id) { var l = listas.find(function (x) { return x.id === id; }); return l ? l.nome : 'lista apagada'; };
      painel.replaceChildren.apply(painel, [
        G.cabecalho('Envio de e-mails', G.podeEnviar() ? 'Escreva para uma lista inteira de uma vez. Cada pessoa recebe um e-mail individual, com o próprio nome.' :
          'Você pode preparar rascunhos. O envio precisa da liberação de um coordenador.', [
          G.botao('Novo e-mail', function () { novaCampanha(listas[0] && listas[0].id); }),
          G.botao('Listas', function () { P.irPara('?secao=listas'); }, 'botao-linha')
        ]),
        P.estado.demo ? el('p', { class: 'faixa-demo', text: 'No modo de teste dá para montar listas e rascunhos, mas o envio só funciona com login.' }) : null,
        camps.length ? el('ul', { class: 'lista' }, camps.map(function (c) {
          return el('li', { class: 'item' }, [
            el('div', { class: 'item-topo' }, [el('span', { class: 'tema', text: STATUS[c.status] || c.status }), el('span', { text: G.dataHora(c.enviado_em || c.criado_em) })]),
            el('h2', { text: c.assunto }),
            el('p', { class: 'discreto', text: 'Para: ' + nomeLista(c.lista_id) + (c.total ? ' · ' + c.enviados + ' de ' + c.total + ' enviados' + (c.falhas ? ' · ' + c.falhas + ' falhas' : '') : '') }),
            el('div', { class: 'item-acoes' }, [
              c.status === 'rascunho' ? el('button', { type: 'button', class: 'acao-forte', text: 'Editar e enviar', onclick: function () { editarCampanha(c, listas); } })
                : el('button', { type: 'button', text: 'Ver relatório', onclick: function () { relatorioEnvio(c); } }),
              c.status === 'parcial' ? el('button', { type: 'button', class: 'acao-forte', text: 'Continuar envio', onclick: function () { enviar(c, this); } }) : null,
              el('button', { type: 'button', text: 'Duplicar', onclick: function () {
                P.tabela('campanhas_email').inserir({ assunto: c.assunto, corpo: c.corpo, lista_id: c.lista_id, remetente_nome: c.remetente_nome, responder_para: c.responder_para, status: 'rascunho' })
                  .then(renderEmails, function (e) { P.avisar(G.erroAmigavel(e)); });
              } })
            ])
          ]);
        })) : el('p', { class: 'vazio', text: 'Nenhum e-mail ainda.' })
      ].filter(Boolean));
    }, function (e) { painel.replaceChildren(el('p', { class: 'vazio', text: G.erroAmigavel(e) })); });
  }
  function novaCampanha(listaId) {
    P.tabela('listas_email').listar({ ordem: 'nome' }).then(function (listas) {
      editarCampanha({ lista_id: listaId || (listas[0] && listas[0].id) || '', remetente_nome: P.nomeCliente(P.estado.cliente) || 'Panorama', status: 'rascunho',
        responder_para: (P.estado.perfil && P.estado.perfil.email) || '' }, listas);
    }, function (e) { P.avisar(G.erroAmigavel(e)); });
  }
  function editarCampanha(c, listas) {
    if (P.estado.aba !== 'emails') P.irPara('?secao=emails');
    var campos = [
      { nome: 'modelo', rotulo: 'Começar de um modelo', tipo: 'select', opcoes: [{ valor: '', rotulo: 'Em branco' }].concat(MODELOS.map(function (m, i) { return { valor: String(i), rotulo: m.nome }; })) },
      { nome: 'lista_id', rotulo: 'Para a lista', tipo: 'select', obrigatorio: true, opcoes: listas.map(function (l) { return { valor: l.id, rotulo: l.nome }; }) },
      { nome: 'remetente_nome', rotulo: 'Nome do remetente', largura: 'meia' },
      { nome: 'responder_para', rotulo: 'Respostas para', tipo: 'email', largura: 'meia' },
      { nome: 'assunto', rotulo: 'Assunto', obrigatorio: true },
      { nome: 'corpo', rotulo: 'Texto', tipo: 'textarea', linhas: 12, obrigatorio: true, ajuda: 'Use {{nome}}, {{primeiro_nome}} e {{tratamento}} para personalizar. Links viram clicáveis. O rodapé de descadastro entra sozinho.' }
    ];
    if (!listas.length) { P.avisar('Crie uma lista de e-mail primeiro'); P.irPara('?secao=listas'); return; }
    G.formulario({
      titulo: c.id ? 'Editar e-mail' : 'Novo e-mail', campos: campos, valores: c, botao: 'Salvar rascunho',
      aoSalvar: function (v) {
        delete v.modelo;
        v.status = 'rascunho';
        var feito = c.id ? P.tabela('campanhas_email').atualizar(c.id, v).then(function () { return Object.assign(c, v); }) : P.tabela('campanhas_email').inserir(v);
        return feito.then(function (salva) { P.avisar('Rascunho salvo'); renderEmails(); setTimeout(function () { confirmarEnvio(salva, listas); }, 50); });
      },
      aoApagar: c.id ? function () { return P.tabela('campanhas_email').apagar(c.id).then(renderEmails); } : null
    });
    var sel = $('dfc-modelo');
    sel.addEventListener('change', function () {
      var m = MODELOS[+sel.value]; if (!m) return;
      $('dfc-assunto').value = m.assunto; $('dfc-corpo').value = m.corpo;
    });
  }
  // Depois de salvar o rascunho: prévia, teste e envio
  function confirmarEnvio(c, listas) {
    var lista = listas.find(function (l) { return l.id === c.lista_id; });
    Promise.all([P.tabela('lista_membros').listar({ onde: { lista_id: c.lista_id }, campos: 'nome, email, tratamento' }), P.tabela('descadastros').listar().catch(function () { return []; })]).then(function (r) {
      var fora = {}; r[1].forEach(function (d) { fora[d.email.toLowerCase()] = true; });
      var vistos = {}, validos = r[0].filter(function (m) { var e = m.email.toLowerCase(); if (fora[e] || vistos[e]) return false; vistos[e] = true; return true; });
      var ex = validos[0] || { nome: 'Fulano de Tal', tratamento: 'Deputado(a)', email: 'exemplo@camara.leg.br' };
      var preencher = function (t) { return t.replace(/\{\{\s*nome\s*\}\}/gi, ex.nome || '').replace(/\{\{\s*primeiro_nome\s*\}\}/gi, (ex.nome || '').split(' ')[0]).replace(/\{\{\s*tratamento\s*\}\}/gi, ex.tratamento || '').replace(/\{\{\s*email\s*\}\}/gi, ex.email).replace(/[ \t]{2,}/g, ' '); };
      G.formulario({
        titulo: 'Enviar para ' + validos.length + ' ' + (validos.length === 1 ? 'pessoa' : 'pessoas') + ' (' + (lista ? lista.nome : '') + ')',
        campos: [{ nome: 'previa', rotulo: 'Prévia para ' + (ex.nome || ex.email), tipo: 'textarea', linhas: 12 },
          { nome: 'teste', rotulo: 'Mandar só um teste para o meu e-mail', tipo: 'checkbox' }],
        valores: { previa: 'Assunto: ' + preencher(c.assunto) + '\n\n' + preencher(c.corpo), teste: true },
        botao: 'Enviar',
        aoSalvar: function (v) {
          if (P.estado.demo) throw new Error('No modo de teste o envio fica desligado. Entre com login para enviar.');
          if (!G.podeEnviar()) throw new Error('Você ainda não tem permissão para enviar. Peça a um coordenador.');
          if (v.teste) return chamar({ campanha_id: c.id, teste: true }).then(function (j) { P.avisar('Teste enviado para ' + j.teste); });
          if (!validos.length) throw new Error('A lista não tem destinatários.');
          return enviar(c);
        }
      });
    });
  }
  function enviar(c, botao) {
    if (botao) botao.disabled = true;
    P.avisar('Enviando… pode levar alguns minutos em listas grandes');
    return chamar({ campanha_id: c.id }).then(function (j) {
      P.avisar(j.status === 'parcial' ? j.enviados + ' enviados; faltam ' + j.restantes + '. Toque em "Continuar envio".' : j.enviados + ' e-mails enviados' + (j.falhas ? ', ' + j.falhas + ' falhas' : ''));
      renderEmails();
    }, function (e) { if (botao) botao.disabled = false; P.avisar(e.message || 'Falha no envio'); renderEmails(); throw e; });
  }
  function relatorioEnvio(c) {
    P.tabela('envios_email').listar({ onde: { campanha_id: c.id }, ordem: 'enviado_em' }).then(function (l) {
      G.formulario({
        titulo: c.assunto,
        campos: [{ nome: 'r', rotulo: c.enviados + ' enviados · ' + c.falhas + ' falhas', tipo: 'textarea', linhas: 14 }],
        valores: { r: l.map(function (x) { return (x.status === 'enviado' ? '✓ ' : '✗ ') + (x.nome ? x.nome + ' ' : '') + '<' + x.email + '>' + (x.erro ? ' · ' + x.erro : ''); }).join('\n') || 'Sem registros.' },
        botao: 'Fechar', aoSalvar: function () {}
      });
    });
  }

  return {
    aoAbrirAba: function (nome) { if (nome === 'emails') renderEmails(); if (nome === 'listas') renderListas(); },
    aoTrocarCliente: function () { if (P.estado.aba === 'emails') renderEmails(); if (P.estado.aba === 'listas') renderListas(); }
  };
});
