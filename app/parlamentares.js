// Parlamentares em exercício (dados abertos da Câmara e do Senado), perfil de cada um e mapa de stakeholders
// do cliente: posição (apoiador a opositor), influência, temas e notas, guardados na tabela mapa_parlamentares.
(window.PanoramaModulos = window.PanoramaModulos || []).push(function (P) {
  'use strict';

  var $ = P.$, el = P.el, G = window.PanoramaRG, R = G.R;
  var CAMARA = 'https://dadosabertos.camara.leg.br/api/v2';
  var SENADO = 'https://legis.senado.leg.br/dadosabertos';
  var CASAS = { CD: 'Câmara', SF: 'Senado' };
  var cache = {};
  var filtro = { casa: 'CD', texto: '', partido: '', uf: '', posicao: '' };
  var mapa = [];

  // A Câmara às vezes responde 504 sem cabeçalho CORS (aparece como falha de rede): tenta de novo
  var json = G.jsonCasas;

  function lista(x) { return Array.isArray(x) ? x : x ? [x] : []; }
  function guardado(chave, buscar) {
    var c = cache[chave];
    if (c && Date.now() - c.quando < 6 * 3600e3) return Promise.resolve(c.dados);
    var salvo = null;
    try { salvo = JSON.parse(P.ler('panorama-cache-' + chave) || 'null'); } catch (e) { salvo = null; }
    if (salvo && Date.now() - salvo.quando < 24 * 3600e3) { cache[chave] = salvo; return Promise.resolve(salvo.dados); }
    return buscar().then(function (dados) {
      cache[chave] = { quando: Date.now(), dados: dados };
      P.gravar('panorama-cache-' + chave, JSON.stringify(cache[chave]));
      return dados;
    });
  }

  // ---------- listas das Casas ----------
  function deputados() {
    return guardado('deputados', function () {
      // Uma página por vez: a Câmara recusa rajadas
      function pagina(n, acc) {
        return json(CAMARA + '/deputados?itens=100&pagina=' + n).then(function (j) {
          acc = acc.concat(j.dados || []);
          return (j.dados || []).length === 100 && n < 8 ? pagina(n + 1, acc) : acc;
        });
      }
      return pagina(1, []).then(function (todos) {
        return todos.map(function (d) {
          return { casa: 'CD', id: String(d.id), nome: d.nome, partido: d.siglaPartido, uf: d.siglaUf, foto: d.urlFoto, email: d.email || '' };
        }).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
      });
    });
  }
  function senadores() {
    return guardado('senadores', function () {
      return json(SENADO + '/senador/lista/atual').then(function (j) {
        return lista(((j.ListaParlamentarEmExercicio || {}).Parlamentares || {}).Parlamentar).map(function (s) {
          var i = s.IdentificacaoParlamentar || {};
          return { casa: 'SF', id: String(i.CodigoParlamentar), nome: i.NomeParlamentar, nome_completo: i.NomeCompletoParlamentar, partido: i.SiglaPartidoParlamentar,
            uf: i.UfParlamentar, foto: String(i.UrlFotoParlamentar || '').replace(/^http:/, 'https:'), email: i.EmailParlamentar || '',
            telefone: lista((i.Telefones || {}).Telefone).map(function (t) { return '(61) ' + t.NumeroTelefone.replace(/^(\d{4})(\d{4})$/, '$1-$2'); }).join(', '),
            pagina: String(i.UrlPaginaParlamentar || '').replace(/^http:/, 'https:'), lideranca: i.MembroLideranca === 'Sim', mesa: i.MembroMesa === 'Sim',
            bloco: ((i.Bloco || {}).NomeApelido) || '' };
        }).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
      });
    });
  }
  function daCasa(casa) { return casa === 'SF' ? senadores() : deputados(); }
  window.PanoramaParlamentares = { daCasa: daCasa, todos: function () { return Promise.all([deputados(), senadores()]).then(function (r) { return r[0].concat(r[1]); }); } };

  function carregarMapa() {
    return P.tabela('mapa_parlamentares').listar().then(function (l) { mapa = l; return l; }, function () { mapa = []; return []; });
  }
  function doMapa(casa, id) { return mapa.find(function (m) { return m.casa === casa && String(m.parlamentar_id) === String(id); }); }
  function seloPosicao(m) { var p = m ? m.posicao : 'desconhecido'; return G.selo(R.POSICOES[p], 'posicao-' + p); }

  // ---------- lista ----------
  function renderLista() {
    var painel = $('painel-parlamentares');
    var titulo = filtro.casa === 'SF' ? 'Senadores' : 'Deputados';
    var lista = el('ul', { class: 'lista-parlamentares' }, [el('li', { class: 'vazio', text: 'Carregando ' + titulo.toLowerCase() + ' em exercício…' })]);
    var selPartido = el('select', { 'aria-label': 'Partido' }), selUf = el('select', { 'aria-label': 'UF' });
    var selPos = el('select', { 'aria-label': 'Posição no mapa' }, [el('option', { value: '', text: 'Todas as posições' })].concat(G.opcoesDe(R.POSICOES).map(function (o) { return el('option', { value: o.valor, text: o.rotulo }); })));
    selPos.value = filtro.posicao;
    var busca = el('input', { type: 'search', placeholder: 'Buscar por nome', 'aria-label': 'Buscar parlamentar' }); busca.value = filtro.texto;
    var total = el('p', { class: 'discreto' });
    var todos = [];

    function filtrar() {
      var t = G.normalizar(filtro.texto);
      return todos.filter(function (p) {
        var m = doMapa(p.casa, p.id);
        return (!t || G.normalizar(p.nome + ' ' + (p.nome_completo || '')).indexOf(t) >= 0) && (!filtro.partido || p.partido === filtro.partido) &&
          (!filtro.uf || p.uf === filtro.uf) && (!filtro.posicao || (m ? m.posicao : 'desconhecido') === filtro.posicao);
      });
    }
    function desenhar() {
      var vis = filtrar();
      total.textContent = vis.length + ' de ' + todos.length + ' ' + titulo.toLowerCase();
      lista.replaceChildren.apply(lista, vis.length ? vis.map(function (p) {
        var m = doMapa(p.casa, p.id);
        return el('li', {}, [el('a', { href: '?parlamentar=' + p.casa + ':' + p.id, class: 'cartao-parlamentar', onclick: function (ev) { ev.preventDefault(); P.irPara('?parlamentar=' + p.casa + ':' + p.id); } }, [
          el('img', { src: p.foto, alt: '', loading: 'lazy', width: '48', height: '64' }),
          el('div', {}, [el('b', { text: p.nome }), el('span', { class: 'discreto', text: p.partido + ' · ' + p.uf }),
            el('div', { class: 'selos' }, [seloPosicao(m), m && m.influencia === 'alta' ? G.selo('Influência alta', 'forte') : null, p.lideranca ? G.selo('Liderança') : null])])
        ])]);
      }) : [el('li', { class: 'vazio', text: 'Ninguém com esses filtros.' })]);
    }
    function opcoes(sel, valores, rotulo, atual) {
      sel.replaceChildren.apply(sel, [el('option', { value: '', text: rotulo })].concat(valores.map(function (v) { return el('option', { value: v, text: v }); })));
      sel.value = atual;
    }
    busca.addEventListener('input', function () { filtro.texto = busca.value; desenhar(); });
    selPartido.addEventListener('change', function () { filtro.partido = selPartido.value; desenhar(); });
    selUf.addEventListener('change', function () { filtro.uf = selUf.value; desenhar(); });
    selPos.addEventListener('change', function () { filtro.posicao = selPos.value; desenhar(); });

    painel.replaceChildren(
      G.cabecalho(titulo + ' em exercício', 'Dados oficiais da ' + CASAS[filtro.casa] + '. Toque no nome para ver o perfil, os contatos e classificar no mapa do cliente.', [
        G.botao('Baixar planilha', function () {
          G.baixarCsv(titulo.toLowerCase() + '.csv', filtrar(), [
            { rotulo: 'Nome', valor: 'nome' }, { rotulo: 'Partido', valor: 'partido' }, { rotulo: 'UF', valor: 'uf' }, { rotulo: 'E-mail', valor: 'email' },
            { rotulo: 'Telefone', valor: 'telefone' }, { rotulo: 'Posição', valor: function (p) { var m = doMapa(p.casa, p.id); return R.POSICOES[m ? m.posicao : 'desconhecido']; } },
            { rotulo: 'Influência', valor: function (p) { var m = doMapa(p.casa, p.id); return m ? R.INFLUENCIAS[m.influencia] : ''; } }
          ]);
        }, 'botao-linha'),
        G.botao('Criar lista de e-mail', function () { criarListaCom(filtrar(), titulo); }, 'botao-linha')
      ]),
      el('div', { class: 'chips-filtro' }, ['CD', 'SF'].map(function (c) {
        return el('button', { type: 'button', 'aria-pressed': String(filtro.casa === c), text: c === 'CD' ? 'Deputados' : 'Senadores', onclick: function () { P.irPara('?secao=' + (c === 'CD' ? 'deputados' : 'senadores')); } });
      })),
      el('div', { class: 'barra-filtros' }, [busca, selPartido, selUf, selPos]),
      total, lista
    );
    Promise.all([daCasa(filtro.casa), carregarMapa()]).then(function (r) {
      todos = r[0];
      var uniq = function (campo) { return todos.map(function (p) { return p[campo]; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }).sort(); };
      opcoes(selPartido, uniq('partido'), 'Todos os partidos', filtro.partido);
      opcoes(selUf, uniq('uf'), 'Todas as UFs', filtro.uf);
      desenhar();
    }, function () { lista.replaceChildren(el('li', { class: 'vazio', text: 'A ' + CASAS[filtro.casa] + ' não respondeu agora. Tente de novo em instantes.' })); });
  }

  // Lista de e-mail a partir de parlamentares (usa o e-mail oficial do gabinete)
  function criarListaCom(pessoas, origem) {
    var comEmail = pessoas.filter(function (p) { return p.email; });
    if (!comEmail.length) { P.avisar('Ninguém com e-mail nesse filtro'); return; }
    G.formulario({
      titulo: 'Criar lista com ' + comEmail.length + ' ' + (comEmail.length === 1 ? 'parlamentar' : 'parlamentares'),
      campos: [{ nome: 'nome', rotulo: 'Nome da lista', obrigatorio: true }, { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea', linhas: 2 }],
      valores: { nome: origem + ' ' + G.dataBr(G.hojeIso()) },
      botao: 'Criar lista',
      aoSalvar: function (v) {
        return P.tabela('listas_email').inserir(v).then(function (l) {
          return P.tabela('lista_membros').inserirVarios(comEmail.map(function (p) {
            return { lista_id: l.id, nome: p.nome, email: p.email, tratamento: p.casa === 'SF' ? 'Senador(a)' : 'Deputado(a)', origem: 'parlamentar:' + p.casa + ':' + p.id };
          })).then(function () { P.avisar('Lista criada com ' + comEmail.length + ' e-mails'); });
        });
      }
    });
  }
  window.PanoramaParlamentares.criarListaCom = criarListaCom;

  // ---------- perfil ----------
  function renderPerfil(chave) {
    P.mostrar('tela-parlamentar');
    var art = $('parlamentar'), casa = chave.split(':')[0], id = chave.split(':')[1];
    art.replaceChildren(el('p', { class: 'discreto', text: 'Carregando perfil…' }));
    Promise.all([daCasa(casa), carregarMapa()]).then(function (r) {
      var p = r[0].find(function (x) { return x.id === id; });
      if (!p) { art.replaceChildren(el('p', { text: 'Parlamentar não encontrado entre os que estão em exercício.' })); return; }
      document.title = p.nome + ' · Panorama';
      var detalhes = el('dl', { class: 'ficha' }, [el('dt', { text: 'Carregando dados do gabinete…' })]);
      var comissoes = el('ul', { class: 'lista-simples' }, [el('li', { class: 'vazio', text: 'Carregando…' })]);
      var autorias = el('ul', { class: 'lista-simples' }, [el('li', { class: 'vazio', text: 'Carregando…' })]);
      var reunioes = el('ul', { class: 'lista-simples' });
      var m = doMapa(casa, id);
      art.replaceChildren.apply(art, [
        el('div', { class: 'perfil-topo' }, [
          el('img', { src: p.foto, alt: 'Foto de ' + p.nome, width: '96', height: '128' }),
          el('div', {}, [
            el('p', { class: 'sobretitulo', text: casa === 'SF' ? 'Senador(a)' : 'Deputado(a) federal' }),
            el('h1', { text: p.nome }),
            el('p', { class: 'discreto', text: p.partido + ' · ' + p.uf + (p.bloco ? ' · ' + p.bloco : '') }),
            el('div', { class: 'selos' }, [seloPosicao(m), m ? G.selo('Influência ' + R.INFLUENCIAS[m.influencia].toLowerCase()) : null])
          ])
        ]),
        el('div', { class: 'acoes' }, [
          G.botao('Classificar no mapa', function () { classificar(p); }),
          G.botao('Adicionar aos contatos', function () { adicionarContato(p); }, 'botao-linha'),
          G.botao('Registrar reunião', function () { P.irPara('?secao=interacoes&novo=1&participantes=' + encodeURIComponent((casa === 'SF' ? 'Sen. ' : 'Dep. ') + p.nome)); }, 'botao-linha')
        ]),
        el('section', { class: 'bloco' }, [el('h2', { text: 'Contato do gabinete' }), detalhes]),
        m && (m.temas || m.notas) ? el('section', { class: 'bloco' }, [el('h2', { text: 'Notas do cliente' }),
          m.temas ? el('p', {}, [el('b', { text: 'Temas: ' }), el('span', { text: m.temas })]) : null, m.notas ? el('p', { class: 'corpo', text: m.notas }) : null]) : null,
        el('section', { class: 'bloco' }, [el('h2', { text: 'Comissões atuais' }), comissoes]),
        el('section', { class: 'bloco' }, [el('h2', { text: 'Proposições de autoria (recentes)' }), autorias]),
        el('section', { class: 'bloco' }, [el('h2', { text: 'Reuniões registradas' }), reunioes])
      ].filter(Boolean));
      var linha = function (rot, val, link) { return val ? [el('dt', { text: rot }), el('dd', {}, [link ? el('a', { href: link, target: '_blank', rel: 'noopener', text: val }) : el('span', { text: val })])] : []; };
      if (casa === 'CD') {
        json(CAMARA + '/deputados/' + id).then(function (j) {
          var d = j.dados || {}, s = d.ultimoStatus || {}, g = s.gabinete || {};
          detalhes.replaceChildren.apply(detalhes, [].concat(
            linha('Nome civil', d.nomeCivil), linha('E-mail', g.email || s.email, 'mailto:' + (g.email || s.email)),
            linha('Telefone', g.telefone ? '(61) ' + g.telefone : ''), linha('Gabinete', g.sala ? 'Anexo ' + g.predio + ', sala ' + g.sala + (g.andar ? ', ' + g.andar + 'º andar' : '') : ''),
            linha('Escolaridade', d.escolaridade), linha('Naturalidade', d.municipioNascimento ? d.municipioNascimento + ' (' + d.ufNascimento + ')' : ''),
            linha('Página na Câmara', 'camara.leg.br', 'https://www.camara.leg.br/deputados/' + id),
            linha('Redes sociais', (d.redeSocial || []).join(' · '))));
        }).catch(function () { detalhes.replaceChildren(el('dt', { text: 'A Câmara não respondeu agora.' })); });
        json(CAMARA + '/deputados/' + id + '/orgaos?itens=100&ordem=DESC&ordenarPor=dataInicio').then(function (j) {
          var atuais = (j.dados || []).filter(function (o) { return !o.dataFim; });
          comissoes.replaceChildren.apply(comissoes, atuais.length ? atuais.map(function (o) { return el('li', { text: o.siglaOrgao + ' · ' + o.nomeOrgao + ' (' + o.titulo + ')' }); }) : [el('li', { class: 'vazio', text: 'Nenhuma comissão atual.' })]);
        }).catch(function () { comissoes.replaceChildren(el('li', { class: 'vazio', text: 'A Câmara não respondeu agora.' })); });
        json(CAMARA + '/proposicoes?idDeputadoAutor=' + id + '&ordem=DESC&ordenarPor=id&itens=15&siglaTipo=PL,PLP,PEC,PDL,MPV').then(function (j) {
          var l = j.dados || [];
          autorias.replaceChildren.apply(autorias, l.length ? l.map(function (x) {
            return el('li', {}, [el('button', { type: 'button', class: 'numero-prop', text: x.siglaTipo + ' ' + x.numero + '/' + x.ano, onclick: function () {
              window.PanoramaTeor.abrir({ casa: 'CD', sigla: x.siglaTipo, numero: String(x.numero), ano: String(x.ano), ementa: x.ementa, id_externo: 'CD:' + x.id });
            } }), el('span', { text: ' ' + x.ementa })]);
          }) : [el('li', { class: 'vazio', text: 'Nenhuma proposição recente.' })]);
        }).catch(function () { autorias.replaceChildren(el('li', { class: 'vazio', text: 'A Câmara não respondeu agora.' })); });
      } else {
        json(SENADO + '/senador/' + id).then(function (j) {
          var d = ((j.DetalheParlamentar || {}).Parlamentar) || {}, b = d.DadosBasicosParlamentar || {}, i = d.IdentificacaoParlamentar || {};
          detalhes.replaceChildren.apply(detalhes, [].concat(
            linha('Nome completo', i.NomeCompletoParlamentar), linha('E-mail', i.EmailParlamentar, 'mailto:' + i.EmailParlamentar),
            linha('Telefone', p.telefone), linha('Gabinete', b.EnderecoParlamentar), linha('Naturalidade', b.Naturalidade ? b.Naturalidade + ' (' + b.UfNaturalidade + ')' : ''),
            linha('Página no Senado', 'senado.leg.br', p.pagina)));
        }).catch(function () { detalhes.replaceChildren(el('dt', { text: 'O Senado não respondeu agora.' })); });
        json(SENADO + '/senador/' + id + '/comissoes').then(function (j) {
          var l = lista(((((j.MembroComissaoParlamentar || {}).Parlamentar || {}).MembroComissoes) || {}).Comissao).filter(function (c) { return !c.DataFim; });
          comissoes.replaceChildren.apply(comissoes, l.length ? l.map(function (c) { var ic = c.IdentificacaoComissao || {}; return el('li', { text: ic.SiglaComissao + ' · ' + ic.NomeComissao + ' (' + c.DescricaoParticipacao + ')' }); }) : [el('li', { class: 'vazio', text: 'Nenhuma comissão atual.' })]);
        }).catch(function () { comissoes.replaceChildren(el('li', { class: 'vazio', text: 'O Senado não respondeu agora.' })); });
        var desde = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
        json(SENADO + '/processo?codigoParlamentarAutor=' + id + '&dataInicioApresentacao=' + desde).then(function (l) {
          l = lista(l).filter(function (x) { return /^(PL|PLP|PEC|PDL|PRS) /.test(x.identificacao || ''); }).sort(function (a, b) { return a.dataApresentacao < b.dataApresentacao ? 1 : -1; }).slice(0, 15);
          autorias.replaceChildren.apply(autorias, l.length ? l.map(function (x) {
            var m2 = String(x.identificacao).match(/^(\w+) (\d+)\/(\d{4})/) || [];
            return el('li', {}, [el('button', { type: 'button', class: 'numero-prop', text: x.identificacao, onclick: function () {
              window.PanoramaTeor.abrir({ casa: 'SF', sigla: m2[1], numero: m2[2], ano: m2[3], ementa: x.ementa, id_externo: 'SF:' + x.id, url_inteiro_teor: x.urlDocumento });
            } }), el('span', { text: ' ' + x.ementa })]);
          }) : [el('li', { class: 'vazio', text: 'Nenhum projeto no último ano.' })]);
        }).catch(function () { autorias.replaceChildren(el('li', { class: 'vazio', text: 'O Senado não respondeu agora.' })); });
      }
      P.tabela('interacoes').listar({ ordem: 'quando', desc: true }).then(function (l) {
        var n = G.normalizar(p.nome);
        l = l.filter(function (i) { return G.normalizar(i.participantes + ' ' + i.assunto).indexOf(n) >= 0; });
        reunioes.replaceChildren.apply(reunioes, l.length ? l.map(function (i) { return el('li', { text: G.dataHora(i.quando) + ' · ' + (R.TIPOS_INTERACAO[i.tipo] || i.tipo) + ' · ' + i.assunto }); })
          : [el('li', { class: 'vazio', text: 'Nenhuma reunião registrada com ' + p.nome + '.' })]);
      }, function () { reunioes.replaceChildren(el('li', { class: 'vazio', text: 'Sem registros.' })); });
    }, function () { art.replaceChildren(el('p', { text: 'A ' + CASAS[casa] + ' não respondeu agora. Tente de novo em instantes.' })); });
  }

  function classificar(p, depois) {
    var m = doMapa(p.casa, p.id);
    G.formulario({
      titulo: 'Mapa de ' + (P.nomeCliente(P.estado.cliente) || 'stakeholders') + ': ' + p.nome,
      campos: [
        { nome: 'posicao', rotulo: 'Posição sobre os temas do cliente', tipo: 'select', opcoes: G.opcoesDe(R.POSICOES), largura: 'meia' },
        { nome: 'influencia', rotulo: 'Influência', tipo: 'select', opcoes: G.opcoesDe(R.INFLUENCIAS), largura: 'meia' },
        { nome: 'temas', rotulo: 'Temas de interesse', placeholder: 'Ex.: tributação, crédito, agro' },
        { nome: 'notas', rotulo: 'Notas', tipo: 'textarea', ajuda: 'Histórico de votos, relação com a base, quem é o assessor de referência…' }
      ],
      valores: m || { posicao: 'desconhecido', influencia: 'media' },
      aoSalvar: function (v) {
        var dados = Object.assign({ casa: p.casa, parlamentar_id: p.id, nome: p.nome, partido: p.partido, uf: p.uf, atualizado_em: new Date().toISOString() }, v);
        var feito = m ? P.tabela('mapa_parlamentares').atualizar(m.id, dados) : P.tabela('mapa_parlamentares').inserir(dados);
        return feito.then(function () { P.avisar('Mapa atualizado'); return carregarMapa(); }).then(function () {
          if (depois) depois(); else renderPerfil(p.casa + ':' + p.id);
        });
      },
      aoApagar: m ? function () { return P.tabela('mapa_parlamentares').apagar(m.id).then(carregarMapa).then(function () { if (depois) depois(); else renderPerfil(p.casa + ':' + p.id); }); } : null
    });
  }
  function adicionarContato(p) {
    P.tabela('contatos').inserir({ nome: (p.casa === 'SF' ? 'Sen. ' : 'Dep. ') + p.nome, tipo: 'parlamentar', cargo: p.casa === 'SF' ? 'Senador(a)' : 'Deputado(a) federal',
      orgao: p.casa === 'SF' ? 'Senado Federal' : 'Câmara dos Deputados', email: p.email || null, telefone: p.telefone || null, casa: p.casa, parlamentar_id: p.id, partido: p.partido, uf: p.uf })
      .then(function () { P.avisar('Adicionado aos contatos'); }, function (e) { P.avisar(G.erroAmigavel(e)); });
  }

  // ---------- mapa de stakeholders ----------
  function renderMapa() {
    var painel = $('painel-mapa');
    if (G.semCliente(painel)) return;
    painel.replaceChildren(el('p', { class: 'discreto', text: 'Carregando o mapa…' }));
    carregarMapa().then(function (l) {
      var colunas = ['apoiador', 'favoravel', 'neutro', 'contrario', 'opositor'];
      var ordemInf = { alta: 0, media: 1, baixa: 2 };
      var grade = el('div', { class: 'mapa-colunas' }, colunas.map(function (pos) {
        var deles = l.filter(function (m) { return m.posicao === pos; }).sort(function (a, b) { return ordemInf[a.influencia] - ordemInf[b.influencia] || a.nome.localeCompare(b.nome, 'pt-BR'); });
        return el('section', { class: 'mapa-coluna posicao-' + pos }, [
          el('h3', {}, [el('span', { text: R.POSICOES[pos] }), el('b', { text: String(deles.length) })]),
          el('ul', {}, deles.length ? deles.map(function (m) {
            return el('li', {}, [el('a', { href: '?parlamentar=' + m.casa + ':' + m.parlamentar_id, onclick: function (ev) { ev.preventDefault(); P.irPara('?parlamentar=' + m.casa + ':' + m.parlamentar_id); } }, [
              el('b', { text: m.nome }), el('span', { class: 'discreto', text: ' ' + (m.casa === 'SF' ? 'Sen.' : 'Dep.') + ' · ' + (m.partido || '') + '/' + (m.uf || '') }),
              m.influencia === 'alta' ? G.selo('Influência alta', 'forte') : null])]);
          }) : [el('li', { class: 'vazio', text: 'Ninguém aqui.' })])
        ]);
      }));
      var semPos = l.filter(function (m) { return m.posicao === 'desconhecido'; }).length;
      painel.replaceChildren.apply(painel, [
        G.cabecalho('Mapa de stakeholders', 'Como cada parlamentar se posiciona sobre os temas ' + (P.nomeCliente(P.estado.cliente) ? 'de ' + P.nomeCliente(P.estado.cliente) : 'do cliente') + '. Classifique pelo perfil do parlamentar (Deputados ou Senadores).', [
          G.botao('Classificar deputados', function () { P.irPara('?secao=deputados'); }, 'botao-linha'),
          G.botao('Baixar planilha', function () {
            G.baixarCsv('mapa-stakeholders.csv', l, [{ rotulo: 'Casa', valor: function (m) { return CASAS[m.casa]; } }, { rotulo: 'Nome', valor: 'nome' }, { rotulo: 'Partido', valor: 'partido' },
              { rotulo: 'UF', valor: 'uf' }, { rotulo: 'Posição', valor: function (m) { return R.POSICOES[m.posicao]; } }, { rotulo: 'Influência', valor: function (m) { return R.INFLUENCIAS[m.influencia]; } },
              { rotulo: 'Temas', valor: 'temas' }, { rotulo: 'Notas', valor: 'notas' }]);
          }, 'botao-linha')
        ]),
        l.length ? grade : el('p', { class: 'vazio', text: 'Nenhum parlamentar classificado ainda para este cliente.' }),
        semPos ? el('p', { class: 'discreto', text: semPos + ' no mapa ainda sem posição definida.' }) : null
      ].filter(Boolean));
    });
  }

  return {
    aoAbrirAba: function (nome, sub) {
      if (nome === 'parlamentares') { filtro.casa = sub || filtro.casa; filtro.partido = ''; filtro.uf = ''; renderLista(); }
      if (nome === 'mapa') renderMapa();
    },
    aoTrocarCliente: function () { if (P.estado.aba === 'mapa') renderMapa(); if (P.estado.aba === 'parlamentares') renderLista(); },
    rota: function (params) {
      if (params.get('parlamentar')) { renderPerfil(params.get('parlamentar')); return true; }
      return false;
    }
  };
});
