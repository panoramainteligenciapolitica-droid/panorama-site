// Comunicação em massa: listas de e-mail do cliente e campanhas enviadas pela função enviar-emails.
// Os e-mails saem pela conta Gmail ou Outlook que a pessoa conectou (Configurações > Minha conta, função conta-email)
// ou, sem conta conectada, pelo servidor do app (Resend).
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

  var PROVEDOR = { google: 'Gmail', microsoft: 'Outlook' };
  var LIMITES = 'Limites de cada serviço: Gmail pessoal, cerca de 500 destinatários por dia (Google Workspace, 2.000); Outlook.com/Hotmail, 300 por dia; Microsoft 365, 10.000 por dia e até 30 por minuto. Listas grandes podem levar alguns minutos.';

  function chamarFuncao(nome, corpo) { return P.chamarFuncao(nome, corpo); }
  function chamar(corpo) { return chamarFuncao('enviar-emails', corpo); }
  // Envio que ficou "Enviando" há mais de 10 minutos: a função caiu no meio e pode continuar de onde parou
  function parado(c) { return c.status === 'enviando' && (!c.envio_iniciado_em || Date.now() - new Date(c.envio_iniciado_em).getTime() > 10 * 60e3); }

  // Grava só os e-mails que ainda não estão na lista (um repetido não pode barrar o lote inteiro)
  function gravarMembros(l, novos) {
    return P.tabela('lista_membros').listar({ onde: { lista_id: l.id }, campos: 'id, email', limite: 50000 }).then(function (atuais) {
      var ja = {}, n = 0;
      atuais.forEach(function (m) { ja[m.email.toLowerCase()] = true; });
      var gravar = novos.filter(function (m) { if (ja[m.email]) return false; ja[m.email] = true; return true; });
      n = novos.length - gravar.length;
      return P.tabela('lista_membros').inserirVarios(gravar).then(function (q) {
        P.avisar(q + (q === 1 ? ' adicionado' : ' adicionados') + (n ? ' · ' + n + ' já estavam na lista' : ''));
        renderListas();
      });
    });
  }

  // ================= conta de e-mail própria (Gmail / Outlook) =================
  var conta = { carregada: false, dados: null };
  function carregarContaEmail() {
    if (P.estado.demo || !P.estado.sessao) { conta = { carregada: true, dados: null }; return Promise.resolve(null); }
    return P.sb.rpc('minha_conta_email').then(function (r) {
      conta = { carregada: true, dados: (!r.error && r.data && r.data[0]) || null, erro: r.error };
      return conta.dados;
    });
  }
  function descreverConta(d) { return d.email + ' (' + (PROVEDOR[d.provedor] || d.provedor) + ')'; }

  // Volta do Google/Microsoft: ?config=1&conta_email=ok|erro&msg=...
  var retorno = (function () {
    var q = new URLSearchParams(location.search);
    if (!q.get('conta_email')) return null;
    var r = { ok: q.get('conta_email') === 'ok', msg: q.get('msg') || '' };
    try { history.replaceState(null, '', './?config=1'); } catch (e) { /* segue */ }
    return r;
  })();

  function conectar(provedor, botao) {
    botao.disabled = true;
    var voltar = /^https?:/.test(location.protocol) ? location.origin + location.pathname + '?config=1' : '';
    chamarFuncao('conta-email', { acao: 'iniciar', provedor: provedor, voltar: voltar }).then(function (j) {
      if (window.PanoramaDesktop || !/^https?:/.test(location.protocol)) {
        // No programa para Windows a autorização abre no navegador; ao voltar para o programa, o status é atualizado
        window.open(j.url, '_blank');
        botao.disabled = false;
        renderMinhaContaEmail('Conclua a autorização no navegador que abriu e depois volte para cá.');
      } else location.href = j.url;
    }, function (e) { botao.disabled = false; renderMinhaContaEmail(e.message, true); });
  }

  function renderMinhaContaEmail(aviso, ehErro) {
    var caixa = $('minha-conta-email');
    if (!caixa) return;
    var titulo = el('h2', { text: 'Meu e-mail para envios' });
    if (P.estado.demo) { caixa.replaceChildren(titulo, el('p', { class: 'discreto', text: 'Disponível só com login.' })); return; }
    var msg = aviso ? el('p', { class: 'mensagem' + (ehErro ? ' erro' : ''), role: 'status', text: aviso }) : null;
    var d = conta.dados;
    if (conta.erro) {
      caixa.replaceChildren(titulo, el('p', { class: 'mensagem erro', text: /function|schema cache|does not exist/i.test(conta.erro.message || '') ?
        'O banco ainda não tem esta função. Peça ao master para rodar o arquivo contas-email.sql no Supabase.' : 'Não foi possível ler sua conta de e-mail.' }));
      return;
    }
    var bGoogle = el('button', { type: 'button', class: 'botao botao-pequeno', text: d ? 'Trocar para Gmail' : 'Conectar Gmail', onclick: function () { conectar('google', bGoogle); } });
    var bMs = el('button', { type: 'button', class: 'botao botao-pequeno' + (d ? ' botao-linha' : ''), text: d ? 'Trocar para Outlook' : 'Conectar Outlook / Microsoft 365', onclick: function () { conectar('microsoft', bMs); } });
    if (d) bGoogle.classList.add('botao-linha');
    var bSair = d ? el('button', { type: 'button', class: 'botao-texto', text: 'Desconectar', onclick: function () {
      var b = this;
      if (!b.dataset.confirmando) { b.dataset.confirmando = '1'; b.textContent = 'Toque de novo para desconectar'; setTimeout(function () { delete b.dataset.confirmando; b.textContent = 'Desconectar'; }, 3500); return; }
      b.disabled = true;
      chamarFuncao('conta-email', { acao: 'desconectar' }).catch(function () { return P.sb.rpc('desconectar_conta_email'); })
        .then(carregarContaEmail).then(function () { renderMinhaContaEmail('Conta desconectada. Os envios voltam a sair pelo servidor do app.'); });
    } }) : null;
    caixa.replaceChildren.apply(caixa, [titulo,
      d ? el('p', {}, [el('strong', { text: 'Conectado: ' }), el('span', { text: descreverConta(d) })])
        : el('p', { text: 'Conecte sua conta Gmail ou Outlook para que os e-mails que você manda pelo app (envio em massa, testes) saiam do seu próprio endereço, com as respostas chegando na sua caixa e cópia em Enviados.' }),
      d ? el('p', { class: 'discreto', text: 'Os e-mails que você enviar pelo app saem por esta conta. Conectado em ' + new Date(d.conectado_em).toLocaleDateString('pt-BR') + (d.usado_em ? ' · último envio em ' + new Date(d.usado_em).toLocaleString('pt-BR') : '') + '.' }) : null,
      msg,
      el('div', { class: 'acoes' }, [bGoogle, bMs, bSair]),
      el('p', { class: 'discreto', text: 'O app pede só a permissão de enviar e-mails: ele não lê a sua caixa de entrada. A senha da conta não passa pelo app, e você pode desconectar quando quiser (aqui ou nas configurações de segurança do Google/Microsoft). ' + LIMITES })
    ].filter(Boolean));
  }
  document.addEventListener('panorama-config', function () {
    var r = retorno; retorno = null;
    renderMinhaContaEmail();
    carregarContaEmail().then(function () { renderMinhaContaEmail(r && r.msg, r && !r.ok); });
  });
  // Ao voltar do navegador (programa para Windows) ou de outra aba, atualiza o status
  window.addEventListener('focus', function () {
    if (P.estado.sessao && !P.estado.demo && $('minha-conta-email') && !$('tela-config').hidden) carregarContaEmail().then(function () { renderMinhaContaEmail(); });
  });

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
        }).filter(function (x) { return P.emailValido(x.email); });
        if (!novos.length) throw new Error('Nenhum e-mail válido.');
        return gravarMembros(l, novos);
      }
    });
  }
  function importarMembros(l) {
    G.escolherArquivo().then(function (texto) {
      var novos = G.lerCsv(texto).map(function (o) {
        return { lista_id: l.id, nome: o.nome || o.name || null, email: String(o['e-mail'] || o.email || '').trim().toLowerCase(), tratamento: o.tratamento || null, origem: 'planilha' };
      }).filter(function (x) { return P.emailValido(x.email); });
      if (!novos.length) { P.avisar('A planilha precisa de uma coluna "email"'); return; }
      gravarMembros(l, novos).catch(function (e) { P.avisar(G.erroAmigavel(e)); });
    });
  }

  // ================= campanhas =================
  function renderEmails() {
    var painel = $('painel-emails');
    if (G.semCliente(painel)) return;
    painel.replaceChildren(el('p', { class: 'discreto', text: 'Carregando…' }));
    Promise.all([P.tabela('campanhas_email').listar({ ordem: 'criado_em', desc: true }), P.tabela('listas_email').listar({ ordem: 'nome' }), carregarContaEmail().catch(function () { return null; })]).then(function (r) {
      var camps = r[0], listas = r[1], d = r[2];
      var porOnde = P.estado.demo ? null : el('p', { class: 'discreto' }, d ? [el('span', { text: 'Seus envios saem por ' + descreverConta(d) + '. ' }), el('a', { href: '?config=1', text: 'Trocar', onclick: function (ev) { ev.preventDefault(); P.irPara('?config=1'); } })]
        : [el('span', { text: 'Seus envios saem pelo servidor do app. ' }), el('a', { href: '?config=1', text: 'Conectar meu Gmail ou Outlook', onclick: function (ev) { ev.preventDefault(); P.irPara('?config=1'); } })]);
      var nomeLista = function (id) { var l = listas.find(function (x) { return x.id === id; }); return l ? l.nome : 'lista apagada'; };
      painel.replaceChildren.apply(painel, [
        G.cabecalho('Envio de e-mails', G.podeEnviar() ? 'Escreva para uma lista inteira de uma vez. Cada pessoa recebe um e-mail individual, com o próprio nome.' :
          'Você pode preparar rascunhos. O envio precisa da liberação de um coordenador.', [
          G.botao('Novo e-mail', function () { novaCampanha(listas[0] && listas[0].id); }),
          G.botao('Listas', function () { P.irPara('?secao=listas'); }, 'botao-linha')
        ]),
        P.estado.demo ? el('p', { class: 'faixa-demo', text: 'No modo de teste dá para montar listas e rascunhos, mas o envio só funciona com login.' }) : porOnde,
        camps.length ? el('ul', { class: 'lista' }, camps.map(function (c) {
          return el('li', { class: 'item' }, [
            el('div', { class: 'item-topo' }, [el('span', { class: 'tema', text: STATUS[c.status] || c.status }), el('span', { text: G.dataHora(c.enviado_em || c.criado_em) })]),
            el('h2', { text: c.assunto }),
            el('p', { class: 'discreto', text: 'Para: ' + nomeLista(c.lista_id) + (c.total ? ' · ' + c.enviados + ' de ' + c.total + ' enviados' + (c.falhas ? ' · ' + c.falhas + ' falhas' : '') : '') + (c.enviado_por ? ' · por ' + c.enviado_por : '') }),
            el('div', { class: 'item-acoes' }, [
              c.status === 'rascunho' ? el('button', { type: 'button', class: 'acao-forte', text: 'Editar e enviar', onclick: function () { editarCampanha(c, listas); } })
                : el('button', { type: 'button', text: 'Ver relatório', onclick: function () { relatorioEnvio(c); } }),
              c.status === 'parcial' || c.status === 'erro' || parado(c) ? el('button', { type: 'button', class: 'acao-forte', text: 'Continuar envio', onclick: function () { enviar(c, this, /^Servidor/.test(c.enviado_por || '') ? 'resend' : undefined).catch(function () {}); } }) : null,
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
    Promise.all([P.tabela('lista_membros').listar({ onde: { lista_id: c.lista_id }, campos: 'nome, email, tratamento' }), P.tabela('descadastros').listar().catch(function () { return []; }), carregarContaEmail().catch(function () { return null; })]).then(function (r) {
      var d = r[2];
      var fora = {}; r[1].forEach(function (d) { fora[d.email.toLowerCase()] = true; });
      var vistos = {}, validos = r[0].filter(function (m) { var e = m.email.trim().toLowerCase(); if (!P.emailValido(e) || fora[e] || vistos[e]) return false; vistos[e] = true; return true; });
      var ex = validos[0] || { nome: 'Fulano de Tal', tratamento: 'Deputado(a)', email: 'exemplo@camara.leg.br' };
      var preencher = function (t) { return t.replace(/\{\{\s*nome\s*\}\}/gi, ex.nome || '').replace(/\{\{\s*primeiro_nome\s*\}\}/gi, (ex.nome || '').split(' ')[0]).replace(/\{\{\s*tratamento\s*\}\}/gi, ex.tratamento || '').replace(/\{\{\s*email\s*\}\}/gi, ex.email).replace(/[ \t]{2,}/g, ' '); };
      G.formulario({
        titulo: 'Enviar para ' + validos.length + ' ' + (validos.length === 1 ? 'pessoa' : 'pessoas') + ' (' + (lista ? lista.nome : '') + ')',
        campos: [{ nome: 'previa', rotulo: 'Prévia para ' + (ex.nome || ex.email) + ' (para mudar o texto, feche e edite o rascunho)', tipo: 'textarea', linhas: 12, somenteLeitura: true },
          d ? { nome: 'via', rotulo: 'Enviar por', tipo: 'select', opcoes: [{ valor: 'conta', rotulo: 'Minha conta: ' + descreverConta(d) }, { valor: 'resend', rotulo: 'Servidor do app (Resend)' }],
            ajuda: LIMITES } : { nome: 'via', rotulo: 'Enviar por', tipo: 'select', opcoes: [{ valor: 'resend', rotulo: 'Servidor do app (Resend)' }], ajuda: 'Para enviar do seu próprio endereço, conecte seu Gmail ou Outlook em Configurações > Minha conta.' },
          { nome: 'teste', rotulo: 'Mandar só um teste para o meu e-mail', tipo: 'checkbox' }],
        valores: { previa: 'Assunto: ' + preencher(c.assunto) + '\n\n' + preencher(c.corpo), teste: true, via: d ? 'conta' : 'resend' },
        botao: 'Enviar',
        aoSalvar: function (v) {
          if (P.estado.demo) throw new Error('No modo de teste o envio fica desligado. Entre com login para enviar.');
          if (!G.podeEnviar()) throw new Error('Você ainda não tem permissão para enviar. Peça a um coordenador.');
          if (v.teste) return chamar({ campanha_id: c.id, teste: true, via: v.via }).then(function (j) { P.avisar('Teste enviado para ' + j.teste + (j.enviado_por ? ' por ' + j.enviado_por : '')); });
          if (!validos.length) throw new Error('A lista não tem destinatários.');
          enviar(c, null, v.via).catch(function () {});
        }
      });
    });
  }
  // Envia e, se o tempo de uma chamada acabar, continua sozinho até terminar (ou até o limite do Gmail/Outlook)
  function enviar(c, botao, via) {
    if (botao) botao.disabled = true;
    P.avisar('Enviando… pode levar alguns minutos em listas grandes');
    var rodadas = 0;
    function rodada() {
      return chamar({ campanha_id: c.id, via: via }).then(function (j) {
        rodadas++;
        if (j.status === 'parcial' && !j.aviso && j.restantes > 0 && rodadas < 60) {
          P.avisar(j.enviados + ' de ' + j.total + ' enviados… continuando');
          if (P.estado.aba === 'emails') renderEmails();
          return rodada();
        }
        if (j.aviso) P.avisar(j.aviso + ' (' + j.enviados + ' de ' + j.total + ' enviados; use "Continuar envio" depois.)');
        else P.avisar(j.status === 'parcial' ? j.enviados + ' enviados; faltam ' + j.restantes + '. Toque em "Continuar envio".' : j.enviados + ' e-mails enviados' + (j.falhas ? ', ' + j.falhas + ' falhas' : ''));
        renderEmails();
        return j;
      });
    }
    return rodada().catch(function (e) { if (botao) botao.disabled = false; P.avisar(e.message || 'Falha no envio'); renderEmails(); throw e; });
  }
  function relatorioEnvio(c) {
    P.tabela('envios_email').listar({ onde: { campanha_id: c.id }, ordem: 'enviado_em' }).then(function (l) {
      G.formulario({
        titulo: c.assunto,
        campos: [{ nome: 'r', rotulo: c.enviados + ' enviados · ' + c.falhas + ' falhas' + (c.enviado_por ? ' · por ' + c.enviado_por : ''), tipo: 'textarea', linhas: 14, somenteLeitura: true }],
        valores: { r: l.map(function (x) { return (x.status === 'enviado' ? '✓ ' : '✗ ') + (x.nome ? x.nome + ' ' : '') + '<' + x.email + '>' + (x.erro ? ' · ' + x.erro : ''); }).join('\n') || 'Sem registros.' },
        botao: 'Fechar', aoSalvar: function () {}
      });
    });
  }

  // Outras telas (alerta, nota técnica, relatório) abrem um rascunho de e-mail já preenchido
  window.PanoramaEmails = {
    escrever: function (v) {
      if (!G.podeEnviar || !G.podeEnviar()) { P.avisar('Seu perfil não envia e-mails por este cliente'); return; }
      P.tabela('listas_email').listar({ ordem: 'nome' }).then(function (listas) {
        editarCampanha(Object.assign({ lista_id: (listas[0] && listas[0].id) || '', remetente_nome: P.nomeCliente(P.estado.cliente) || 'Panorama', status: 'rascunho',
          responder_para: (P.estado.perfil && P.estado.perfil.email) || '' }, v || {}), listas);
      }, function (e) { P.avisar(G.erroAmigavel(e)); });
    }
  };

  return {
    aoAbrirAba: function (nome) { if (nome === 'emails') renderEmails(); if (nome === 'listas') renderListas(); },
    aoTrocarCliente: function () { if (P.estado.aba === 'emails') renderEmails(); if (P.estado.aba === 'listas') renderListas(); }
  };
});
