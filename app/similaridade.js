// Compara ementas por TF-IDF e cosseno. Roda no navegador (window.PanoramaSimilaridade) e em testes no Node.
// Simples de propósito: palavras normalizadas, sem acento, cortadas em radicais de até 6 letras,
// sem as palavras que toda ementa tem ("dispõe", "altera", "lei"...), que só inflariam a semelhança.
(function (raiz) {
  'use strict';

  var VAZIAS = ('a o e é as os um uma uns umas de da do das dos em na no nas nos por pela pelo pelas pelos para pra com sem sob sobre ' +
    'que se ao aos à às ou nao não mais menos como entre ate até apos após seu sua seus suas este esta estes estas esse essa isso ' +
    'dispoe dispõe dispor altera alterar alteracao alteração acrescenta acrescentar inclui incluir institui instituir estabelece ' +
    'lei leis decreto decretos legislativo complementar federal nacional art arts artigo artigos inciso incisos paragrafo parágrafo ' +
    'caput dar da dá outras outra providencias providências redacao redação nº n° numero número termos fim fins forma ' +
    'susta sustar efeitos ato atos dia ano anos janeiro fevereiro marco março abril maio junho julho agosto setembro outubro ' +
    'novembro dezembro projeto proposta requer requerimento solicita senhor senhora ministro ministra').split(/\s+/);
  var vazias = {};
  VAZIAS.forEach(function (p) { vazias[normalizar(p)] = true; });

  function normalizar(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function radicais(texto) {
    return normalizar(texto).split(/[^a-z0-9]+/).filter(function (p) {
      return p.length >= 3 && !vazias[p] && !/^\d+$/.test(p);
    }).map(function (p) { return p.length > 6 ? p.slice(0, 6) : p; });
  }

  // Monta vetores TF-IDF de todos os textos de uma vez, para os pesos serem comparáveis entre si
  function vetorizar(textos) {
    var listas = textos.map(radicais);
    var df = {};
    listas.forEach(function (l) {
      var vistos = {};
      l.forEach(function (r) { if (!vistos[r]) { vistos[r] = true; df[r] = (df[r] || 0) + 1; } });
    });
    var n = listas.length;
    return listas.map(function (l) {
      var tf = {}, v = {}, norma = 0;
      l.forEach(function (r) { tf[r] = (tf[r] || 0) + 1; });
      Object.keys(tf).forEach(function (r) {
        var peso = (1 + Math.log(tf[r])) * Math.log(1 + n / df[r]);
        v[r] = peso; norma += peso * peso;
      });
      return { pesos: v, norma: Math.sqrt(norma) };
    });
  }

  function cosseno(a, b) {
    if (!a.norma || !b.norma) return 0;
    var menor = Object.keys(a.pesos).length < Object.keys(b.pesos).length ? a : b, maior = menor === a ? b : a, soma = 0;
    Object.keys(menor.pesos).forEach(function (r) { if (maior.pesos[r]) soma += menor.pesos[r] * maior.pesos[r]; });
    return soma / (a.norma * b.norma);
  }

  function palavrasEncontradas(texto, palavras) {
    var t = ' ' + normalizar(texto).replace(/[^a-z0-9]+/g, ' ') + ' ';
    return palavras.filter(function (p) {
      var termo = normalizar(p.termo).replace(/[^a-z0-9]+/g, ' ').trim();
      return termo && t.indexOf(' ' + termo) > -1;
    });
  }

  // Para cada candidata: a monitorada mais parecida, a nota por especialidade e as palavras-chave que aparecem.
  // A nota de uma especialidade é a média das duas monitoradas mais parecidas dela (uma só, se for a única),
  // para um caso isolado não puxar a sugestão sozinho.
  function analisar(candidatas, monitoradas, palavras) {
    var vetores = vetorizar(monitoradas.map(textoDe).concat(candidatas.map(textoDe)));
    var vm = vetores.slice(0, monitoradas.length), vc = vetores.slice(monitoradas.length);
    return candidatas.map(function (c, i) {
      var sims = monitoradas.map(function (m, j) { return { proposicao: m, valor: cosseno(vc[i], vm[j]) }; })
        .sort(function (a, b) { return b.valor - a.valor; });
      var porEsp = {};
      sims.forEach(function (s) {
        var e = s.proposicao.especialidade_id; if (!e) return;
        (porEsp[e] = porEsp[e] || []).push(s.valor);
      });
      var especialidades = Object.keys(porEsp).map(function (e) {
        var top = porEsp[e].slice(0, 2);
        return { especialidade_id: e, valor: top.reduce(function (x, y) { return x + y; }, 0) / top.length };
      }).sort(function (a, b) { return b.valor - a.valor; });
      var achadas = palavrasEncontradas(textoDe(c), palavras || []);
      var sugestao = especialidades[0] && especialidades[0].valor > 0 ? especialidades[0] : null;
      if (!sugestao) {
        var pe = achadas.filter(function (p) { return p.especialidade_id; })[0];
        if (pe) sugestao = { especialidade_id: pe.especialidade_id, valor: null, porPalavra: pe.termo };
      }
      return {
        candidata: c,
        maisParecida: sims[0] && sims[0].valor > 0 ? sims[0] : null,
        semelhantes: sims.filter(function (s) { return s.valor > 0; }).slice(0, 3),
        especialidades: especialidades,
        sugestao: sugestao,
        palavras: achadas
      };
    });
  }

  function textoDe(p) { return [p.ementa, p.indexacao, p.tema_casa].filter(Boolean).join(' '); }
  function percentual(v) { return Math.round((v || 0) * 100); }

  var api = { normalizar: normalizar, radicais: radicais, analisar: analisar, percentual: percentual, palavrasEncontradas: palavrasEncontradas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else raiz.PanoramaSimilaridade = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
