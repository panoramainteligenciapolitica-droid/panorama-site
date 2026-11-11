// Agenda do Congresso: reuniões de comissões e sessões da Câmara e do Senado no período escolhido,
// com destaque para as proposições monitoradas pelo cliente que estão em pauta.
(window.PanoramaModulos = window.PanoramaModulos || []).push(function (P) {
  'use strict';

  var $ = P.$, el = P.el, G = window.PanoramaRG;
  var CAMARA = 'https://dadosabertos.camara.leg.br/api/v2';
  var SENADO = 'https://legis.senado.leg.br/dadosabertos';
  var estado = { periodo: 'semana', casa: '', so: false };
  var cache = {};

  var json = G.jsonCasas;

  function lista(x) { return Array.isArray(x) ? x : x ? [x] : []; }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function somar(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function intervalo() {
    var h = new Date(); h = new Date(h.getFullYear(), h.getMonth(), h.getDate());
    var seg = somar(h, -((h.getDay() + 6) % 7));
    switch (estado.periodo) {
      case 'hoje': return [h, h];
      case 'amanha': return [somar(h, 1), somar(h, 1)];
      case 'proxima': return [somar(seg, 7), somar(seg, 11)];
      default: return [seg, somar(seg, 6)];
    }
  }
  function chaveProp(sigla, numero, ano) { return String(sigla || '').toUpperCase() + ' ' + String(numero || '').replace(/^0+/, '') + '/' + ano; }

  // ---------- Câmara ----------
  function eventosCamara(ini, fim) {
    var base = CAMARA + '/eventos?dataInicio=' + iso(ini) + '&dataFim=' + iso(fim) + '&itens=100&ordem=ASC&ordenarPor=dataHoraInicio';
    function pagina(n, acc) {
      return json(base + '&pagina=' + n).then(function (j) {
        acc = acc.concat(j.dados || []);
        var prox = (j.links || []).some(function (l) { return l.rel === 'next'; });
        return prox && n < 10 ? pagina(n + 1, acc) : acc;
      });
    }
    return pagina(1, []).then(function (l) {
      return l.map(function (e) {
        var org = (e.orgaos || [])[0] || {};
        return { casa: 'CD', id: e.id, quando: e.dataHoraInicio, orgao: org.sigla || '', orgaoNome: org.nomePublicacao || org.nome || '', tipo: e.descricaoTipo,
          descricao: String(e.descricao || '').split('\r\n')[0].trim(), situacao: e.situacao, local: (e.localCamara && e.localCamara.nome) || e.localExterno || '',
          link: 'https://www.camara.leg.br/evento-legislativo/' + e.id, deliberativa: /delibera/i.test(e.descricaoTipo) && !/não deliberativa/i.test(e.descricaoTipo),
          itens: null };
      });
    });
  }
  function pautaCamara(ev) {
    return json(CAMARA + '/eventos/' + ev.id + '/pauta').then(function (j) {
      ev.itens = (j.dados || []).map(function (i) { var p = i.proposicao_ || {}; return { chave: chaveProp(p.siglaTipo, p.numero, p.ano), titulo: i.titulo || chaveProp(p.siglaTipo, p.numero, p.ano), ementa: p.ementa || '' }; });
      return ev;
    }).catch(function () { ev.itens = []; return ev; });
  }

  // ---------- Senado ----------
  function reunioesSenado(ini, fim) {
    return json(SENADO + '/agendareuniao/' + iso(ini).replace(/-/g, '') + '/' + iso(fim).replace(/-/g, '')).then(function (j) {
      return lista((((j.AgendaReuniao || {}).reunioes) || {}).reuniao).map(function (r) {
        var col = r.colegiadoCriador || {}, itens = [];
        lista(r.partes).forEach(function (pa) {
          lista(pa && pa.itens).forEach(function (it) {
            var m = String(it.nome || it.descricao || '').match(/^([A-Z]+)\s+(\d+)\/(\d{4})/);
            if (m) itens.push({ chave: chaveProp(m[1], m[2], m[3]), titulo: it.nome, ementa: (it.textosPauta && it.textosPauta.ementa) || '' });
          });
          if (pa && pa.evento && pa.evento.finalidade && !itens.length) r.finalidade = pa.evento.finalidade;
        });
        return { casa: 'SF', id: 'r' + r.codigo, quando: String(r.dataInicio || '').slice(0, 16), orgao: col.sigla || '', orgaoNome: col.nome || '',
          tipo: lista(r.partes).map(function (pa) { return pa && pa.descricaoTipo; }).filter(Boolean).join(' e ') || r.titulo,
          descricao: r.finalidade || r.titulo || '', situacao: r.status || r.situacao || '', local: r.local || '',
          link: 'https://legis.senado.leg.br/comissoes/reuniao?reuniao=' + r.codigo, deliberativa: itens.length > 0, itens: itens,
          pauta: r.urlUltimaPautaSimplesPublicada || '' };
      });
    });
  }
  function plenarioSenado(ini, fim) {
    var dias = [], d = new Date(ini);
    while (d <= fim) { if (d.getDay() > 0 && d.getDay() < 6) dias.push(new Date(d)); d = somar(d, 1); }
    return Promise.all(dias.map(function (dia) {
      return json(SENADO + '/plenario/agenda/dia/' + iso(dia).replace(/-/g, '')).then(function (j) {
        return lista((((j.AgendaPlenario || {}).Sessoes) || {}).Sessao).map(function (s) {
          var itens = lista((s.Materias || {}).Materia).map(function (m) { return { chave: chaveProp(m.SiglaMateria, m.NumeroMateria, m.AnoMateria), titulo: m.DescricaoIdentificacaoMateria, ementa: m.Ementa || '' }; });
          return { casa: 'SF', id: 's' + s.CodigoSessao, quando: s.Data + 'T' + (s.Hora || '00:00'), orgao: s.Casa === 'CN' ? 'CN' : 'PLEN',
            orgaoNome: s.Casa === 'CN' ? 'Congresso Nacional' : 'Plenário do Senado', tipo: String(s.TipoSessao || '').trim().toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }),
            descricao: ((s.Evento || {}).DescricaoEvento) || '', situacao: s.SituacaoSessao || '', local: s.LocalSessao || '',
            link: 'https://www25.senado.leg.br/web/atividade/sessao-plenaria', deliberativa: itens.length > 0, itens: itens };
        });
      }).catch(function () { return []; });
    })).then(function (r) { return [].concat.apply([], r); });
  }

  function carregar() {
    var r = intervalo(), chave = iso(r[0]) + iso(r[1]);
    if (cache[chave] && Date.now() - cache[chave].quando < 15 * 60e3) return Promise.resolve(cache[chave].dados);
    return Promise.all([
      eventosCamara(r[0], r[1]).catch(function () { return null; }),
      reunioesSenado(r[0], r[1]).catch(function () { return null; }),
      plenarioSenado(r[0], r[1])
    ]).then(function (x) {
      var dados = { eventos: (x[0] || []).concat(x[1] || [], x[2] || []), falhas: [x[0] ? null : 'Câmara', x[1] ? null : 'comissões do Senado'].filter(Boolean) };
      dados.eventos.sort(function (a, b) { return a.quando < b.quando ? -1 : a.quando > b.quando ? 1 : 0; });
      cache[chave] = { quando: Date.now(), dados: dados };
      return dados;
    });
  }

  function render() {
    var painel = $('painel-agenda');
    var lista = el('div', { class: 'agenda-dias' }, [el('p', { class: 'discreto', text: 'Carregando a agenda das Casas…' })]);
    var aviso = el('p', { class: 'discreto' });
    painel.replaceChildren(
      G.cabecalho('Agenda do Congresso', 'Comissões e plenários da Câmara e do Senado. As proposições que o cliente monitora aparecem em destaque quando estão em pauta.'),
      el('div', { class: 'chips-filtro' }, [['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['semana', 'Esta semana'], ['proxima', 'Próxima semana']].map(function (p) {
        return el('button', { type: 'button', 'aria-pressed': String(estado.periodo === p[0]), text: p[1], onclick: function () { estado.periodo = p[0]; render(); } });
      })),
      el('div', { class: 'chips-filtro' }, [['', 'Câmara e Senado'], ['CD', 'Câmara'], ['SF', 'Senado']].map(function (c) {
        return el('button', { type: 'button', 'aria-pressed': String(estado.casa === c[0]), text: c[1], onclick: function () { estado.casa = c[0]; render(); } });
      }).concat([el('button', { type: 'button', 'aria-pressed': String(estado.so), text: 'Só com proposições monitoradas', onclick: function () { estado.so = !estado.so; render(); } })])),
      aviso, lista
    );
    Promise.all([carregar(), G.monitoradas().catch(function () { return []; })]).then(function (r) {
      var dados = r[0], props = r[1], monit = {};
      props.forEach(function (p) { monit[p.casa + ':' + chaveProp(p.sigla, p.numero, p.ano)] = p; monit['*:' + chaveProp(p.sigla, p.numero, p.ano)] = p; });
      // Na Câmara, a pauta vem por evento: busca a das reuniões deliberativas para achar as monitoradas
      var semPauta = dados.eventos.filter(function (e) { return e.casa === 'CD' && e.deliberativa && e.itens === null; });
      var buscas = props.length ? emLotes(semPauta.map(function (e) { return function () { return pautaCamara(e); }; }), 6) : Promise.resolve();
      if (semPauta.length && props.length) aviso.textContent = 'Conferindo as pautas da Câmara…';
      desenhar(dados, monit);
      buscas.then(function () { aviso.textContent = dados.falhas.length ? 'Sem resposta agora de: ' + dados.falhas.join(' e ') + '.' : ''; desenhar(dados, monit); });
    });

    function desenhar(dados, monit) {
      var eventos = dados.eventos.filter(function (e) { return !estado.casa || e.casa === estado.casa; });
      eventos.forEach(function (e) {
        e.monitoradas = (e.itens || []).filter(function (i) { return monit[e.casa + ':' + i.chave] || (e.orgao === 'CN' && monit['*:' + i.chave]); });
      });
      if (estado.so) eventos = eventos.filter(function (e) { return e.monitoradas.length; });
      if (!eventos.length) { lista.replaceChildren(el('p', { class: 'vazio', text: estado.so ? 'Nenhuma proposição monitorada em pauta neste período.' : 'Nenhum evento neste período.' })); return; }
      var dias = {};
      eventos.forEach(function (e) { var d = e.quando.slice(0, 10); (dias[d] = dias[d] || []).push(e); });
      var fmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
      lista.replaceChildren.apply(lista, Object.keys(dias).sort().map(function (d) {
        var p = d.split('-');
        return el('section', { class: 'agenda-dia' }, [el('h3', { text: fmt.format(new Date(+p[0], p[1] - 1, +p[2])) }),
          el('ul', { class: 'lista' }, dias[d].map(cartao))]);
      }));
    }
  }
  function cartao(e) {
    var pautaBotao = e.casa === 'CD' && e.deliberativa ? el('button', { type: 'button', text: e.itens && e.itens.length ? 'Pauta (' + e.itens.length + ')' : 'Ver pauta', onclick: function () {
      var alvo = this.closest('li').querySelector('.agenda-pauta');
      if (!alvo.hidden) { alvo.hidden = true; return; }
      (e.itens ? Promise.resolve(e) : pautaCamara(e)).then(function () { mostrarPauta(alvo, e); });
    } }) : e.casa === 'SF' && e.itens && e.itens.length ? el('button', { type: 'button', text: 'Pauta (' + e.itens.length + ')', onclick: function () {
      var alvo = this.closest('li').querySelector('.agenda-pauta'); if (!alvo.hidden) { alvo.hidden = true; return; } mostrarPauta(alvo, e);
    } }) : null;
    return el('li', { class: 'item agenda-item' + (e.monitoradas && e.monitoradas.length ? ' com-monitorada' : '') }, [
      el('div', { class: 'item-topo' }, [el('span', { class: 'tema', text: (e.casa === 'CD' ? 'Câmara' : 'Senado') + ' · ' + e.orgao }), el('span', { text: e.quando.slice(11, 16) + (e.situacao ? ' · ' + e.situacao : '') })]),
      el('h2', { text: e.tipo + (e.orgaoNome ? ' · ' + e.orgaoNome : '') }),
      e.descricao ? el('p', { class: 'resumo', text: e.descricao.slice(0, 400) }) : null,
      e.monitoradas && e.monitoradas.length ? el('p', { class: 'em-pauta' }, [el('b', { text: 'Monitoradas em pauta: ' }), el('span', { text: e.monitoradas.map(function (i) { return i.chave; }).join(', ') })]) : null,
      e.local ? el('p', { class: 'discreto', text: e.local }) : null,
      el('div', { class: 'item-acoes' }, [pautaBotao,
        el('a', { href: e.link, target: '_blank', rel: 'noopener', text: 'Abrir na Casa' }),
        e.pauta ? el('a', { href: e.pauta, target: '_blank', rel: 'noopener', text: 'Pauta em PDF' }) : null,
        el('button', { type: 'button', text: 'Criar tarefa', onclick: function () {
          P.irPara('?secao=tarefas&novo=1&titulo=' + encodeURIComponent('Acompanhar ' + e.orgao + ' (' + G.dataBr(e.quando) + ')') + '&prazo=' + e.quando.slice(0, 10));
        } })]),
      el('div', { class: 'agenda-pauta', hidden: '' })
    ]);
  }
  function mostrarPauta(alvo, e) {
    alvo.hidden = false;
    var mon = (e.monitoradas || []).map(function (i) { return i.chave; });
    alvo.replaceChildren(e.itens && e.itens.length ? el('ol', {}, e.itens.map(function (i) {
      return el('li', { class: mon.indexOf(i.chave) >= 0 ? 'destaque' : '' }, [el('b', { text: i.titulo }), i.ementa ? el('span', { text: ' ' + i.ementa.slice(0, 260) }) : null]);
    })) : el('p', { class: 'discreto', text: 'Pauta ainda não publicada.' }));
  }
  function emLotes(tarefas, n) {
    var i = 0;
    function proxima() { if (i >= tarefas.length) return Promise.resolve(); var t = tarefas[i++]; return t().then(proxima); }
    var filas = []; for (var k = 0; k < Math.min(n, tarefas.length); k++) filas.push(proxima());
    return Promise.all(filas);
  }

  return {
    aoAbrirAba: function (nome) { if (nome === 'agenda') render(); },
    aoTrocarCliente: function () { if (P.estado.aba === 'agenda') render(); }
  };
});
