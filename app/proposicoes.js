// Monitoramento de proposições da Câmara e do Senado: cadastro manual, coleta diária (palavras-chave e
// semelhança com o que já é monitorado), especialidades e campos de análise de relações governamentais.
// Os dados ficam no Supabase; na demonstração, ficam neste navegador com exemplos.
(window.PanoramaModulos = window.PanoramaModulos || []).push(function (P) {
  'use strict';

  var $ = P.$, el = P.el, S = window.PanoramaSimilaridade;
  var CASAS = { CD: 'Câmara', SF: 'Senado' };
  var PRIORIDADES = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
  var POSICOES = { analise: 'Em análise', favoravel: 'Favorável', contrario: 'Contrário', acompanhar: 'Acompanhar' };
  var ORIGENS = { app: 'indicada pelo app', casa: 'tema da Casa', manual: 'escolhida por você' };
  var ordemPrioridade = { alta: 0, media: 1, baixa: 2 };

  // ---------- exemplos da demonstração (números fictícios) ----------
  var ESP_EXEMPLO = [
    { id: 'esp-seguranca', nome: 'Segurança pública' },
    { id: 'esp-financeiro', nome: 'Serviços financeiros' },
    { id: 'esp-comercio', nome: 'Comércio exterior e logística' },
    { id: 'esp-justica', nome: 'Sistema de Justiça' }
  ];
  var PALAVRAS_EXEMPLO = [
    { id: 'pc-1', termo: 'segurança pública', especialidade_id: 'esp-seguranca' },
    { id: 'pc-2', termo: 'consignado', especialidade_id: 'esp-financeiro' },
    { id: 'pc-3', termo: 'fintech', especialidade_id: 'esp-financeiro' },
    { id: 'pc-4', termo: 'aduaneiro', especialidade_id: 'esp-comercio' },
    { id: 'pc-5', termo: 'cabotagem', especialidade_id: 'esp-comercio' }
  ];
  function ex(o) { return Object.assign({ exemplo: true, origem_especialidade: 'manual', autor: '', url: '', notas: '', proximo_passo: '', criado_em: '2026-10-20T12:00:00Z' }, o); }
  var PROPOSICOES_EXEMPLO = [
    ex({ id: 'p-1', casa: 'CD', sigla: 'PL', numero: '1101', ano: '2026', especialidade_id: 'esp-seguranca', prioridade: 'alta', posicionamento: 'favoravel', data_apresentacao: '2026-09-15', autor: 'Exemplo de autoria',
      ementa: 'Cria o Fundo de Modernização das Polícias Estaduais e define critérios de repasse de recursos da União para equipamentos e tecnologia de segurança pública.',
      situacao: 'Aguardando parecer do relator na Comissão de Segurança Pública', proximo_passo: 'Levar nota técnica ao relator' }),
    ex({ id: 'p-2', casa: 'SF', sigla: 'PL', numero: '2204', ano: '2026', especialidade_id: 'esp-seguranca', prioridade: 'media', posicionamento: 'acompanhar', data_apresentacao: '2026-08-02',
      ementa: 'Estabelece regras para o compartilhamento de dados entre os órgãos de segurança pública e o sistema prisional, com integração das bases de inteligência.',
      situacao: 'Aguardando designação de relator' }),
    ex({ id: 'p-3', casa: 'CD', sigla: 'PLP', numero: '310', ano: '2026', especialidade_id: 'esp-financeiro', prioridade: 'alta', posicionamento: 'contrario', data_apresentacao: '2026-07-21',
      ementa: 'Regulamenta a cobrança de tarifas no crédito consignado e fixa limites de juros para operações com aposentados e pensionistas.',
      situacao: 'Pronta para pauta no Plenário', proximo_passo: 'Mapear votos das lideranças' }),
    ex({ id: 'p-4', casa: 'SF', sigla: 'PL', numero: '1877', ano: '2026', especialidade_id: 'esp-financeiro', prioridade: 'media', posicionamento: 'analise', data_apresentacao: '2026-06-10',
      ementa: 'Disciplina o funcionamento das fintechs de crédito e das sociedades de empréstimo entre pessoas, com regras de capital mínimo.',
      situacao: 'Em análise na Comissão de Assuntos Econômicos' }),
    ex({ id: 'p-5', casa: 'CD', sigla: 'PL', numero: '905', ano: '2026', especialidade_id: 'esp-comercio', prioridade: 'alta', posicionamento: 'favoravel', data_apresentacao: '2026-05-05',
      ementa: 'Simplifica o despacho aduaneiro de importação e exportação e amplia o uso do Portal Único de Comércio Exterior.',
      situacao: 'Aprovado na comissão de mérito; segue para a CCJ' }),
    ex({ id: 'p-6', casa: 'SF', sigla: 'PL', numero: '3020', ano: '2026', especialidade_id: 'esp-comercio', prioridade: 'baixa', posicionamento: 'acompanhar', data_apresentacao: '2026-09-30',
      ementa: 'Cria incentivos à cabotagem e ao transporte multimodal de cargas, com redução de tarifas portuárias.',
      situacao: 'Aguardando designação de relator' }),
    ex({ id: 'p-7', casa: 'CD', sigla: 'PL', numero: '1450', ano: '2026', especialidade_id: 'esp-justica', prioridade: 'media', posicionamento: 'favoravel', data_apresentacao: '2026-04-18',
      ementa: 'Altera o Código de Processo Civil para ampliar a conciliação e a mediação digitais nos tribunais e reduzir prazos processuais.',
      situacao: 'Aguardando parecer na CCJ' }),
    ex({ id: 'p-8', casa: 'SF', sigla: 'PEC', numero: '12', ano: '2026', especialidade_id: 'esp-justica', prioridade: 'alta', posicionamento: 'acompanhar', data_apresentacao: '2026-03-12',
      ementa: 'Altera a Constituição para dispor sobre a autonomia orçamentária das Defensorias Públicas e a organização do sistema de Justiça.',
      situacao: 'Pronta para votação em primeiro turno' })
  ];
  function cand(o) { return Object.assign({ exemplo: true, status: 'nova', autor: '', situacao: 'Aguardando despacho', url: '', tema_casa: '' }, o); }
  var COLETA_EXEMPLO = [
    cand({ id_externo: 'CD:ex-2310', casa: 'CD', sigla: 'PL', numero: '2310', ano: '2026', data_apresentacao: '2026-11-03', tema_casa: 'Segurança Pública',
      ementa: 'Destina recursos do Fundo Nacional de Segurança Pública à compra de equipamentos e tecnologia para as polícias estaduais e municipais.' }),
    cand({ id_externo: 'SF:ex-4102', casa: 'SF', sigla: 'PL', numero: '4102', ano: '2026', data_apresentacao: '2026-11-03',
      ementa: 'Fixa limite de juros no crédito consignado de servidores públicos e veda tarifas adicionais nas operações.' }),
    cand({ id_externo: 'CD:ex-2315', casa: 'CD', sigla: 'PL', numero: '2315', ano: '2026', data_apresentacao: '2026-11-03', tema_casa: 'Arte, Cultura e Religião',
      ementa: 'Institui o Dia Nacional do Forró.' }),
    cand({ id_externo: 'CD:ex-1040', casa: 'CD', sigla: 'PDL', numero: '1040', ano: '2026', data_apresentacao: '2026-11-03', tema_casa: 'Relações Internacionais e Comércio Exterior',
      ementa: 'Susta portaria que alterou procedimentos de despacho aduaneiro de importação no Portal Único de Comércio Exterior.' }),
    cand({ id_externo: 'SF:ex-4110', casa: 'SF', sigla: 'PL', numero: '4110', ano: '2026', data_apresentacao: '2026-11-04',
      ementa: 'Regulamenta o uso de inteligência artificial na análise de crédito por instituições financeiras e fintechs.' }),
    cand({ id_externo: 'CD:ex-2322', casa: 'CD', sigla: 'PL', numero: '2322', ano: '2026', data_apresentacao: '2026-11-04', tema_casa: 'Homenagens e Datas Comemorativas',
      ementa: 'Denomina Viaduto Exemplo trecho de rodovia federal.' }),
    cand({ id_externo: 'CD:ex-2330', casa: 'CD', sigla: 'PL', numero: '2330', ano: '2026', data_apresentacao: '2026-11-04', tema_casa: 'Direito Civil e Processual Civil',
      ementa: 'Amplia as audiências de conciliação por videoconferência nos juizados especiais e no processo civil.' }),
    cand({ id_externo: 'SF:ex-4115', casa: 'SF', sigla: 'PL', numero: '4115', ano: '2026', data_apresentacao: '2026-11-04',
      ementa: 'Cria regras para a integração das bases de dados de inteligência das polícias com o sistema prisional nacional.' }),
    cand({ id_externo: 'CD:ex-2341', casa: 'CD', sigla: 'PL', numero: '2341', ano: '2026', data_apresentacao: '2026-11-04', tema_casa: 'Agricultura, Pecuária, Pesca e Extrativismo',
      ementa: 'Concede incentivo fiscal a startups de tecnologia agrícola.' }),
    cand({ id_externo: 'CD:ex-512', casa: 'CD', sigla: 'REQ', numero: '512', ano: '2026', data_apresentacao: '2026-11-04',
      ementa: 'Requer a realização de audiência pública para debater a cabotagem e os custos portuários no transporte de cargas.' })
  ];
  var JA_COLETADAS_NA_SEMENTE = 6;

  // ---------- dados: Supabase ou, na demonstração, este navegador ----------
  var CHAVE_LOCAL = 'panorama-demo-proposicoes-v1';
  var memoria = null;
  function novoId(prefixo) { return prefixo + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function local() {
    if (!memoria) { try { memoria = JSON.parse(P.ler(CHAVE_LOCAL) || 'null'); } catch (e) { memoria = null; } }
    if (!memoria) {
      var agora = new Date().toISOString();
      memoria = {
        especialidades: ESP_EXEMPLO.slice(), palavras: PALAVRAS_EXEMPLO.slice(), proposicoes: PROPOSICOES_EXEMPLO.slice(),
        candidatas: COLETA_EXEMPLO.slice(0, JA_COLETADAS_NA_SEMENTE).map(function (c) { return Object.assign({ id: novoId('c-'), coletado_em: agora }, c); }),
        ultima_busca: agora
      };
    }
    return memoria;
  }
  function guardarLocal() { P.gravar(CHAVE_LOCAL, JSON.stringify(memoria)); }

  var banco = {
    listar: function (tabela) {
      if (P.estado.demo) return Promise.resolve(local()[tabela].slice());
      var q = P.sb.from(tabela).select('*');
      if (tabela === 'candidatas') q = q.eq('status', 'nova').order('coletado_em', { ascending: false }).limit(1000);
      return q.then(function (r) { if (r.error) throw r.error; return r.data; });
    },
    inserir: function (tabela, obj) {
      if (P.estado.demo) {
        var o = Object.assign({ id: novoId('l-'), criado_em: new Date().toISOString() }, obj);
        local()[tabela].push(o); guardarLocal(); return Promise.resolve(o);
      }
      return P.sb.from(tabela).insert(obj).select().single().then(function (r) { if (r.error) throw r.error; return r.data; });
    },
    atualizar: function (tabela, id, campos) {
      if (P.estado.demo) {
        local()[tabela].forEach(function (o) { if (o.id === id) Object.assign(o, campos); });
        guardarLocal(); return Promise.resolve();
      }
      return P.sb.from(tabela).update(campos).eq('id', id).then(function (r) { if (r.error) throw r.error; });
    },
    apagar: function (tabela, id) {
      if (P.estado.demo) {
        local()[tabela] = local()[tabela].filter(function (o) { return o.id !== id; });
        guardarLocal(); return Promise.resolve();
      }
      return P.sb.from(tabela).delete().eq('id', id).then(function (r) { if (r.error) throw r.error; });
    },
    // Busca agora: no app real, chama a mesma função que roda todo dia no Supabase
    coletar: function () {
      if (P.estado.demo) {
        var m = local(), agora = new Date().toISOString(), conhecidas = {};
        m.candidatas.forEach(function (c) { conhecidas[c.id_externo] = true; });
        m.proposicoes.forEach(function (p) { conhecidas[chave(p)] = true; });
        var novas = COLETA_EXEMPLO.filter(function (c) { return !conhecidas[c.id_externo] && !conhecidas[chave(c)]; })
          .map(function (c) { return Object.assign({ id: novoId('c-'), coletado_em: agora }, c); });
        m.candidatas = m.candidatas.concat(novas); m.ultima_busca = agora; guardarLocal();
        return Promise.resolve({ novas: novas.length });
      }
      return P.sb.functions.invoke('coletar-proposicoes', { body: {} }).then(function (r) { if (r.error) throw r.error; return r.data || {}; });
    },
    ultimaBusca: function () {
      if (P.estado.demo) return Promise.resolve(local().ultima_busca);
      return P.sb.from('candidatas').select('coletado_em').order('coletado_em', { ascending: false }).limit(1)
        .then(function (r) { return r.data && r.data[0] ? r.data[0].coletado_em : null; });
    }
  };

  // ---------- estado da tela ----------
  var dados = { especialidades: [], palavras: [], proposicoes: [], candidatas: [] };
  var vista = 'monitoradas', filtroEsp = '', mostrarAbaixo = false;
  function limiar() { var v = parseInt(P.ler('panorama-limiar'), 10); return isNaN(v) ? 20 : v; }

  function carregar() {
    return Promise.all(['especialidades', 'palavras', 'proposicoes', 'candidatas'].map(function (t) { return banco.listar(t); }))
      .then(function (r) { dados = { especialidades: r[0], palavras: r[1], proposicoes: r[2], candidatas: r[3] }; });
  }

  // ---------- utilidades ----------
  // Semelhança abaixo de 10% não basta para indicar especialidade; palavra-chave basta
  function sugestaoUtil(a) { return a.sugestao && (a.sugestao.valor === null || S.percentual(a.sugestao.valor) >= 10) ? a.sugestao : null; }
  function chave(p) { return [p.casa, String(p.sigla || '').toUpperCase(), String(p.numero || '').replace(/^0+/, ''), p.ano].join(':'); }
  function ident(p) { return String(p.sigla || '').toUpperCase() + ' ' + p.numero + '/' + p.ano; }
  function nomeEsp(id) { var e = dados.especialidades.find(function (x) { return x.id === id; }); return e ? e.nome : ''; }
  function espPorNome(nome) { var n = S.normalizar(nome).trim(); return dados.especialidades.find(function (e) { return S.normalizar(e.nome).trim() === n; }); }
  function dataCurta(d) { if (!d) return ''; var p = String(d).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
  function selo(texto, classe) { return el('span', { class: 'selo ' + (classe || ''), text: texto }); }
  function linkCasa(p) {
    if (!p.url) return null;
    return el('a', { href: p.url, target: '_blank', rel: 'noopener', text: 'Abrir na ' + CASAS[p.casa] });
  }
  function confirmar(botao, texto, acao) {
    // Pede um segundo toque no mesmo botão, já que a confirmação fica na própria tela
    if (botao.dataset.confirmando) { acao(); return; }
    var original = botao.textContent;
    botao.dataset.confirmando = '1'; botao.textContent = texto;
    setTimeout(function () { delete botao.dataset.confirmando; botao.textContent = original; }, 3500);
  }

  // ---------- painel ----------
  function abrirPainel() {
    return carregar().then(renderPainel).catch(function () {
      $('lista-monitoradas').replaceChildren(el('li', { class: 'vazio', text: 'Não foi possível carregar as proposições. Verifique sua conexão.' }));
    });
  }

  function analiseDasNovas() {
    var r = S.analisar(dados.candidatas, dados.proposicoes, dados.palavras), min = limiar();
    r.forEach(function (a) {
      a.pct = a.maisParecida ? S.percentual(a.maisParecida.valor) : 0;
      a.entra = a.palavras.length > 0 || a.pct >= min;
    });
    return r.sort(function (a, b) { return (b.entra - a.entra) || (b.palavras.length > 0) - (a.palavras.length > 0) || b.pct - a.pct; });
  }

  function renderPainel() {
    var novas = analiseDasNovas(), relevantes = novas.filter(function (a) { return a.entra; }).length;
    var altas = dados.proposicoes.filter(function (p) { return p.prioridade === 'alta'; }).length;
    $('resumo-prop').replaceChildren(
      resumoItem(dados.proposicoes.length, dados.proposicoes.length === 1 ? 'monitorada' : 'monitoradas'),
      resumoItem(altas, 'de prioridade alta'),
      resumoItem(relevantes, relevantes === 1 ? 'nova para revisar' : 'novas para revisar')
    );
    $('contador-novas').textContent = relevantes ? String(relevantes) : '';
    ['monitoradas', 'novas', 'filtros'].forEach(function (v) {
      $('sub-' + v).setAttribute('aria-pressed', String(v === vista));
      $('vista-' + v).hidden = v !== vista;
    });
    if (vista === 'monitoradas') renderMonitoradas();
    else if (vista === 'novas') renderNovas(novas);
    else renderFiltros();
  }
  function resumoItem(n, rotulo) { return el('p', {}, [el('b', { text: String(n) }), el('span', { text: ' ' + rotulo })]); }

  // ---------- monitoradas ----------
  function renderMonitoradas() {
    var contagem = {};
    dados.proposicoes.forEach(function (p) { var k = p.especialidade_id || ''; contagem[k] = (contagem[k] || 0) + 1; });
    var chips = [{ id: '', nome: 'Todas', n: dados.proposicoes.length }].concat(dados.especialidades.map(function (e) { return { id: e.id, nome: e.nome, n: contagem[e.id] || 0 }; }));
    if (contagem['']) chips.push({ id: '__sem', nome: 'Sem especialidade', n: contagem[''] });
    $('filtro-esp').replaceChildren.apply($('filtro-esp'), chips.map(function (c) {
      return el('button', { type: 'button', 'aria-pressed': String(filtroEsp === c.id), text: c.nome + ' · ' + c.n, onclick: function () { filtroEsp = c.id; renderMonitoradas(); } });
    }));
    var termo = S.normalizar($('busca-prop').value).trim();
    var lista = dados.proposicoes.filter(function (p) {
      if (filtroEsp === '__sem' ? p.especialidade_id : (filtroEsp && p.especialidade_id !== filtroEsp)) return false;
      return !termo || S.normalizar([ident(p), p.ementa, p.autor, p.situacao].join(' ')).indexOf(termo) > -1;
    }).sort(function (a, b) {
      return (ordemPrioridade[a.prioridade] - ordemPrioridade[b.prioridade]) || String(b.data_apresentacao || '').localeCompare(String(a.data_apresentacao || ''));
    });
    var ul = $('lista-monitoradas');
    if (!lista.length) {
      ul.replaceChildren(el('li', { class: 'vazio', text: dados.proposicoes.length ? 'Nenhuma proposição neste filtro.' : 'Nenhuma proposição monitorada. Use Cadastrar ou revise as Novas.' }));
      return;
    }
    ul.replaceChildren.apply(ul, lista.map(cartaoMonitorada));
  }

  function cartaoMonitorada(p) {
    return el('li', { class: 'item item-prop' }, [
      el('div', { class: 'item-topo' }, [selo(CASAS[p.casa], 'casa casa-' + p.casa), p.exemplo ? selo('Exemplo', 'exemplo') : null, el('span', { text: dataCurta(p.data_apresentacao) })]),
      el('h2', {}, [el('a', { href: '?proposicao=' + encodeURIComponent(p.id), text: ident(p), onclick: function (ev) { ev.preventDefault(); P.irPara('?proposicao=' + encodeURIComponent(p.id)); } })]),
      el('p', { class: 'ementa', text: p.ementa }),
      el('div', { class: 'selos' }, [
        p.especialidade_id ? selo(nomeEsp(p.especialidade_id), 'esp') : null,
        selo('Prioridade ' + PRIORIDADES[p.prioridade].toLowerCase(), 'prio prio-' + p.prioridade),
        selo(POSICOES[p.posicionamento], 'pos pos-' + p.posicionamento)
      ]),
      p.situacao ? el('p', { class: 'situacao', text: p.situacao }) : null
    ]);
  }

  // ---------- novas (coleta) ----------
  function renderNovas(analise) {
    banco.ultimaBusca().then(function (quando) {
      $('info-coleta').textContent = (quando ? 'Última busca: ' + new Date(quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + '. ' : '') +
        (P.estado.demo ? 'Na demonstração, a busca usa proposições de exemplo.' : 'A busca roda sozinha todo dia às 7h.');
    });
    var visiveis = analise.filter(function (a) { return a.entra || mostrarAbaixo; });
    var abaixo = analise.length - analise.filter(function (a) { return a.entra; }).length;
    var b = $('mostrar-abaixo');
    b.hidden = !abaixo;
    b.textContent = mostrarAbaixo ? 'Esconder as abaixo da similaridade mínima' : 'Mostrar mais ' + abaixo + (abaixo === 1 ? ' coletada' : ' coletadas') + ' abaixo da similaridade mínima (' + limiar() + '%)';
    var ul = $('lista-novas');
    if (!visiveis.length) {
      ul.replaceChildren(el('li', { class: 'vazio', text: 'Nada novo para revisar. Toque em Buscar agora ou ajuste os filtros.' }));
      return;
    }
    ul.replaceChildren.apply(ul, visiveis.map(cartaoNova));
  }

  function cartaoNova(a) {
    var c = a.candidata, sinais = [];
    a.palavras.forEach(function (pc) { sinais.push(selo('Palavra-chave: ' + pc.termo, 'palavra')); });
    if (a.maisParecida) sinais.push(selo(a.pct + '% parecida com ' + ident(a.maisParecida.proposicao) + ' (' + CASAS[a.maisParecida.proposicao.casa] + ')', 'sim ' + (a.entra ? '' : 'fraca')));
    var sug = sugestaoUtil(a);
    if (sug) sinais.push(selo('Sugestão: ' + nomeEsp(sug.especialidade_id) + (sug.valor !== null ? ' · ' + S.percentual(sug.valor) + '%' : ''), 'esp'));
    if (c.tema_casa) sinais.push(selo('Tema na ' + CASAS[c.casa] + ': ' + c.tema_casa, 'tema-casa'));
    return el('li', { class: 'item item-prop' + (a.entra ? '' : ' item-fraco') }, [
      el('div', { class: 'item-topo' }, [selo(CASAS[c.casa], 'casa casa-' + c.casa), c.exemplo ? selo('Exemplo', 'exemplo') : null, el('span', { text: dataCurta(c.data_apresentacao) })]),
      el('h2', { text: ident(c) }),
      el('p', { class: 'ementa', text: c.ementa }),
      el('div', { class: 'selos' }, sinais),
      el('div', { class: 'item-acoes' }, [
        el('button', { type: 'button', class: 'acao-forte', text: 'Monitorar', onclick: function () { P.irPara('?cadastrar=1&candidata=' + encodeURIComponent(c.id)); } }),
        el('button', { type: 'button', text: 'Descartar', onclick: function () {
          banco.atualizar('candidatas', c.id, { status: 'descartada' }).then(function () {
            dados.candidatas = dados.candidatas.filter(function (x) { return x.id !== c.id; });
            P.avisar('Descartada'); renderPainel();
          }, function () { P.avisar('Não foi possível descartar'); });
        } }),
        el('button', { type: 'button', text: 'Inteiro teor', onclick: function () { abrirTeor(c, 'candidatas'); } }),
        linkCasa(c)
      ])
    ]);
  }

  // ---------- filtros: palavras-chave, especialidades e limiar ----------
  function opcoesEsp(select, valor, extras) {
    var ops = [el('option', { value: '', text: 'Sem especialidade' })].concat(dados.especialidades.map(function (e) { return el('option', { value: e.id, text: e.nome }); }));
    if (extras) ops.push(el('option', { value: '__nova', text: '+ Nova especialidade…' }));
    select.replaceChildren.apply(select, ops);
    select.value = valor || '';
  }

  function renderFiltros() {
    opcoesEsp($('esp-palavra'), $('esp-palavra').value);
    var ul = $('lista-palavras');
    ul.replaceChildren.apply(ul, dados.palavras.length ? dados.palavras.map(function (pc) {
      return el('li', {}, [
        el('span', { class: 'termo', text: pc.termo }),
        el('span', { class: 'discreto', text: nomeEsp(pc.especialidade_id) || 'Sem especialidade' }),
        el('button', { type: 'button', class: 'remover', 'aria-label': 'Remover ' + pc.termo, text: 'Remover', onclick: function () {
          banco.apagar('palavras', pc.id).then(function () { dados.palavras = dados.palavras.filter(function (x) { return x.id !== pc.id; }); renderFiltros(); });
        } })
      ]);
    }) : [el('li', { class: 'vazio', text: 'Nenhuma palavra-chave ainda.' })]);

    var contagem = {};
    dados.proposicoes.forEach(function (p) { if (p.especialidade_id) contagem[p.especialidade_id] = (contagem[p.especialidade_id] || 0) + 1; });
    var ue = $('lista-esp');
    ue.replaceChildren.apply(ue, dados.especialidades.length ? dados.especialidades.map(function (e) {
      var n = contagem[e.id] || 0;
      return el('li', {}, [
        el('span', { class: 'termo', text: e.nome }),
        el('span', { class: 'discreto', text: n + (n === 1 ? ' proposição' : ' proposições') }),
        el('button', { type: 'button', class: 'remover', 'aria-label': 'Remover ' + e.nome, text: 'Remover', onclick: function () {
          var b = this;
          var apagar = function () {
            var soltar = dados.proposicoes.filter(function (p) { return p.especialidade_id === e.id; }).map(function (p) { return banco.atualizar('proposicoes', p.id, { especialidade_id: null }); })
              .concat(dados.palavras.filter(function (p) { return p.especialidade_id === e.id; }).map(function (p) { return banco.atualizar('palavras', p.id, { especialidade_id: null }); }));
            Promise.all(soltar).then(function () { return banco.apagar('especialidades', e.id); }).then(abrirPainel);
          };
          if (n) confirmar(b, 'Tirar de ' + n + ' e remover?', apagar); else apagar();
        } })
      ]);
    }) : [el('li', { class: 'vazio', text: 'Nenhuma especialidade ainda.' })]);

    $('limiar').value = limiar();
    $('limiar-valor').textContent = limiar() + '%';
  }

  $('form-palavra').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var termo = $('nova-palavra').value.trim();
    if (!termo) return;
    if (dados.palavras.some(function (p) { return S.normalizar(p.termo) === S.normalizar(termo); })) { P.avisar('Essa palavra-chave já existe'); return; }
    banco.inserir('palavras', { termo: termo, especialidade_id: $('esp-palavra').value || null }).then(function (o) {
      dados.palavras.push(o); $('nova-palavra').value = ''; P.avisar('Palavra-chave adicionada'); renderFiltros();
    }, function () { P.avisar('Não foi possível adicionar'); });
  });
  $('form-esp').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var nome = $('nova-esp').value.trim();
    if (!nome) return;
    if (espPorNome(nome)) { P.avisar('Essa especialidade já existe'); return; }
    banco.inserir('especialidades', { nome: nome }).then(function (o) {
      dados.especialidades.push(o); $('nova-esp').value = ''; P.avisar('Especialidade criada'); renderFiltros();
    }, function () { P.avisar('Não foi possível criar'); });
  });
  $('limiar').addEventListener('input', function () { $('limiar-valor').textContent = this.value + '%'; P.gravar('panorama-limiar', this.value); renderResumoSoma(); });
  function renderResumoSoma() { var n = analiseDasNovas().filter(function (a) { return a.entra; }).length; $('contador-novas').textContent = n ? String(n) : ''; }

  ['monitoradas', 'novas', 'filtros'].forEach(function (v) {
    $('sub-' + v).addEventListener('click', function () { vista = v; renderPainel(); });
  });
  $('busca-prop').addEventListener('input', renderMonitoradas);
  $('nova-prop').addEventListener('click', function () { P.irPara('?cadastrar=1'); });
  $('mostrar-abaixo').addEventListener('click', function () { mostrarAbaixo = !mostrarAbaixo; renderPainel(); });
  $('buscar-agora').addEventListener('click', function () {
    var b = this; b.disabled = true; b.textContent = 'Buscando…';
    banco.coletar().then(function (r) {
      P.avisar(r && r.novas ? r.novas + (r.novas === 1 ? ' proposição coletada' : ' proposições coletadas') : 'Nenhuma proposição nova');
      return abrirPainel();
    }, function () { P.avisar('A busca falhou. Tente de novo em instantes.'); }).then(function () { b.disabled = false; b.textContent = 'Buscar agora'; });
  });

  // ---------- detalhe ----------
  function renderDetalhe(id) {
    P.mostrar('tela-proposicao');
    var art = $('proposicao');
    art.replaceChildren(el('p', { class: 'discreto', text: 'Carregando…' }));
    carregar().then(function () {
      var p = dados.proposicoes.find(function (x) { return x.id === id; });
      if (!p) { art.replaceChildren(el('p', { text: 'Esta proposição não está mais sendo monitorada.' })); return; }
      document.title = ident(p) + ' · Panorama';
      var outras = dados.proposicoes.filter(function (x) { return x.id !== p.id; });
      var parecidas = S.analisar([p], outras, [])[0].semelhantes;
      var campo = function (rotulo, valor) { return valor ? [el('dt', { text: rotulo }), el('dd', { text: valor })] : []; };
      var dl = el('dl', { class: 'campos' }, [].concat(
        campo('Especialidade', p.especialidade_id ? nomeEsp(p.especialidade_id) + (ORIGENS[p.origem_especialidade] ? ' (' + ORIGENS[p.origem_especialidade] + ')' : '') : 'Sem especialidade'),
        campo('Prioridade', PRIORIDADES[p.prioridade]),
        campo('Posicionamento', POSICOES[p.posicionamento]),
        campo('Situação atual', p.situacao),
        campo('Próximo passo', p.proximo_passo),
        campo('Autor', p.autor),
        campo('Apresentada em', dataCurta(p.data_apresentacao)),
        campo('Tema na ' + CASAS[p.casa], p.tema_casa),
        campo('Notas', p.notas)
      ));
      var parar = el('button', { class: 'botao botao-linha', type: 'button', text: 'Parar de monitorar' });
      parar.addEventListener('click', function () {
        confirmar(parar, 'Toque de novo para confirmar', function () {
          banco.apagar('proposicoes', p.id).then(function () { P.avisar('Removida das monitoradas'); P.voltar(); });
        });
      });
      art.replaceChildren.apply(art, [
        el('div', { class: 'item-topo' }, [selo(CASAS[p.casa], 'casa casa-' + p.casa), p.exemplo ? selo('Exemplo', 'exemplo') : null]),
        el('h1', { text: ident(p) }),
        el('p', { class: 'ementa-grande', text: p.ementa }),
        dl,
        parecidas.length ? el('section', { class: 'bloco' }, [
          el('h2', { text: 'Parecidas entre as monitoradas' }),
          el('ul', { class: 'lista-simples' }, parecidas.map(function (s) {
            return el('li', {}, [
              el('a', { href: '#', text: ident(s.proposicao) + ' (' + CASAS[s.proposicao.casa] + ')', onclick: function (ev) { ev.preventDefault(); P.irPara('?proposicao=' + encodeURIComponent(s.proposicao.id)); } }),
              el('span', { class: 'pct', text: S.percentual(s.valor) + '%' })
            ]);
          }))
        ]) : null,
        el('div', { class: 'acoes' }, [
          el('button', { class: 'botao', type: 'button', text: 'Ler inteiro teor', onclick: function () { abrirTeor(p, 'proposicoes'); } }),
          el('button', { class: 'botao botao-linha', type: 'button', text: 'Editar', onclick: function () { P.irPara('?editar=' + encodeURIComponent(p.id)); } }),
          el('button', { class: 'botao botao-linha', type: 'button', text: 'Compartilhar', onclick: function () { compartilharProp(p); } }),
          parar
        ]),
        linkCasa(p) ? el('p', {}, [linkCasa(p)]) : null
      ].filter(Boolean));
    });
  }

  function compartilharProp(p) {
    var texto = ident(p) + ' (' + CASAS[p.casa] + ')\n' + p.ementa + (p.situacao ? '\nSituação: ' + p.situacao : '') + (p.url ? '\n' + p.url : '');
    if (navigator.share) {
      navigator.share({ title: ident(p), text: texto }).catch(function (e) { if (e && e.name !== 'AbortError') P.copiar(texto); });
    } else P.copiar(texto);
  }

  // ---------- inteiro teor: janela com leitura, download e compartilhamento ----------
  var TIPOS = { PL: 'PROJETO DE LEI', PLP: 'PROJETO DE LEI COMPLEMENTAR', PEC: 'PROPOSTA DE EMENDA À CONSTITUIÇÃO', PDL: 'PROJETO DE DECRETO LEGISLATIVO', MPV: 'MEDIDA PROVISÓRIA', REQ: 'REQUERIMENTO' };
  function teorExemplo(p) {
    var cabeca = (TIPOS[p.sigla] || p.sigla) + ' Nº ' + p.numero + ', DE ' + p.ano;
    var aviso = '(Texto de exemplo, criado para a demonstração do app)';
    if (p.sigla === 'REQ') {
      return [cabeca, aviso, 'Senhor Presidente,', 'Requeiro, nos termos regimentais, ' + p.ementa.replace(/^Requer /, '').replace(/^a /, 'a ') ,
        'JUSTIFICAÇÃO', 'O tema exige debate com o setor produtivo, os órgãos de governo e especialistas, para subsidiar a análise das proposições em tramitação.',
        'Sala das Sessões, em ' + dataCurta(p.data_apresentacao) + '.'].join('\n\n');
    }
    var objeto = p.ementa.charAt(0).toLowerCase() + p.ementa.slice(1).replace(/\.$/, '');
    return [cabeca, aviso, '(' + p.ementa + ')', (p.sigla === 'PEC' ? 'As Mesas da Câmara dos Deputados e do Senado Federal, nos termos do § 3º do art. 60 da Constituição Federal, promulgam a seguinte Emenda ao texto constitucional:' : 'O CONGRESSO NACIONAL decreta:'),
      'Art. 1º Esta ' + (p.sigla === 'PEC' ? 'Emenda Constitucional' : 'Lei') + ' ' + objeto + '.',
      'Art. 2º O Poder Executivo regulamentará o disposto nesta ' + (p.sigla === 'PEC' ? 'Emenda' : 'Lei') + ' no prazo de cento e oitenta dias.',
      'Art. 3º Esta ' + (p.sigla === 'PEC' ? 'Emenda Constitucional' : 'Lei') + ' entra em vigor na data de sua publicação.',
      'JUSTIFICAÇÃO', 'A proposta busca dar segurança jurídica ao tema e atualizar a legislação diante das mudanças recentes no setor.',
      'Sala das Sessões, em ' + dataCurta(p.data_apresentacao) + '.'].join('\n\n');
  }

  // No app real, a função inteiro-teor no Supabase baixa o PDF da Casa e extrai o texto; o texto fica guardado
  function obterTeor(p, tabela) {
    if (p.inteiro_teor) return Promise.resolve({ texto: p.inteiro_teor, url: p.url_inteiro_teor || '' });
    if (p.exemplo || P.estado.demo) return Promise.resolve({ texto: teorExemplo(p), url: p.url_inteiro_teor || '' });
    return P.sb.functions.invoke('inteiro-teor', { body: { casa: p.casa, id_externo: p.id_externo || null, url: p.url_inteiro_teor || null } }).then(function (r) {
      if (r.error) throw r.error;
      var d = r.data || {};
      p.url_inteiro_teor = d.url || p.url_inteiro_teor || '';
      if (d.texto) {
        p.inteiro_teor = d.texto;
        if (tabela && p.id) banco.atualizar(tabela, p.id, { inteiro_teor: d.texto, url_inteiro_teor: p.url_inteiro_teor }).catch(function () {});
      }
      return { texto: d.texto || '', url: p.url_inteiro_teor };
    });
  }

  var teor = null;
  function nomeArquivo(p, ext) { return [p.sigla, p.numero, p.ano, CASAS[p.casa]].join('-').replace(/[^\wÀ-ú-]+/g, '') + '.' + ext; }
  function abrirTeor(p, tabela) {
    var d = $('dialogo-teor');
    teor = { p: p, texto: '', url: '' };
    $('teor-titulo').textContent = ident(p);
    $('teor-sub').textContent = 'Inteiro teor · ' + CASAS[p.casa];
    $('teor-texto').textContent = 'Carregando o texto…';
    $('teor-aviso').hidden = true;
    estadoBotoesTeor(false);
    if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
    obterTeor(p, tabela).then(function (r) {
      if (!teor || teor.p !== p) return;
      teor.texto = r.texto; teor.url = r.url;
      $('teor-texto').textContent = r.texto || '';
      if (!r.texto) {
        $('teor-aviso').hidden = false;
        $('teor-aviso').textContent = r.url ? 'Não foi possível extrair o texto deste documento. Abra o PDF original.' : 'A Casa ainda não publicou o inteiro teor desta proposição.';
      }
      estadoBotoesTeor(Boolean(r.texto));
    }, function () {
      $('teor-texto').textContent = '';
      $('teor-aviso').hidden = false;
      $('teor-aviso').textContent = 'Não foi possível buscar o inteiro teor agora. Verifique a conexão e tente de novo.';
    });
  }
  function estadoBotoesTeor(temTexto) {
    ['teor-compartilhar', 'teor-txt', 'teor-doc', 'teor-copiar'].forEach(function (id) { $(id).disabled = !temTexto; });
    var pdf = $('teor-pdf');
    pdf.hidden = !(teor && teor.url);
    if (teor && teor.url) pdf.href = teor.url;
  }
  function fecharTeor() { var d = $('dialogo-teor'); if (d.close) d.close(); else d.removeAttribute('open'); teor = null; }
  // Dentro do Claude a página não pode baixar sozinha: pede ao visualizador (capacidade downloads); no app, link comum
  function baixar(nome, conteudo, tipo) {
    var blob = new Blob([conteudo], { type: tipo });
    var pelaPagina = function () {
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: nome });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      P.avisar('Download iniciado: ' + nome);
    };
    if (!window.claude || !window.claude.use) { pelaPagina(); return; }
    window.claude.use('downloads').then(function (d) {
      if (!d) { pelaPagina(); return; }
      d.save({ filename: nome, data: blob }).then(function () { P.avisar('Arquivo salvo: ' + nome); }, function (e) {
        if (!e || e.code !== 'declined') P.avisar('Não foi possível baixar aqui');
      });
    }, pelaPagina);
  }
  function escaparXml(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // .docx de verdade, sem biblioteca: um zip sem compressão com as três partes mínimas do Word
  var tabelaCrc = null;
  function crc32(bytes) {
    if (!tabelaCrc) {
      tabelaCrc = new Uint32Array(256);
      for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; tabelaCrc[n] = c >>> 0; }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = tabelaCrc[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(arquivos) {
    var enc = new TextEncoder(), partes = [], central = [], pos = 0;
    arquivos.forEach(function (f) {
      var nome = enc.encode(f.nome), dados = enc.encode(f.conteudo), crc = crc32(dados);
      var cab = new DataView(new ArrayBuffer(30));
      cab.setUint32(0, 0x04034b50, true); cab.setUint16(4, 20, true); cab.setUint16(6, 0x0800, true);
      cab.setUint32(14, crc, true); cab.setUint32(18, dados.length, true); cab.setUint32(22, dados.length, true); cab.setUint16(26, nome.length, true);
      var cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
      cen.setUint32(16, crc, true); cen.setUint32(20, dados.length, true); cen.setUint32(24, dados.length, true); cen.setUint16(28, nome.length, true); cen.setUint32(42, pos, true);
      partes.push(new Uint8Array(cab.buffer), nome, dados);
      central.push(new Uint8Array(cen.buffer), nome);
      pos += 30 + nome.length + dados.length;
    });
    var tamCentral = central.reduce(function (t, p) { return t + p.length; }, 0);
    var fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true);
    fim.setUint32(12, tamCentral, true); fim.setUint32(16, pos, true);
    return new Blob(partes.concat(central, [new Uint8Array(fim.buffer)]));
  }
  function docx(texto) {
    var cabecalho = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    var paragrafos = texto.split(/\n{2,}/).map(function (par, i) {
      var linhas = par.split('\n').map(function (l) { return '<w:t xml:space="preserve">' + escaparXml(l) + '</w:t>'; }).join('<w:br/>');
      return '<w:p><w:r>' + (i === 0 ? '<w:rPr><w:b/></w:rPr>' : '') + linhas + '</w:r></w:p>';
    }).join('');
    return zip([
      { nome: '[Content_Types].xml', conteudo: cabecalho + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
      { nome: '_rels/.rels', conteudo: cabecalho + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { nome: 'word/document.xml', conteudo: cabecalho + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + paragrafos + '<w:sectPr/></w:body></w:document>' }
    ]);
  }

  $('teor-fechar').addEventListener('click', fecharTeor);
  $('dialogo-teor').addEventListener('click', function (ev) { if (ev.target === this) fecharTeor(); });
  $('dialogo-teor').addEventListener('close', function () { teor = null; });
  $('teor-copiar').addEventListener('click', function () {
    if (!teor) return;
    var t = teor.texto;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { P.avisar('Texto copiado'); }, function () { P.avisar('Não foi possível copiar'); });
  });
  $('teor-txt').addEventListener('click', function () { if (teor) baixar(nomeArquivo(teor.p, 'txt'), teor.texto, 'text/plain;charset=utf-8'); });
  $('teor-doc').addEventListener('click', function () {
    if (teor) baixar(nomeArquivo(teor.p, 'docx'), docx(teor.texto), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });
  $('teor-compartilhar').addEventListener('click', function () {
    if (!teor) return;
    var p = teor.p, resumo = ident(p) + ' (' + CASAS[p.casa] + ')\n' + p.ementa + (teor.url ? '\nInteiro teor: ' + teor.url : '');
    var arquivo = typeof File === 'function' ? new File([teor.texto], nomeArquivo(p, 'txt'), { type: 'text/plain' }) : null;
    // Com arquivo quando o sistema aceita (WhatsApp, e-mail); senão o resumo com o link do PDF
    var dadosShare = arquivo && navigator.canShare && navigator.canShare({ files: [arquivo] }) ? { title: ident(p), text: resumo, files: [arquivo] } : { title: ident(p), text: resumo };
    if (navigator.share) navigator.share(dadosShare).catch(function (e) { if (e && e.name !== 'AbortError') P.copiar(resumo); });
    else P.copiar(resumo);
  });

  // ---------- cadastro e edição ----------
  var form = { editando: null, candidata: null, origem: 'manual', temporizador: null };

  function renderForm(params) {
    P.mostrar('tela-form-prop');
    $('fp-erro').textContent = '';
    carregar().then(function () {
      var editar = params.get('editar'), candId = params.get('candidata');
      var base = editar ? dados.proposicoes.find(function (x) { return x.id === editar; }) : null;
      var c = candId ? dados.candidatas.find(function (x) { return x.id === candId; }) : null;
      form.editando = base; form.candidata = c;
      var origem = base || c || {};
      $('titulo-form-prop').textContent = base ? 'Editar ' + ident(base) : c ? 'Monitorar ' + ident(c) : 'Cadastrar proposição';
      $('fp-salvar').textContent = base ? 'Salvar alterações' : 'Salvar e monitorar';
      $('fp-casa').value = origem.casa || 'CD';
      $('fp-sigla').value = origem.sigla || '';
      $('fp-numero').value = origem.numero || '';
      $('fp-ano').value = origem.ano || String(new Date().getFullYear());
      $('fp-ementa').value = origem.ementa || '';
      $('fp-autor').value = origem.autor || '';
      $('fp-data').value = origem.data_apresentacao ? String(origem.data_apresentacao).slice(0, 10) : '';
      $('fp-situacao').value = origem.situacao || '';
      $('fp-url').value = origem.url || '';
      $('fp-teor-url').value = origem.url_inteiro_teor || '';
      $('fp-teor').value = (base && base.inteiro_teor) || '';
      $('fp-prioridade').value = (base && base.prioridade) || 'media';
      $('fp-posicao').value = (base && base.posicionamento) || 'analise';
      $('fp-proximo').value = (base && base.proximo_passo) || '';
      $('fp-notas').value = (base && base.notas) || '';
      opcoesEsp($('fp-esp'), base ? base.especialidade_id : '', true);
      $('fp-esp-nova').hidden = true; $('fp-esp-nova').value = '';
      form.origem = base ? (base.origem_especialidade || 'manual') : 'manual';
      // Ao monitorar uma coletada, já vem a especialidade que o app indicou (ou, sem ela, o tema da Casa)
      var sug = atualizarSugestoes();
      if (!base && sug) aplicarSugestao(sug);
    });
  }

  function sugestoesAtuais() {
    var texto = $('fp-ementa').value.trim();
    var lista = [];
    if (texto.length >= 15) {
      var outras = dados.proposicoes.filter(function (x) { return !form.editando || x.id !== form.editando.id; });
      var a = S.analisar([{ ementa: texto, tema_casa: form.candidata && form.candidata.tema_casa }], outras, dados.palavras)[0];
      var sug = sugestaoUtil(a);
      if (sug) lista.push({ tipo: 'app', especialidade_id: sug.especialidade_id, rotulo: 'Sugestão do app: ' + nomeEsp(sug.especialidade_id) + (sug.valor !== null ? ' (' + S.percentual(sug.valor) + '% de semelhança)' : ' (palavra-chave “' + sug.porPalavra + '”)') });
    }
    var tema = form.candidata && form.candidata.tema_casa;
    if (tema) {
      var existente = espPorNome(tema);
      lista.push({ tipo: 'casa', especialidade_id: existente ? existente.id : null, novaNome: existente ? null : tema, rotulo: 'Tema na ' + CASAS[form.candidata.casa] + ': ' + tema + (existente ? '' : ' (criar)') });
    }
    return lista;
  }
  function atualizarSugestoes() {
    var lista = sugestoesAtuais(), caixa = $('fp-sugestoes');
    caixa.replaceChildren.apply(caixa, lista.map(function (s) {
      return el('button', { type: 'button', class: 'sugestao', 'data-tipo': s.tipo, 'aria-pressed': 'false', text: s.rotulo, onclick: function () { aplicarSugestao(s); } });
    }));
    marcarSugestao();
    return lista[0] || null;
  }
  function marcarSugestao() {
    $('fp-sugestoes').querySelectorAll('.sugestao').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tipo === form.origem)); });
  }
  function aplicarSugestao(s) {
    form.origem = s.tipo;
    marcarSugestao();
    if (s.especialidade_id) { $('fp-esp').value = s.especialidade_id; $('fp-esp-nova').hidden = true; }
    else { $('fp-esp').value = '__nova'; $('fp-esp-nova').hidden = false; $('fp-esp-nova').value = s.novaNome || ''; }
  }

  $('fp-ementa').addEventListener('input', function () {
    clearTimeout(form.temporizador);
    form.temporizador = setTimeout(atualizarSugestoes, 300);
  });
  $('fp-esp').addEventListener('change', function () {
    form.origem = 'manual';
    marcarSugestao();
    $('fp-esp-nova').hidden = this.value !== '__nova';
    if (this.value === '__nova') $('fp-esp-nova').focus();
  });
  $('fp-esp-nova').addEventListener('input', function () { if (form.origem !== 'casa') form.origem = 'manual'; });

  $('form-prop').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var erro = $('fp-erro');
    var p = {
      casa: $('fp-casa').value, sigla: $('fp-sigla').value.trim().toUpperCase(), numero: $('fp-numero').value.trim().replace(/^0+(?=\d)/, ''),
      ano: $('fp-ano').value.trim(), ementa: $('fp-ementa').value.trim(), autor: $('fp-autor').value.trim(),
      data_apresentacao: $('fp-data').value || null, situacao: $('fp-situacao').value.trim(), url: $('fp-url').value.trim(),
      url_inteiro_teor: $('fp-teor-url').value.trim(), inteiro_teor: $('fp-teor').value.trim() || (form.candidata && form.candidata.inteiro_teor) || null,
      prioridade: $('fp-prioridade').value, posicionamento: $('fp-posicao').value,
      proximo_passo: $('fp-proximo').value.trim(), notas: $('fp-notas').value.trim(), origem_especialidade: form.origem
    };
    if (!/^[A-Z]{2,5}$/.test(p.sigla)) { erro.textContent = 'Informe o tipo, como PL, PLP ou PEC.'; return; }
    if (!/^\d{1,6}$/.test(p.numero)) { erro.textContent = 'Informe o número da proposição.'; return; }
    if (!/^\d{4}$/.test(p.ano)) { erro.textContent = 'Informe o ano com quatro dígitos.'; return; }
    if (p.ementa.length < 10) { erro.textContent = 'Escreva a ementa: ela é a base da comparação com as outras proposições.'; return; }
    if ((p.url && !/^https?:\/\//.test(p.url)) || (p.url_inteiro_teor && !/^https?:\/\//.test(p.url_inteiro_teor))) { erro.textContent = 'Os links precisam começar com https://'; return; }
    var repetida = dados.proposicoes.find(function (x) { return chave(x) === chave(p) && (!form.editando || x.id !== form.editando.id); });
    if (repetida) { erro.textContent = ident(p) + ' do ' + CASAS[p.casa] + ' já está sendo monitorada.'; return; }
    if (form.candidata) { p.id_externo = form.candidata.id_externo; p.tema_casa = form.candidata.tema_casa || ''; if (form.candidata.exemplo) p.exemplo = true; }
    erro.textContent = '';

    var escolha = $('fp-esp').value, nomeNova = $('fp-esp-nova').value.trim();
    if (escolha === '__nova' && !nomeNova) { erro.textContent = 'Dê um nome à nova especialidade.'; return; }
    var botao = $('fp-salvar'); botao.disabled = true;
    var espPronta = escolha === '__nova'
      ? (espPorNome(nomeNova) ? Promise.resolve(espPorNome(nomeNova)) : banco.inserir('especialidades', { nome: nomeNova }).then(function (e) { dados.especialidades.push(e); return e; }))
      : Promise.resolve(escolha ? { id: escolha } : null);
    espPronta.then(function (e) {
      p.especialidade_id = e ? e.id : null;
      if (form.editando) return banco.atualizar('proposicoes', form.editando.id, p).then(function () { return form.editando.id; });
      return banco.inserir('proposicoes', p).then(function (nova) {
        return (form.candidata ? banco.atualizar('candidatas', form.candidata.id, { status: 'monitorada' }) : Promise.resolve()).then(function () { return nova.id; });
      });
    }).then(function (id) {
      botao.disabled = false;
      P.avisar(form.editando ? 'Alterações salvas' : 'Proposição monitorada');
      P.irPara('?proposicao=' + encodeURIComponent(id));
    }, function () { botao.disabled = false; erro.textContent = 'Não foi possível salvar. Verifique a conexão e tente de novo.'; });
  });

  return {
    aoAbrirAba: function (nome) { if (nome === 'proposicoes') abrirPainel(); },
    rota: function (params) {
      if (params.get('proposicao')) { renderDetalhe(params.get('proposicao')); return true; }
      if (params.get('cadastrar') || params.get('editar')) { renderForm(params); return true; }
      return false;
    }
  };
});
