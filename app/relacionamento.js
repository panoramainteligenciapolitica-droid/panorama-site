// Relacionamento do cliente: contatos (stakeholders), reuniões e interações, tarefas e prazos.
(window.PanoramaModulos = window.PanoramaModulos || []).push(function (P) {
  'use strict';

  var $ = P.$, el = P.el, G = window.PanoramaRG, R = G.R;
  var filtros = { contatos: { texto: '', tipo: '' }, interacoes: { quando: 'todas', texto: '' }, tarefas: { feitas: false } };

  function parametros() { return new URLSearchParams(P.estado.busca !== null && P.estado.busca !== undefined ? P.estado.busca : location.search); }
  function falhou(painel, e) { painel.replaceChildren(el('p', { class: 'vazio', text: G.erroAmigavel(e) })); }
  function opcoesProps(props) {
    return [{ valor: '', rotulo: 'Nenhuma' }].concat(props.map(function (p) { return { valor: p.id, rotulo: G.identProp(p) + ' · ' + String(p.ementa || '').slice(0, 70) }; }));
  }

  // ================= contatos =================
  var CAMPOS_CONTATO = [
    { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
    { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: G.opcoesDe(R.TIPOS_CONTATO), largura: 'meia' },
    { nome: 'cargo', rotulo: 'Cargo', largura: 'meia', placeholder: 'Ex.: Chefe de gabinete' },
    { nome: 'orgao', rotulo: 'Órgão ou entidade', placeholder: 'Ex.: Gabinete Dep. Fulano, Ministério da Fazenda' },
    { nome: 'email', rotulo: 'E-mail', tipo: 'email', largura: 'meia' },
    { nome: 'telefone', rotulo: 'Telefone', tipo: 'tel', largura: 'meia' },
    { nome: 'partido', rotulo: 'Partido', largura: 'meia' },
    { nome: 'uf', rotulo: 'UF', largura: 'meia' },
    { nome: 'tags', rotulo: 'Etiquetas', placeholder: 'Separe por vírgula: tributário, base aliada' },
    { nome: 'notas', rotulo: 'Notas', tipo: 'textarea', linhas: 3 }
  ];
  function editarContato(c, depois) {
    G.formulario({
      titulo: c ? 'Editar contato' : 'Novo contato', campos: CAMPOS_CONTATO, valores: c || { tipo: 'assessor' },
      aoSalvar: function (v) { return (c ? P.tabela('contatos').atualizar(c.id, v) : P.tabela('contatos').inserir(v)).then(function () { P.avisar('Contato salvo'); depois(); }); },
      aoApagar: c ? function () { return P.tabela('contatos').apagar(c.id).then(depois); } : null
    });
  }
  function renderContatos() {
    var painel = $('painel-contatos');
    if (G.semCliente(painel)) return;
    painel.replaceChildren(el('p', { class: 'discreto', text: 'Carregando contatos…' }));
    P.tabela('contatos').listar({ ordem: 'nome' }).then(function (todos) {
      var f = filtros.contatos;
      var lista = el('ul', { class: 'lista' }), total = el('p', { class: 'discreto' });
      function filtrados() {
        var t = G.normalizar(f.texto);
        return todos.filter(function (c) {
          return (!f.tipo || c.tipo === f.tipo) && (!t || G.normalizar([c.nome, c.cargo, c.orgao, c.email, c.tags, c.partido, c.uf].join(' ')).indexOf(t) >= 0);
        });
      }
      function desenhar() {
        var l = filtrados();
        total.textContent = l.length + ' de ' + todos.length + ' contatos';
        lista.replaceChildren.apply(lista, l.length ? l.map(function (c) {
          return el('li', { class: 'item' }, [
            el('div', { class: 'item-topo' }, [el('span', { class: 'tema', text: R.TIPOS_CONTATO[c.tipo] || c.tipo }), c.partido ? el('span', { text: c.partido + (c.uf ? '/' + c.uf : '') }) : null]),
            el('h2', { text: c.nome }),
            c.cargo || c.orgao ? el('p', { class: 'resumo', text: [c.cargo, c.orgao].filter(Boolean).join(' · ') }) : null,
            el('p', { class: 'discreto' }, [c.email ? el('a', { href: 'mailto:' + c.email, text: c.email }) : null, c.email && c.telefone ? el('span', { text: ' · ' }) : null,
              c.telefone ? el('a', { href: 'tel:' + c.telefone.replace(/[^\d+]/g, ''), text: c.telefone }) : null]),
            c.tags ? el('div', { class: 'selos' }, c.tags.split(',').map(function (t) { return t.trim() ? G.selo(t.trim()) : null; })) : null,
            el('div', { class: 'item-acoes' }, [
              el('button', { type: 'button', text: 'Editar', onclick: function () { editarContato(c, renderContatos); } }),
              el('button', { type: 'button', text: 'Registrar reunião', onclick: function () { P.irPara('?secao=interacoes&novo=1&contato=' + c.id); } }),
              c.parlamentar_id ? el('button', { type: 'button', text: 'Perfil', onclick: function () { P.irPara('?parlamentar=' + c.casa + ':' + c.parlamentar_id); } }) : null
            ])
          ]);
        }) : [el('li', { class: 'vazio', text: todos.length ? 'Ninguém com esses filtros.' : 'Nenhum contato ainda. Cadastre, importe uma planilha ou adicione parlamentares pelo perfil.' })]);
      }
      var busca = el('input', { type: 'search', placeholder: 'Buscar por nome, órgão, e-mail ou etiqueta', 'aria-label': 'Buscar contatos' }); busca.value = f.texto;
      busca.addEventListener('input', function () { f.texto = busca.value; desenhar(); });
      var tipo = el('select', { 'aria-label': 'Tipo de contato' }, [el('option', { value: '', text: 'Todos os tipos' })].concat(G.opcoesDe(R.TIPOS_CONTATO).map(function (o) { return el('option', { value: o.valor, text: o.rotulo }); })));
      tipo.value = f.tipo; tipo.addEventListener('change', function () { f.tipo = tipo.value; desenhar(); });
      painel.replaceChildren(
        G.cabecalho('Contatos', 'Parlamentares, assessores, governo, reguladores, entidades e imprensa do cliente.', [
          G.botao('Novo contato', function () { editarContato(null, renderContatos); }),
          G.botao('Importar planilha', importarContatos, 'botao-linha'),
          G.botao('Baixar planilha', function () {
            G.baixarCsv('contatos.csv', filtrados(), CAMPOS_CONTATO.map(function (c) { return { rotulo: c.rotulo, valor: c.nome === 'tipo' ? function (x) { return R.TIPOS_CONTATO[x.tipo] || x.tipo; } : c.nome }; }));
          }, 'botao-linha'),
          G.botao('Criar lista de e-mail', function () { listaDeContatos(filtrados()); }, 'botao-linha')
        ]),
        el('div', { class: 'barra-filtros' }, [busca, tipo]), total, lista
      );
      desenhar();
    }, function (e) { falhou(painel, e); });
  }
  function importarContatos() {
    G.escolherArquivo().then(function (texto) {
      var linhas = G.lerCsv(texto);
      var pega = function (o, nomes) { for (var i = 0; i < nomes.length; i++) if (o[nomes[i]]) return o[nomes[i]]; return null; };
      var novos = linhas.map(function (o) {
        return { nome: pega(o, ['nome', 'name', 'nome completo']), email: pega(o, ['e-mail', 'email', 'correio']), telefone: pega(o, ['telefone', 'celular', 'fone']),
          cargo: pega(o, ['cargo', 'funcao']), orgao: pega(o, ['orgao', 'entidade', 'empresa', 'organizacao']), partido: pega(o, ['partido']), uf: pega(o, ['uf', 'estado']),
          tags: pega(o, ['etiquetas', 'tags']), notas: pega(o, ['notas', 'observacoes']), tipo: 'outro' };
      }).filter(function (c) { return c.nome; });
      if (!novos.length) { P.avisar('A planilha precisa de uma coluna "nome"'); return; }
      P.tabela('contatos').inserirVarios(novos).then(function (n) { P.avisar(n + ' contatos importados'); renderContatos(); }, function (e) { P.avisar(G.erroAmigavel(e)); });
    });
  }
  function listaDeContatos(contatos) {
    var com = contatos.filter(function (c) { return c.email; });
    if (!com.length) { P.avisar('Nenhum contato com e-mail nesse filtro'); return; }
    G.formulario({
      titulo: 'Criar lista com ' + com.length + ' contatos', campos: [{ nome: 'nome', rotulo: 'Nome da lista', obrigatorio: true }, { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea', linhas: 2 }],
      botao: 'Criar lista',
      aoSalvar: function (v) {
        return P.tabela('listas_email').inserir(v).then(function (l) {
          return P.tabela('lista_membros').inserirVarios(com.map(function (c) { return { lista_id: l.id, nome: c.nome, email: c.email, origem: 'contato:' + c.id }; }));
        }).then(function () { P.avisar('Lista criada'); });
      }
    });
  }

  // ================= reuniões e interações =================
  function editarInteracao(i, prontos, depois) {
    G.formulario({
      titulo: i ? 'Editar registro' : 'Registrar reunião ou interação',
      campos: [
        { nome: 'quando', rotulo: 'Data e hora', tipo: 'datetime-local', obrigatorio: true, largura: 'meia' },
        { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: G.opcoesDe(R.TIPOS_INTERACAO), largura: 'meia' },
        { nome: 'assunto', rotulo: 'Assunto', obrigatorio: true },
        { nome: 'contato_id', rotulo: 'Contato principal', tipo: 'select', opcoes: [{ valor: '', rotulo: 'Nenhum' }].concat(prontos.contatos.map(function (c) { return { valor: c.id, rotulo: c.nome + (c.orgao ? ' · ' + c.orgao : '') }; })) },
        { nome: 'participantes', rotulo: 'Participantes', placeholder: 'Quem esteve presente' },
        { nome: 'proposicao_id', rotulo: 'Proposição relacionada', tipo: 'select', opcoes: opcoesProps(prontos.props) },
        { nome: 'local', rotulo: 'Local', placeholder: 'Ex.: Gabinete 512, Anexo IV' },
        { nome: 'resumo', rotulo: 'Resumo e posicionamento manifestado', tipo: 'textarea', linhas: 4 },
        { nome: 'encaminhamentos', rotulo: 'Encaminhamentos', tipo: 'textarea', linhas: 3, ajuda: 'Viram tarefas? Crie em Tarefas e prazos.' }
      ],
      valores: i ? Object.assign({}, i, { quando: localInput(i.quando) }) : prontos.valores,
      aoSalvar: function (v) {
        if (v.contato_id && !v.participantes) { var c = prontos.contatos.find(function (x) { return x.id === v.contato_id; }); if (c) v.participantes = c.nome; }
        return (i ? P.tabela('interacoes').atualizar(i.id, v) : P.tabela('interacoes').inserir(v)).then(function () { P.avisar('Registro salvo'); depois(); });
      },
      aoApagar: i ? function () { return P.tabela('interacoes').apagar(i.id).then(depois); } : null
    });
  }
  function localInput(isoTexto) {
    var d = isoTexto ? new Date(isoTexto) : new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function renderInteracoes() {
    var painel = $('painel-interacoes');
    if (G.semCliente(painel)) return;
    painel.replaceChildren(el('p', { class: 'discreto', text: 'Carregando…' }));
    Promise.all([P.tabela('interacoes').listar({ ordem: 'quando', desc: true }), P.tabela('contatos').listar({ ordem: 'nome' }).catch(function () { return []; }), G.monitoradas().catch(function () { return []; })]).then(function (r) {
      var todas = r[0], prontos = { contatos: r[1], props: r[2] }, f = filtros.interacoes;
      var agora = new Date().toISOString();
      var nomeContato = function (id) { var c = prontos.contatos.find(function (x) { return x.id === id; }); return c ? c.nome : ''; };
      var prop = function (id) { var p = prontos.props.find(function (x) { return x.id === id; }); return p ? G.identProp(p) : ''; };
      var lista = el('ul', { class: 'lista' });
      function filtradas() {
        var t = G.normalizar(f.texto);
        return todas.filter(function (i) {
          return (f.quando === 'todas' || (f.quando === 'proximas' ? i.quando >= agora : i.quando < agora)) &&
            (!t || G.normalizar([i.assunto, i.participantes, i.resumo, i.encaminhamentos, nomeContato(i.contato_id)].join(' ')).indexOf(t) >= 0);
        });
      }
      function desenhar() {
        var l = filtradas();
        if (f.quando === 'proximas') l = l.slice().reverse();
        lista.replaceChildren.apply(lista, l.length ? l.map(function (i) {
          return el('li', { class: 'item' + (i.quando >= agora ? ' futura' : '') }, [
            el('div', { class: 'item-topo' }, [el('span', { class: 'tema', text: R.TIPOS_INTERACAO[i.tipo] || i.tipo }), el('span', { text: G.dataHora(i.quando) + (i.quando >= agora ? ' · agendada' : '') })]),
            el('h2', { text: i.assunto }),
            i.participantes || i.contato_id ? el('p', { class: 'discreto', text: 'Com: ' + (i.participantes || nomeContato(i.contato_id)) + (i.local ? ' · ' + i.local : '') }) : null,
            i.proposicao_id ? el('p', { class: 'discreto', text: 'Proposição: ' + prop(i.proposicao_id) }) : null,
            i.resumo ? el('p', { class: 'corpo', text: i.resumo }) : null,
            i.encaminhamentos ? el('p', {}, [el('b', { text: 'Encaminhamentos: ' }), el('span', { text: i.encaminhamentos })]) : null,
            el('div', { class: 'item-acoes' }, [
              el('button', { type: 'button', text: 'Editar', onclick: function () { editarInteracao(i, prontos, renderInteracoes); } }),
              el('button', { type: 'button', text: 'Criar tarefa', onclick: function () { P.irPara('?secao=tarefas&novo=1&titulo=' + encodeURIComponent('Retorno: ' + i.assunto)); } })
            ])
          ]);
        }) : [el('li', { class: 'vazio', text: todas.length ? 'Nada com esses filtros.' : 'Nenhuma reunião registrada ainda.' })]);
      }
      var busca = el('input', { type: 'search', placeholder: 'Buscar por assunto, participante ou conteúdo', 'aria-label': 'Buscar registros' }); busca.value = f.texto;
      busca.addEventListener('input', function () { f.texto = busca.value; desenhar(); });
      painel.replaceChildren(
        G.cabecalho('Reuniões e interações', 'Histórico de contatos com tomadores de decisão: reuniões, audiências, ligações e notas técnicas entregues.', [
          G.botao('Registrar', function () { editarInteracao(null, Object.assign({ valores: { quando: localInput(), tipo: 'reuniao' } }, prontos), renderInteracoes); }),
          G.botao('Baixar planilha', function () {
            G.baixarCsv('reunioes.csv', filtradas(), [{ rotulo: 'Data', valor: function (i) { return G.dataHora(i.quando); } }, { rotulo: 'Tipo', valor: function (i) { return R.TIPOS_INTERACAO[i.tipo] || i.tipo; } },
              { rotulo: 'Assunto', valor: 'assunto' }, { rotulo: 'Participantes', valor: function (i) { return i.participantes || nomeContato(i.contato_id); } }, { rotulo: 'Proposição', valor: function (i) { return prop(i.proposicao_id); } },
              { rotulo: 'Local', valor: 'local' }, { rotulo: 'Resumo', valor: 'resumo' }, { rotulo: 'Encaminhamentos', valor: 'encaminhamentos' }]);
          }, 'botao-linha')
        ]),
        el('div', { class: 'chips-filtro' }, [['todas', 'Todas'], ['proximas', 'Agendadas'], ['passadas', 'Realizadas']].map(function (q) {
          return el('button', { type: 'button', 'aria-pressed': String(f.quando === q[0]), text: q[1], onclick: function () { f.quando = q[0]; renderInteracoes(); } });
        })),
        el('div', { class: 'barra-filtros' }, [busca]), lista
      );
      desenhar();
      var q = parametros();
      if (q.get('novo')) {
        editarInteracao(null, Object.assign({ valores: { quando: localInput(), tipo: 'reuniao', participantes: q.get('participantes') || '', contato_id: q.get('contato') || '' } }, prontos), renderInteracoes);
        limparNovo('interacoes');
      }
    }, function (e) { falhou(painel, e); });
  }
  function limparNovo(secao) { P.estado.busca = '?secao=' + secao; try { history.replaceState(null, '', './?secao=' + secao); } catch (e) { /* segue */ } }

  // ================= tarefas e prazos =================
  function editarTarefa(t, props, depois, valores) {
    G.formulario({
      titulo: t ? 'Editar tarefa' : 'Nova tarefa',
      campos: [
        { nome: 'titulo', rotulo: 'O que fazer', obrigatorio: true },
        { nome: 'prazo', rotulo: 'Prazo', tipo: 'date', largura: 'meia' },
        { nome: 'prioridade', rotulo: 'Prioridade', tipo: 'select', opcoes: G.opcoesDe(R.PRIORIDADES), largura: 'meia' },
        { nome: 'responsavel', rotulo: 'Responsável', largura: 'meia' },
        { nome: 'status', rotulo: 'Situação', tipo: 'select', opcoes: G.opcoesDe(R.STATUS_TAREFA), largura: 'meia' },
        { nome: 'proposicao_id', rotulo: 'Proposição relacionada', tipo: 'select', opcoes: opcoesProps(props) },
        { nome: 'notas', rotulo: 'Notas', tipo: 'textarea', linhas: 3 }
      ],
      valores: t || Object.assign({ prioridade: 'media', status: 'aberta', responsavel: (P.estado.perfil && (P.estado.perfil.nome || P.estado.perfil.email)) || '' }, valores || {}),
      aoSalvar: function (v) {
        v.concluida_em = v.status === 'feita' ? (t && t.concluida_em) || new Date().toISOString() : null;
        return (t ? P.tabela('tarefas').atualizar(t.id, v) : P.tabela('tarefas').inserir(v)).then(function () { P.avisar('Tarefa salva'); depois(); });
      },
      aoApagar: t ? function () { return P.tabela('tarefas').apagar(t.id).then(depois); } : null
    });
  }
  function renderTarefas() {
    var painel = $('painel-tarefas');
    if (G.semCliente(painel)) return;
    painel.replaceChildren(el('p', { class: 'discreto', text: 'Carregando…' }));
    Promise.all([P.tabela('tarefas').listar({ ordem: 'prazo' }), G.monitoradas().catch(function () { return []; })]).then(function (r) {
      var todas = r[0], props = r[1], hoje = G.hojeIso(), em7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
      var prop = function (id) { var p = props.find(function (x) { return x.id === id; }); return p ? G.identProp(p) : ''; };
      var grupos = [
        ['Atrasadas', function (t) { return t.status !== 'feita' && t.prazo && t.prazo < hoje; }, 'atrasada'],
        ['Próximos 7 dias', function (t) { return t.status !== 'feita' && t.prazo && t.prazo >= hoje && t.prazo <= em7; }, ''],
        ['Depois', function (t) { return t.status !== 'feita' && t.prazo && t.prazo > em7; }, ''],
        ['Sem prazo', function (t) { return t.status !== 'feita' && !t.prazo; }, ''],
        ['Feitas', function (t) { return t.status === 'feita'; }, 'feita']
      ].filter(function (g) { return g[0] !== 'Feitas' || filtros.tarefas.feitas; });
      var abertas = todas.filter(function (t) { return t.status !== 'feita'; }).length;
      painel.replaceChildren(
        G.cabecalho('Tarefas e prazos', abertas + (abertas === 1 ? ' tarefa aberta' : ' tarefas abertas') + '. Prazos de emendas, retornos de reuniões, entregas ao cliente.', [
          G.botao('Nova tarefa', function () { editarTarefa(null, props, renderTarefas); }),
          G.botao(filtros.tarefas.feitas ? 'Esconder feitas' : 'Mostrar feitas', function () { filtros.tarefas.feitas = !filtros.tarefas.feitas; renderTarefas(); }, 'botao-linha'),
          G.botao('Baixar planilha', function () {
            G.baixarCsv('tarefas.csv', todas, [{ rotulo: 'Tarefa', valor: 'titulo' }, { rotulo: 'Prazo', valor: function (t) { return G.dataBr(t.prazo); } }, { rotulo: 'Prioridade', valor: function (t) { return R.PRIORIDADES[t.prioridade]; } },
              { rotulo: 'Responsável', valor: 'responsavel' }, { rotulo: 'Situação', valor: function (t) { return R.STATUS_TAREFA[t.status]; } }, { rotulo: 'Proposição', valor: function (t) { return prop(t.proposicao_id); } }, { rotulo: 'Notas', valor: 'notas' }]);
          }, 'botao-linha')
        ]),
        el('div', { class: 'grupos-tarefas' }, grupos.map(function (g) {
          var deles = todas.filter(g[1]);
          if (!deles.length && g[0] !== 'Próximos 7 dias') return null;
          return el('section', { class: 'bloco-tarefas ' + g[2] }, [el('h3', { text: g[0] + ' · ' + deles.length }),
            el('ul', { class: 'lista-tarefas' }, deles.length ? deles.map(function (t) {
              var marca = el('input', { type: 'checkbox', 'aria-label': 'Marcar como feita' }); marca.checked = t.status === 'feita';
              marca.addEventListener('change', function () {
                P.tabela('tarefas').atualizar(t.id, { status: marca.checked ? 'feita' : 'aberta', concluida_em: marca.checked ? new Date().toISOString() : null }).then(renderTarefas, function (e) { P.avisar(G.erroAmigavel(e)); });
              });
              return el('li', {}, [marca, el('button', { type: 'button', class: 'tarefa-texto', onclick: function () { editarTarefa(t, props, renderTarefas); } }, [
                el('b', { text: t.titulo }),
                el('span', { class: 'discreto', text: [t.prazo ? 'até ' + G.dataBr(t.prazo) : '', t.responsavel, prop(t.proposicao_id), t.status === 'andamento' ? 'em andamento' : ''].filter(Boolean).join(' · ') })
              ]), t.prioridade === 'alta' ? G.selo('Alta', 'forte') : null]);
            }) : [el('li', { class: 'vazio', text: 'Nada para os próximos dias.' })])]);
        }))
      );
      var q = parametros();
      if (q.get('novo')) { editarTarefa(null, props, renderTarefas, { titulo: q.get('titulo') || '', prazo: q.get('prazo') || null }); limparNovo('tarefas'); }
    }, function (e) { falhou(painel, e); });
  }

  return {
    aoAbrirAba: function (nome) {
      if (nome === 'contatos') renderContatos();
      if (nome === 'interacoes') renderInteracoes();
      if (nome === 'tarefas') renderTarefas();
    },
    aoTrocarCliente: function () {
      var a = P.estado.aba;
      if (a === 'contatos') renderContatos(); if (a === 'interacoes') renderInteracoes(); if (a === 'tarefas') renderTarefas();
    }
  };
});
