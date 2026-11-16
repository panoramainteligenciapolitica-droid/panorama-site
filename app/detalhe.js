// Partes extras do detalhe de uma proposição monitorada (proposicoes.js chama window.PanoramaDetalhe.montar):
// situação na Casa (atualizada todo dia pela função acompanhar-tramitacao), chance de aprovação, prazos (MP e emendas),
// linha do tempo, votações nominais com os votos do mapa de stakeholders, resumo por IA e notas técnicas.
(window.PanoramaModulos = window.PanoramaModulos || []).push(function (P) {
  'use strict';

  var el = P.el, G = window.PanoramaRG;
  var CASAS = { CD: 'Câmara', SF: 'Senado' };
  var DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  function ident(p) { return String(p.sigla || '').toUpperCase() + ' ' + p.numero + '/' + p.ano; }
  function secao(titulo, filhos, classe) { return el('section', { class: 'bloco bloco-detalhe ' + (classe || '') }, [el('h2', { text: titulo })].concat(filhos)); }
  function campo(rotulo, valor) { return valor ? [el('dt', { text: rotulo }), el('dd', { text: valor })] : []; }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function chamar(nome, corpo) {
    return P.sb.functions.invoke(nome, { body: corpo }).then(function (r) {
      if (!r.error) { if (r.data && r.data.erro) throw new Error(r.data.erro); return r.data; }
      var ctx = r.error.context;
      if (ctx && ctx.json) return ctx.json().then(function (j) { throw new Error(j.erro || r.error.message); }, function () { throw r.error; });
      throw new Error(/not found|404/i.test(r.error.message || '') ? 'A função ' + nome + ' ainda não foi publicada no Supabase.' : r.error.message);
    });
  }

  // ---------- chance de aprovação: nota simples a partir de sinais públicos ----------
  var BASE = { MPV: 55, PLN: 70, PDL: 20, PL: 10, PLP: 12, PEC: 6, PRC: 25, PRS: 25, PDS: 20 };
  function chance(p, passos) {
    var sigla = String(p.sigla || '').toUpperCase(), sit = String(p.situacao || '');
    if (!(sigla in BASE)) return null;
    if (/transformad[oa] (em|na) (norma|lei)|norma jur[ií]dica gerada|sancionad/i.test(sit)) return { nota: 100, rotulo: 'Virou norma', motivos: ['A Casa informa que a proposição virou norma.'] };
    if (/arquivad|retirad|prejudicad/i.test(sit) || p.tramitando === false && /arquiv/i.test(sit)) return { nota: 0, rotulo: 'Encerrada', motivos: ['Situação na Casa: ' + sit + '.'] };
    var nota = BASE[sigla], motivos = ['Ponto de partida para ' + sigla + ': ' + BASE[sigla] + '%.'];
    function soma(v, m) { nota += v; motivos.push((v > 0 ? '+' : '') + v + ': ' + m); }
    var texto = (passos || []).map(function (x) { return [x.descricao, x.despacho].join(' '); }).join(' \n ');
    if (/poder executivo|presid[eê]ncia da rep[uú]blica/i.test(p.autor || '')) soma(20, 'autoria do Poder Executivo');
    if (/urg[eê]ncia/i.test(p.regime || '') || /aprovad[oa] (o )?requerimento de urg[eê]ncia/i.test(texto)) soma(18, 'regime de urgência');
    if (/conclusiva/i.test(p.apreciacao || '')) soma(8, 'apreciação conclusiva nas comissões (não precisa do Plenário)');
    if (p.relator) soma(5, 'relator designado');
    if (/parecer[^.\n]*pela aprova|relat[oó]rio[^.\n]*pela aprova/i.test(texto)) soma(12, 'parecer favorável apresentado');
    if (/aprovad[oa] o parecer|aprova[cç][aã]o do parecer|parecer aprovado/i.test(texto)) soma(10, 'parecer aprovado em comissão');
    if (/remetid[oa] (ao senado|à câmara|a c[aâ]mara)|aprovad[oa] (em|pelo) plen[aá]rio/i.test(texto + ' ' + sit)) soma(25, 'já aprovada em uma das Casas');
    if (p.ultima_tramitacao_em && Date.now() - Date.parse(p.ultima_tramitacao_em) > 365 * 864e5) soma(-12, 'parada há mais de um ano');
    nota = Math.max(2, Math.min(95, nota));
    return { nota: nota, rotulo: nota < 25 ? 'Baixa' : nota < 55 ? 'Média' : 'Alta', motivos: motivos };
  }

  // ---------- prazos de medida provisória (CF art. 62), sem contar o recesso ----------
  function emRecesso(d) { var m = d.getMonth() + 1, dia = d.getDate(); return (m === 7 && dia >= 18) || (m === 12 && dia >= 23) || m === 1 || (m === 2 && dia === 1); }
  function somarDiasMp(inicio, dias) {
    var d = new Date(inicio), n = 0;
    while (n < dias) { d.setDate(d.getDate() + 1); if (!emRecesso(d)) n++; }
    return d;
  }
  function prazosMp(p) {
    if (String(p.sigla).toUpperCase() !== 'MPV' || !p.data_apresentacao) return [];
    var ini = new Date(String(p.data_apresentacao).slice(0, 10) + 'T12:00:00');
    return [
      ['Tranca a pauta (45 dias)', somarDiasMp(ini, 45)],
      ['Fim da vigência inicial (60 dias)', somarDiasMp(ini, 60)],
      ['Perde a eficácia, com prorrogação (120 dias)', somarDiasMp(ini, 120)]
    ].map(function (x) { return { rotulo: x[0], data: iso(x[1]) }; });
  }

  // ---------- votações nominais ----------
  function votacoes(p, caixa) {
    caixa.replaceChildren(el('p', { class: 'discreto', text: 'Buscando votações…' }));
    var mapa = P.estado.demo ? Promise.resolve([]) : P.tabela('mapa_parlamentares').listar({ onde: { casa: p.casa } }).catch(function () { return []; });
    var busca = p.casa === 'CD'
      ? (p.id_casa ? Promise.resolve(p.id_casa) : Promise.resolve(/^CD:\d+$/.test(p.id_externo || '') ? p.id_externo.slice(3) : null)).then(function (id) {
          if (!id) return [];
          return G.jsonCasas('https://dadosabertos.camara.leg.br/api/v2/proposicoes/' + id + '/votacoes').then(function (j) {
            return (j.dados || []).map(function (v) { return { id: v.id, data: v.dataHoraRegistro || v.data, descricao: v.descricao, orgao: v.siglaOrgao, resultado: v.aprovacao === 1 ? 'Aprovada' : v.aprovacao === 0 ? 'Rejeitada' : '' }; });
          });
        })
      : G.jsonCasas('https://legis.senado.leg.br/dadosabertos/votacao?sigla=' + encodeURIComponent(p.sigla) + '&numero=' + encodeURIComponent(p.numero) + '&ano=' + p.ano).then(function (l) {
          return (Array.isArray(l) ? l : []).map(function (v) {
            return { id: v.codigoSessaoVotacao, data: v.dataSessao, descricao: v.descricaoVotacao, orgao: 'Plenário', resultado: v.resultadoVotacao === 'A' ? 'Aprovada' : v.resultadoVotacao === 'R' ? 'Rejeitada' : '',
              votos: (v.votos || []).map(function (x) { return { id: String(x.codigoParlamentar), nome: x.nomeParlamentar, partido: x.siglaPartidoParlamentar, uf: x.siglaUFParlamentar, voto: x.siglaVotoParlamentar || x.descricaoVotoParlamentar || '' }; }) };
          });
        });
    Promise.all([busca, mapa]).then(function (r) {
      var lista = r[0], doMapa = r[1];
      if (!lista.length) { caixa.replaceChildren(el('p', { class: 'discreto', text: 'Nenhuma votação registrada pela ' + CASAS[p.casa] + ' para esta proposição. Votações simbólicas não têm lista de votos.' })); return; }
      caixa.replaceChildren(el('ul', { class: 'lista-simples lista-votacoes' }, lista.sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); }).map(function (v) {
        var votos = el('div', { class: 'votos', hidden: '' });
        var b = el('button', { type: 'button', class: 'botao-texto', text: 'Ver votos', onclick: function () {
          votos.hidden = !votos.hidden; if (votos.hidden || votos.dataset.ok) return;
          votos.dataset.ok = '1';
          mostrarVotos(p, v, votos, doMapa);
        } });
        return el('li', {}, [el('div', {}, [el('b', { text: G.dataBr(v.data) + ' · ' + (v.orgao || '') + (v.resultado ? ' · ' + v.resultado : '') }), el('p', { class: 'discreto', text: v.descricao || '' }), b, votos])]);
      })));
    }, function () { caixa.replaceChildren(el('p', { class: 'vazio', text: 'A ' + CASAS[p.casa] + ' não respondeu agora. Tente de novo em instantes.' })); });
  }
  function mostrarVotos(p, v, caixa, doMapa) {
    caixa.replaceChildren(el('p', { class: 'discreto', text: 'Carregando votos…' }));
    var pronto = v.votos ? Promise.resolve(v.votos) : G.jsonCasas('https://dadosabertos.camara.leg.br/api/v2/votacoes/' + v.id + '/votos').then(function (j) {
      return (j.dados || []).map(function (x) { var d = x.deputado_ || {}; return { id: String(d.id), nome: d.nome, partido: d.siglaPartido, uf: d.siglaUf, voto: x.tipoVoto }; });
    });
    pronto.then(function (votos) {
      if (!votos.length) { caixa.replaceChildren(el('p', { class: 'discreto', text: 'Votação sem lista nominal.' })); return; }
      var conta = {};
      votos.forEach(function (x) { conta[x.voto] = (conta[x.voto] || 0) + 1; });
      var mapeados = votos.filter(function (x) { return doMapa.some(function (m) { return String(m.parlamentar_id) === x.id; }); });
      var registrar = !P.estado.demo && mapeados.length ? G.botao('Anotar estes votos no mapa de stakeholders', function () {
        var b = this; b.disabled = true;
        var linha = 'Votou "' + '%VOTO%' + '" em ' + ident(p) + ' (' + G.dataBr(v.data) + ', ' + (v.orgao || CASAS[p.casa]) + ').';
        Promise.all(mapeados.map(function (x) {
          var m = doMapa.find(function (y) { return String(y.parlamentar_id) === x.id; });
          var nota = linha.replace('%VOTO%', x.voto);
          if ((m.notas || '').indexOf(nota) >= 0) return null;
          return P.tabela('mapa_parlamentares').atualizar(m.id, { notas: ((m.notas ? m.notas + '\n' : '') + nota).slice(0, 4000), atualizado_em: new Date().toISOString() });
        })).then(function () { P.avisar('Votos anotados no mapa'); b.textContent = 'Anotados'; }, function (e) { b.disabled = false; P.avisar(G.erroAmigavel(e)); });
      }, 'botao-linha') : null;
      caixa.replaceChildren(
        el('p', { text: Object.keys(conta).map(function (k) { return k + ': ' + conta[k]; }).join(' · ') }),
        mapeados.length ? el('div', {}, [el('h3', { text: 'No seu mapa de stakeholders' }), el('ul', { class: 'lista-simples' }, mapeados.map(function (x) {
          var m = doMapa.find(function (y) { return String(y.parlamentar_id) === x.id; });
          return el('li', {}, [el('span', { class: 'termo', text: x.nome + ' (' + x.partido + '/' + x.uf + ')' }), el('span', { text: x.voto }), G.selo(G.R.POSICOES[m.posicao] || '', 'posicao-' + m.posicao)]);
        })), registrar]) : el('p', { class: 'discreto', text: 'Ninguém do mapa de stakeholders deste cliente votou aqui.' }),
        el('details', {}, [el('summary', { text: 'Todos os votos (' + votos.length + ')' }), el('ul', { class: 'lista-simples' }, votos.map(function (x) {
          return el('li', {}, [el('span', { text: x.nome + ' (' + x.partido + '/' + x.uf + ')' }), el('span', { class: 'discreto', text: x.voto })]);
        }))])
      );
    }, function () { caixa.replaceChildren(el('p', { class: 'vazio', text: 'Não foi possível carregar os votos agora.' })); });
  }

  // ---------- notas técnicas ----------
  var STATUS_NT = { rascunho: 'Rascunho', revisao: 'Em revisão', aprovada: 'Aprovada', enviada: 'Enviada' };
  function textoNota(n, p) {
    return [n.titulo, ident(p) + ' (' + CASAS[p.casa] + ') · ' + (P.nomeCliente(P.estado.cliente) || ''), '',
      'Contexto', n.contexto || '', '', 'Análise', n.analise || '', '', 'Impacto', n.impacto || '', '', 'Posicionamento', n.posicionamento || '', '',
      'Proposta de redação', n.proposta || ''].join('\n').replace(/\n{3,}/g, '\n\n');
  }
  function editarNota(n, p, depois) {
    G.formulario({
      titulo: n ? 'Editar nota técnica' : 'Nova nota técnica sobre ' + ident(p),
      campos: [
        { nome: 'titulo', rotulo: 'Título', obrigatorio: true },
        { nome: 'status', rotulo: 'Situação', tipo: 'select', opcoes: G.opcoesDe(STATUS_NT), largura: 'meia' },
        { nome: 'contexto', rotulo: 'Contexto', tipo: 'textarea', linhas: 3, ajuda: 'O que a proposição faz e em que ponto está.' },
        { nome: 'analise', rotulo: 'Análise', tipo: 'textarea', linhas: 6 },
        { nome: 'impacto', rotulo: 'Impacto para o cliente', tipo: 'textarea', linhas: 4 },
        { nome: 'posicionamento', rotulo: 'Posicionamento', tipo: 'textarea', linhas: 3 },
        { nome: 'proposta', rotulo: 'Proposta de redação ou de emenda', tipo: 'textarea', linhas: 5 }
      ],
      valores: n || { titulo: 'Nota técnica: ' + ident(p), status: 'rascunho', contexto: p.resumo_ia || p.ementa },
      aoSalvar: function (v) {
        v.atualizado_em = new Date().toISOString();
        var feito = n ? P.tabela('notas_tecnicas').atualizar(n.id, v) : P.tabela('notas_tecnicas').inserir(Object.assign({ proposicao_id: p.id }, v));
        return feito.then(function () { P.avisar('Nota técnica salva'); depois(); });
      },
      aoApagar: n ? function () { return P.tabela('notas_tecnicas').apagar(n.id).then(depois); } : null
    });
  }
  function notas(p, caixa) {
    function desenhar() {
      P.tabela('notas_tecnicas').listar({ onde: { proposicao_id: p.id }, ordem: 'atualizado_em', desc: true }).then(function (lista) {
        caixa.replaceChildren(
          lista.length ? el('ul', { class: 'lista-simples' }, lista.map(function (n) {
            var arquivo = n.titulo.replace(/[^\wÀ-ú-]+/g, '-').slice(0, 60);
            return el('li', { class: 'linha-nota' }, [
              el('span', { class: 'termo', text: n.titulo }), G.selo(STATUS_NT[n.status] || n.status, n.status === 'aprovada' || n.status === 'enviada' ? 'forte' : ''),
              el('span', { class: 'acoes-nota' }, [
                el('button', { type: 'button', class: 'botao-texto', text: 'Editar', onclick: function () { editarNota(n, p, desenhar); } }),
                el('button', { type: 'button', class: 'botao-texto', text: 'Word', onclick: function () { window.PanoramaTeor.baixar(arquivo + '.docx', window.PanoramaTeor.docx(textoNota(n, p)), DOCX); } }),
                el('button', { type: 'button', class: 'botao-texto', text: 'PDF', onclick: function () { window.PanoramaTeor.baixar(arquivo + '.pdf', window.PanoramaTeor.pdf(textoNota(n, p)), 'application/pdf'); } }),
                window.PanoramaEmails ? el('button', { type: 'button', class: 'botao-texto', text: 'Enviar por e-mail', onclick: function () {
                  window.PanoramaEmails.escrever({ assunto: n.titulo, corpo: 'Prezado(a) {{tratamento}} {{nome}},\n\n' + textoNota(n, p) + '\n\nColocamo-nos à disposição.\n\n[assinatura]' });
                } }) : null
              ])
            ]);
          })) : el('p', { class: 'discreto', text: 'Nenhuma nota técnica sobre esta proposição.' }),
          G.botao('Nova nota técnica', function () { editarNota(null, p, desenhar); }, 'botao-linha')
        );
      }, function (e) { caixa.replaceChildren(el('p', { class: 'vazio', text: G.erroAmigavel(e) })); });
    }
    desenhar();
  }

  // ---------- resumo por IA ----------
  function resumo(p, caixa) {
    function desenhar(msg, erro) {
      caixa.replaceChildren(
        p.resumo_ia ? el('div', { class: 'texto-resumo', text: p.resumo_ia }) : el('p', { class: 'discreto', text: 'Ainda sem resumo. O app lê o inteiro teor e o Claude escreve o que propõe, quem é afetado e os pontos de atenção.' }),
        p.resumo_ia_em ? el('p', { class: 'discreto', text: 'Gerado em ' + G.dataHora(p.resumo_ia_em) + '. Confira com o texto antes de repassar.' }) : null,
        el('div', { class: 'acoes' }, [
          G.botao(p.resumo_ia ? 'Gerar de novo' : 'Gerar resumo', function () {
            var b = this; b.disabled = true; b.textContent = 'Lendo o texto…';
            var teor = window.PanoramaTeor && window.PanoramaTeor.obter ? window.PanoramaTeor.obter(p, 'proposicoes').catch(function () { return null; }) : Promise.resolve(null);
            teor.then(function () { b.textContent = 'Resumindo…'; return chamar('resumir', { proposicao_id: p.id }); }).then(function (r) {
              p.resumo_ia = r.resumo; p.resumo_ia_em = new Date().toISOString();
              desenhar(r.baseado_em === 'ementa' ? 'O inteiro teor não estava disponível: o resumo usa só a ementa.' : '');
            }, function (e) { desenhar(e.message, true); });
          }, p.resumo_ia ? 'botao-linha' : ''),
          p.resumo_ia ? G.botao('Editar', function () {
            G.formulario({ titulo: 'Editar resumo', campos: [{ nome: 'resumo_ia', rotulo: 'Resumo', tipo: 'textarea', linhas: 12 }], valores: { resumo_ia: p.resumo_ia },
              aoSalvar: function (v) { return P.tabela('proposicoes').atualizar(p.id, { resumo_ia: v.resumo_ia }).then(function () { p.resumo_ia = v.resumo_ia; desenhar(); }); } });
          }, 'botao-linha') : null,
          p.resumo_ia && G.gere() && window.PanoramaRG.publicarAlerta ? G.botao('Usar em um alerta', function () {
            window.PanoramaRG.publicarAlerta({ titulo: ident(p) + ': ' + String(p.ementa || '').slice(0, 90), resumo: String(p.ementa || '').slice(0, 280), conteudo: p.resumo_ia, link: p.url || '' });
          }, 'botao-linha') : null
        ]),
        msg ? el('p', { class: 'mensagem' + (erro ? ' erro' : ''), text: msg }) : null
      );
    }
    desenhar();
  }

  // ---------- montagem ----------
  function montar(p, recarregar) {
    var raiz = el('div', { class: 'detalhe-extra' });
    var real = !P.estado.demo && P.sb;
    var tarefas = real ? P.tabela('tarefas').listar({ onde: { proposicao_id: p.id }, ordem: 'prazo' }).catch(function () { return []; }) : Promise.resolve([]);
    var passos = real && p.id_casa ? P.sb.from('tramitacoes').select('quando, orgao, descricao, despacho, situacao, url').eq('ref', p.casa + ':' + p.id_casa)
      .order('quando', { ascending: false }).limit(300).then(function (r) { return r.data || []; }, function () { return []; }) : Promise.resolve([]);

    Promise.all([passos, tarefas]).then(function (r) {
      var linha = r[0], ts = r[1].filter(function (t) { return t.status !== 'feita' && t.prazo; });
      var partes = [];

      // Na Casa agora
      var atualizar = real ? G.botao('Atualizar agora', function () {
        var b = this; b.disabled = true; b.textContent = 'Consultando a ' + CASAS[p.casa] + '…';
        chamar('acompanhar-tramitacao', { proposicao_id: p.id }).then(function () { P.avisar('Tramitação atualizada'); recarregar(); },
          function (e) { b.disabled = false; b.textContent = 'Atualizar agora'; P.avisar(e.message); });
      }, 'botao-linha') : null;
      partes.push(secao('Na ' + CASAS[p.casa] + ' agora', [
        el('dl', { class: 'campos' }, [].concat(
          campo('Situação', p.situacao), campo('Onde está', p.orgao_atual), campo('Relator', p.relator), campo('Regime', p.regime),
          campo('Apreciação', p.apreciacao), campo('Última movimentação', p.ultima_tramitacao_em ? G.dataBr(p.ultima_tramitacao_em) : ''),
          campo('Conferido pelo app', p.tramitacao_conferida_em ? G.dataHora(p.tramitacao_conferida_em) : (real ? 'ainda não (a conferência roda todo dia às 7h20)' : ''))
        )),
        atualizar
      ]));

      // Chance de aprovação
      var c = chance(p, linha);
      if (c) partes.push(secao('Chance de aprovação', [
        el('div', { class: 'chance' }, [el('b', { class: 'chance-' + G.normalizar(c.rotulo).replace(/\W+/g, '-'), text: c.rotulo + (c.nota > 0 && c.nota < 100 ? ' · ' + c.nota + '%' : '') }),
          el('span', { class: 'barra-chance' }, [el('span', { style: 'width:' + c.nota + '%' })])]),
        el('ul', { class: 'motivos' }, c.motivos.map(function (m) { return el('li', { text: m }); })),
        el('p', { class: 'discreto', text: 'Estimativa simples, feita pelo app a partir de sinais públicos (tipo, autoria, regime, pareceres, tempo parado). Não substitui a leitura política da equipe.' })
      ]));

      // Prazos
      var mp = prazosMp(p), hoje = G.hojeIso();
      if (mp.length || ts.length) partes.push(secao('Prazos', [el('ul', { class: 'lista-simples' }, mp.map(function (x) {
        return el('li', {}, [el('span', { class: 'termo', text: x.rotulo }), el('span', { class: x.data < hoje ? 'discreto' : '', text: G.dataBr(x.data) + (x.data < hoje ? ' (passou)' : '') })]);
      }).concat(ts.map(function (t) {
        return el('li', {}, [el('a', { href: '?secao=tarefas', text: t.titulo, onclick: function (ev) { ev.preventDefault(); P.irPara('?secao=tarefas'); } }),
          el('span', { class: t.prazo < hoje ? 'atrasado' : '', text: G.dataBr(t.prazo) + (t.prazo < hoje ? ' (atrasada)' : '') })]);
      }))), mp.length ? el('p', { class: 'discreto', text: 'Prazos da MP contados da publicação, sem o recesso (18 a 31/7 e 23/12 a 1/2), como manda o art. 62 da Constituição. Confira no Congresso.' }) : null]));

      // Linha do tempo
      if (real) {
        var curta = el('ol', { class: 'linha-tempo' }), todos = false;
        var desenharLinha = function () {
          curta.replaceChildren.apply(curta, (todos ? linha : linha.slice(0, 8)).map(function (x) {
            return el('li', {}, [el('b', { text: G.dataBr(x.quando) + (x.orgao ? ' · ' + x.orgao : '') }),
              el('span', { text: [x.descricao, x.despacho].filter(Boolean).join(': ') }),
              x.url ? el('a', { href: x.url, target: '_blank', rel: 'noopener', text: 'documento' }) : null]);
          }));
        };
        desenharLinha();
        partes.push(secao('Linha do tempo', linha.length ? [curta, linha.length > 8 ? el('button', { type: 'button', class: 'botao-texto', text: 'Mostrar todos os ' + linha.length + ' passos', onclick: function () { todos = !todos; this.textContent = todos ? 'Mostrar só os últimos' : 'Mostrar todos os ' + linha.length + ' passos'; desenharLinha(); } }) : null]
          : [el('p', { class: 'discreto', text: 'A linha do tempo aparece depois da primeira conferência na ' + CASAS[p.casa] + '. Use "Atualizar agora".' })]));
      }

      // Votações
      var caixaVot = el('div');
      partes.push(secao('Votações nominais', [caixaVot]));
      caixaVot.replaceChildren(G.botao('Ver votações', function () { votacoes(p, caixaVot); }, 'botao-linha'));

      // Resumo por IA e notas técnicas
      if (real) {
        var caixaRes = el('div'), caixaNotas = el('div');
        partes.push(secao('Resumo por IA', [caixaRes]));
        partes.push(secao('Notas técnicas', [caixaNotas]));
        resumo(p, caixaRes); notas(p, caixaNotas);
      }
      raiz.replaceChildren.apply(raiz, partes);
    });
    return raiz;
  }

  window.PanoramaDetalhe = { montar: montar, chance: chance, prazosMp: prazosMp };
  return {};
});
