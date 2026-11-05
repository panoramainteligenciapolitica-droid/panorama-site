// Consulta direta aos dados abertos da Câmara e do Senado, a partir do navegador.
// Câmara: https://dadosabertos.camara.leg.br/swagger/api.html (paginada de 100 em 100)
// Senado: https://legis.senado.leg.br/dadosabertos/processo (lista completa numa chamada)
// Guarda cada consulta por 10 minutos, para trocar de período e de tela sem baixar tudo de novo.
window.PanoramaCasas = (function () {
  'use strict';

  var CAMARA = 'https://dadosabertos.camara.leg.br/api/v2';
  var SENADO = 'https://legis.senado.leg.br/dadosabertos';
  var VALIDADE = 10 * 60 * 1000, PARALELO = 6, MAX_DIAS = 62;
  var guardado = {};

  // Documentos de tramitação que a Câmara publica junto com as proposições (pareceres, emendas, substitutivos,
  // redações, destaques, requerimentos de pauta, atas, ofícios). Não são proposições novas: ficam fora das contas
  // e da busca de novas, a menos que se peça para incluir. Variantes como SBT-A e EMC-A seguem a sigla base.
  var ACESSORIOS = ('PRL PAR PARF PRLP PRLE PPP PEP PPR RRL REL VTS RDF ERD DTQ RPD RPDR SBT SBE SBR SSP ' +
    'EMC EMP EMS EMR EMA EML EMD EMO ESB EMRP ATA DOC AVN OF').split(' ');
  function principal(p) {
    var base = String(p.sigla || '').toUpperCase().replace(/-.*$/, '');
    return ACESSORIOS.indexOf(base) < 0 && p.ano !== '0';
  }

  // A Câmara às vezes responde 504 ou 429 numa página: tenta de novo duas vezes antes de desistir
  function json(url, tentativas) {
    tentativas = tentativas || 3;
    var denovo = function () { return new Promise(function (ok) { setTimeout(ok, 1500); }).then(function () { return json(url, tentativas - 1); }); };
    // Um 504 da Câmara chega sem cabeçalho CORS e aparece como falha de rede: tenta de novo também nesse caso
    return fetch(url, { headers: { Accept: 'application/json' } }).catch(function (e) { if (tentativas > 1) return denovo().then(function (v) { return { ok: true, json: function () { return v; } }; }); throw e; }).then(function (r) {
      if (r.ok) return r.json();
      if (tentativas > 1 && (r.status >= 500 || r.status === 429)) {
        return new Promise(function (ok) { setTimeout(ok, 1500); }).then(function () { return json(url, tentativas - 1); });
      }
      throw new Error(url + ' respondeu ' + r.status);
    });
  }
  function emLotes(tarefas, n) {
    var resultados = new Array(tarefas.length), i = 0;
    function proxima() {
      if (i >= tarefas.length) return Promise.resolve();
      var k = i++;
      return tarefas[k]().then(function (v) { resultados[k] = v; return proxima(); });
    }
    var filas = [];
    for (var j = 0; j < Math.min(n, tarefas.length); j++) filas.push(proxima());
    return Promise.all(filas).then(function () { return resultados; });
  }

  function daCamara(p) {
    return {
      id_externo: 'CD:' + p.id, casa: 'CD', sigla: p.siglaTipo, numero: String(p.numero), ano: String(p.ano),
      ementa: p.ementa || '', autor: '', data_apresentacao: String(p.dataApresentacao || '').slice(0, 10) || null,
      url: 'https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=' + p.id, url_inteiro_teor: ''
    };
  }
  function camara(inicio, fim) {
    var base = CAMARA + '/proposicoes?dataApresentacaoInicio=' + inicio + '&dataApresentacaoFim=' + fim + '&itens=100&ordem=ASC&ordenarPor=id';
    return json(base + '&pagina=1').then(function (j) {
      var ultima = ((j.links || []).find(function (l) { return l.rel === 'last'; }) || {}).href || '';
      var paginas = Math.min(200, parseInt((ultima.match(/[?&]pagina=(\d+)/) || [])[1], 10) || 1);
      var tarefas = [];
      for (var n = 2; n <= paginas; n++) (function (n) { tarefas.push(function () { return json(base + '&pagina=' + n).then(function (x) { return x.dados || []; }); }); })(n);
      return emLotes(tarefas, PARALELO).then(function (resto) {
        return [].concat.apply(j.dados || [], resto).map(daCamara);
      });
    });
  }

  function senado(inicio, fim) {
    return json(SENADO + '/processo?dataInicioApresentacao=' + inicio + '&dataFimApresentacao=' + fim).then(function (lista) {
      return (Array.isArray(lista) ? lista : []).map(function (p) {
        var m = String(p.identificacao || '').match(/^([A-Z]+)\s+(\d+)\/(\d{4})/);
        if (!m || p.casaIdentificadora !== 'SF') return null;
        return {
          id_externo: 'SF:' + (p.codigoMateria || p.id), casa: 'SF', sigla: m[1], numero: String(Number(m[2])), ano: m[3],
          ementa: p.ementa || '', autor: p.autoria || '', situacao: p.situacaoAtual || '',
          data_apresentacao: String(p.dataApresentacao || '').slice(0, 10) || null,
          url: p.codigoMateria ? 'https://www25.senado.leg.br/web/atividade/materias/-/materia/' + p.codigoMateria : '',
          url_inteiro_teor: p.urlDocumento || ''
        };
      }).filter(Boolean);
    });
  }

  function lembrar(chave, buscar) {
    var g = guardado[chave];
    if (g && Date.now() - g.em < VALIDADE) return g.promessa;
    var promessa = buscar();
    guardado[chave] = { em: Date.now(), promessa: promessa };
    promessa.catch(function () { delete guardado[chave]; });
    return promessa;
  }

  // Tudo o que foi apresentado no período, nas duas Casas. Se uma Casa falhar, a outra vem assim mesmo.
  function periodo(inicio, fim) {
    var erros = [];
    var pegar = function (casa, fn) {
      return lembrar(casa + inicio + fim, function () { return fn(inicio, fim); }).catch(function () { erros.push(casa); return []; });
    };
    return Promise.all([pegar('CD', camara), pegar('SF', senado)]).then(function (r) {
      return { itens: r[0].concat(r[1]).filter(function (p) { return p.data_apresentacao; }), erros: erros };
    });
  }

  // Link do PDF do inteiro teor (na Câmara, vem do detalhe da proposição)
  function urlInteiroTeor(p) {
    if (p.url_inteiro_teor) return Promise.resolve(p.url_inteiro_teor);
    var m = String(p.id_externo || '').match(/^CD:(\d+)$/);
    if (!m) return Promise.resolve('');
    return json(CAMARA + '/proposicoes/' + m[1]).then(function (j) { return (j.dados && j.dados.urlInteiroTeor) || ''; }).catch(function () { return ''; });
  }

  return { periodo: periodo, urlInteiroTeor: urlInteiroTeor, principal: principal, MAX_DIAS: MAX_DIAS };
})();
