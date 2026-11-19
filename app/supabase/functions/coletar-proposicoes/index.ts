// Coleta as proposições apresentadas ontem e hoje na Câmara e no Senado.
// Roda todo dia pelo agendamento (agendamento.sql) e quando alguém toca em "Buscar agora" no app.
// Tudo o que chega vai para "entradas", que alimenta a contagem por tipo da aba Geral.
// Cada cliente recebe em "candidatas" só o que pode interessar: tem uma das palavras-chave dele ou é ao menos 5% parecido
// com uma proposição que ele já monitora (a mesma conta de app/similaridade.js). O app mostra acima da similaridade
// mínima do cliente e guarda o resto para "Mostrar mais". Quando há novas de interesse, cria um aviso para a equipe.
// Para preencher dias passados: corpo {"inicio": "2026-10-01", "fim": "2026-10-31", "soEntradas": true}, até 31 dias por vez.
// Quem pode chamar: o agendamento (cabeçalho x-coleta-segredo igual ao segredo "coleta_segredo" do Vault, que a função lê pelo
// banco com segredo_coleta(); COLETA_SEGREDO nos segredos das funções vale no lugar, se existir) ou uma pessoa com login no app,
// esta no máximo uma vez a cada 3 minutos e só para ontem e hoje. A chave pública (anon) sozinha não basta.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Candidata = {
  id_externo: string; casa: 'CD' | 'SF'; sigla: string; numero: string; ano: string; ementa: string;
  autor?: string; situacao?: string; data_apresentacao: string | null; url: string; tema_casa?: string; url_inteiro_teor?: string;
};

// Documentos de tramitação da Câmara (pareceres, emendas, substitutivos, redações, requerimentos de pauta, atas):
// entram em "entradas" para a aba Geral poder incluí-los, mas não viram candidatas. Mesma lista de app/casas.js.
const ACESSORIOS = new Set(('PRL PAR PARF PRLP PRLE PPP PEP PPR RRL REL VTS RDF ERD DTQ RPD RPDR SBT SBE SBR SSP ' +
  'EMC EMP EMS EMR EMA EML EMD EMO ESB EMRP ATA DOC AVN OF').split(' '));
const principal = (c: Candidata) => !ACESSORIOS.has(c.sigla.toUpperCase().replace(/-.*$/, '')) && c.ano !== '0';

const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
// Compara sem revelar pelo tempo de resposta onde está a primeira diferença
function iguais(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}
const ESPERA_MS = 3 * 60_000;

const dia = (d: Date) => d.toISOString().slice(0, 10);
const normalizar = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// ---------- semelhança: mesma conta de app/similaridade.js (TF-IDF com cosseno sobre ementa e tema) ----------
const VAZIAS = new Set(('a o e é as os um uma uns umas de da do das dos em na no nas nos por pela pelo pelas pelos para pra com sem sob sobre ' +
  'que se ao aos à às ou nao não mais menos como entre ate até apos após seu sua seus suas este esta estes estas esse essa isso ' +
  'dispoe dispõe dispor altera alterar alteracao alteração acrescenta acrescentar inclui incluir institui instituir estabelece ' +
  'lei leis decreto decretos legislativo complementar federal nacional art arts artigo artigos inciso incisos paragrafo parágrafo ' +
  'caput dar da dá outras outra providencias providências redacao redação nº n° numero número termos fim fins forma ' +
  'susta sustar efeitos ato atos dia ano anos janeiro fevereiro marco março abril maio junho julho agosto setembro outubro ' +
  'novembro dezembro projeto proposta requer requerimento solicita senhor senhora ministro ministra').split(/\s+/).map(normalizar));
type Vetor = { pesos: Map<string, number>; norma: number };
const radicais = (t: string) => normalizar(t).split(/[^a-z0-9]+/)
  .filter((p) => p.length >= 3 && !VAZIAS.has(p) && !/^\d+$/.test(p)).map((p) => p.length > 6 ? p.slice(0, 6) : p);
function vetorizar(textos: string[]): Vetor[] {
  const listas = textos.map(radicais), df = new Map<string, number>();
  listas.forEach((l) => new Set(l).forEach((r) => df.set(r, (df.get(r) ?? 0) + 1)));
  return listas.map((l) => {
    const tf = new Map<string, number>(), pesos = new Map<string, number>();
    l.forEach((r) => tf.set(r, (tf.get(r) ?? 0) + 1));
    let norma = 0;
    tf.forEach((n, r) => { const w = (1 + Math.log(n)) * Math.log(1 + listas.length / df.get(r)!); pesos.set(r, w); norma += w * w; });
    return { pesos, norma: Math.sqrt(norma) };
  });
}
function cosseno(a: Vetor, b: Vetor) {
  if (!a.norma || !b.norma) return 0;
  const [menor, maior] = a.pesos.size < b.pesos.size ? [a, b] : [b, a];
  let soma = 0;
  menor.pesos.forEach((w, r) => { const x = maior.pesos.get(r); if (x) soma += w * x; });
  return soma / (a.norma * b.norma);
}
const textoDe = (p: { ementa?: string; tema_casa?: string | null }) => [p.ementa, p.tema_casa].filter(Boolean).join(' ');
const comPalavra = (texto: string, termos: string[]) => {
  const t = ' ' + normalizar(texto).replace(/[^a-z0-9]+/g, ' ') + ' ';
  return termos.filter((termo) => { const x = normalizar(termo).replace(/[^a-z0-9]+/g, ' ').trim(); return x && t.includes(' ' + x); });
};

// A Câmara às vezes responde 504 ou 429 numa página: tenta de novo duas vezes antes de desistir
async function json(url: string, tentativas = 3): Promise<any> {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (r.ok) return r.json();
  if (tentativas > 1 && (r.status >= 500 || r.status === 429)) {
    await new Promise((ok) => setTimeout(ok, 2000));
    return json(url, tentativas - 1);
  }
  throw new Error(`${url} respondeu ${r.status}`);
}

// Câmara: https://dadosabertos.camara.leg.br/swagger/api.html (paginada de 100 em 100)
async function camara(inicio: string, fim: string): Promise<Candidata[]> {
  const itens: any[] = [];
  let url: string | undefined = 'https://dadosabertos.camara.leg.br/api/v2/proposicoes' +
    `?dataApresentacaoInicio=${inicio}&dataApresentacaoFim=${fim}&itens=100&ordem=ASC&ordenarPor=id`;
  for (let paginas = 0; url && paginas < 120; paginas++) {
    const j = await json(url);
    itens.push(...(j.dados ?? []));
    url = (j.links ?? []).find((l: any) => l.rel === 'next')?.href;
  }
  return itens.map((p) => ({
    id_externo: `CD:${p.id}`, casa: 'CD', sigla: p.siglaTipo, numero: String(p.numero), ano: String(p.ano),
    ementa: p.ementa ?? '', data_apresentacao: (p.dataApresentacao ?? '').slice(0, 10) || null,
    url: `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${p.id}`,
  }));
}

// Senado: serviço /dadosabertos/processo, que substituiu a antiga pesquisa de matérias
async function senado(inicio: string, fim: string): Promise<Candidata[]> {
  const lista: any[] = await json('https://legis.senado.leg.br/dadosabertos/processo' +
    `?dataInicioApresentacao=${inicio}&dataFimApresentacao=${fim}`);
  return (Array.isArray(lista) ? lista : []).flatMap((p) => {
    const m = String(p.identificacao ?? '').match(/^([A-Z]+)\s+(\d+)\/(\d{4})/);
    if (!m || p.casaIdentificadora !== 'SF') return [];
    return [{
      id_externo: `SF:${p.codigoMateria ?? p.id}`, casa: 'SF' as const, sigla: m[1], numero: String(Number(m[2])), ano: m[3],
      ementa: p.ementa ?? '', autor: p.autoria ?? '', situacao: p.situacaoAtual ?? '',
      data_apresentacao: (p.dataApresentacao ?? '').slice(0, 10) || null,
      url: p.codigoMateria ? `https://www25.senado.leg.br/web/atividade/materias/-/materia/${p.codigoMateria}` : '',
      url_inteiro_teor: p.urlDocumento ?? '',
    }];
  });
}

// Tema da Câmara só para as que batem com alguma palavra-chave, para não fazer centenas de chamadas por dia
async function temasDaCamara(itens: Candidata[], palavras: string[]) {
  const termos = palavras.map((p) => ' ' + normalizar(p).replace(/[^a-z0-9]+/g, ' ').trim()).filter((t) => t.trim());
  const alvos = itens.filter((c) => c.casa === 'CD' &&
    termos.some((t) => (' ' + normalizar(c.ementa).replace(/[^a-z0-9]+/g, ' ')).includes(t))).slice(0, 60);
  await Promise.all(alvos.map(async (c) => {
    try {
      const j = await json(`https://dadosabertos.camara.leg.br/api/v2/proposicoes/${c.id_externo.slice(3)}/temas`);
      c.tema_casa = (j.dados ?? []).map((t: any) => t.tema).filter(Boolean).join(', ');
    } catch { /* segue sem o tema */ }
  }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // ---------- quem chama ----------
  const enviado = req.headers.get('x-coleta-segredo') ?? '';
  let segredo = Deno.env.get('COLETA_SEGREDO') ?? '';
  if (enviado && !segredo) segredo = String((await sb.rpc('segredo_coleta')).data ?? '');
  const agendada = segredo.length >= 16 && iguais(enviado, segredo);
  let pessoa: string | null = null;
  if (!agendada) {
    const comoQuemChama = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data } = await comoQuemChama.auth.getUser();
    pessoa = data?.user?.id ?? null;
    if (!pessoa) return resposta({ erro: 'Entre de novo no app.' }, 401);
  }
  // Uma busca a cada 3 minutos para o projeto todo: a coleta é cara e consulta as Casas centenas de vezes.
  // Registra primeiro e depois confere quem chegou antes, para duas chamadas ao mesmo tempo não passarem juntas.
  const { data: minha, error: erroRegistro } = await sb.from('coletas').insert({ origem: agendada ? 'agendamento' : 'app', pessoa }).select('id').single();
  if (erroRegistro) return resposta({ erro: 'A tabela coletas não existe. Rode de novo supabase/relgov.sql.' }, 500);
  if (!agendada) {
    const { data: primeira } = await sb.from('coletas').select('id').gte('iniciada_em', new Date(Date.now() - ESPERA_MS).toISOString())
      .order('id', { ascending: true }).limit(1).maybeSingle();
    if (primeira && primeira.id !== minha.id) {
      await sb.from('coletas').delete().eq('id', minha.id);
      return resposta({ erro: 'Uma busca acabou de rodar. Espere uns minutos e tente de novo.' }, 429);
    }
  }

  const hoje = new Date(), ontem = new Date(hoje.getTime() - 864e5);
  const erros: string[] = [];
  const corpo = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const dataValida = (t: unknown) => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t);
  let inicio = dia(ontem), fim = dia(hoje);
  if (agendada && dataValida(corpo.inicio) && dataValida(corpo.fim) && corpo.inicio <= corpo.fim) {
    if (Date.parse(corpo.fim) - Date.parse(corpo.inicio) > 31 * 864e5) {
      return resposta({ erros: ['Use no máximo 31 dias por vez'] }, 400);
    }
    inicio = corpo.inicio; fim = corpo.fim;
  }

  const [cd, sf] = await Promise.all([
    camara(inicio, fim).catch((e) => { erros.push(String(e)); return []; }),
    senado(inicio, fim).catch((e) => { erros.push(String(e)); return []; }),
  ]);
  const todas = [...cd, ...sf];

  // Contagem da aba Geral: guarda tudo o que foi apresentado, monitorado ou não
  const entradas = todas.filter((c) => c.data_apresentacao)
    .map((c) => ({ id_externo: c.id_externo, casa: c.casa, sigla: c.sigla, numero: c.numero, ano: c.ano, ementa: c.ementa,
      autor: c.autor ?? null, url: c.url, url_inteiro_teor: c.url_inteiro_teor ?? null, data_apresentacao: c.data_apresentacao }));
  for (let i = 0; i < entradas.length; i += 500) {
    const { error } = await sb.from('entradas').upsert(entradas.slice(i, i + 500), { onConflict: 'id_externo' });
    if (error) erros.push(error.message);
  }
  const coletadas = todas.filter(principal);
  if (agendada && corpo.soEntradas) {
    return new Response(JSON.stringify({ entradas: entradas.length, camara: cd.length, senado: sf.length, erros }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Cada cliente recebe só o que pode interessar a ele, fora o que já monitora
  // (sem a coluna limiar, de melhorias.sql, usa 20%)
  let { data: clientes, error: erroClientes } = await sb.from('clientes').select('id, limiar');
  if (erroClientes) ({ data: clientes, error: erroClientes } = await sb.from('clientes').select('id') as any);
  if (erroClientes) erros.push(erroClientes.message);
  const chave = (p: any) => [p.casa, String(p.sigla).toUpperCase(), String(p.numero).replace(/^0+/, ''), p.ano].join(':');

  const { data: palavras } = await sb.from('palavras').select('termo, cliente_id');
  await temasDaCamara(coletadas, [...new Set((palavras ?? []).map((p: any) => String(p.termo)))]);

  let novas = 0;
  const id = (c: Candidata) => `${c.sigla} ${c.numero}/${c.ano} (${c.casa === 'CD' ? 'Câmara' : 'Senado'})`;
  for (const cliente of clientes ?? []) {
    const { data: monitoradas } = await sb.from('proposicoes').select('casa, sigla, numero, ano, ementa, tema_casa').eq('cliente_id', cliente.id);
    const termos = (palavras ?? []).filter((p: any) => p.cliente_id === cliente.id).map((p: any) => String(p.termo));
    const mon = monitoradas ?? [];
    if (!mon.length && !termos.length) continue;
    const ja = new Set(mon.map(chave));
    const ineditas = coletadas.filter((c) => !ja.has(chave(c)));
    const vetores = vetorizar([...mon.map(textoDe), ...ineditas.map(textoDe)]);
    const vm = vetores.slice(0, mon.length), vc = vetores.slice(mon.length);
    const avaliadas = ineditas.map((c, i) => ({
      c, palavras: comPalavra(textoDe(c), termos),
      pct: Math.round(Math.max(0, ...vm.map((v) => cosseno(vc[i], v))) * 100),
    })).filter((a) => a.palavras.length || a.pct >= 5);
    const doCliente = avaliadas.map((a) => ({ ...a.c, cliente_id: cliente.id }));
    const inseridas = new Set<string>();
    for (let i = 0; i < doCliente.length; i += 200) {
      const { data, error } = await sb.from('candidatas')
        .upsert(doCliente.slice(i, i + 200), { onConflict: 'cliente_id,id_externo', ignoreDuplicates: true }).select('id_externo');
      if (error) erros.push(error.message); else (data ?? []).forEach((d: any) => inseridas.add(d.id_externo));
    }
    novas += inseridas.size;
    // Aviso para a equipe: só as que passam da similaridade mínima do cliente (ou têm palavra-chave)
    const relevantes = avaliadas.filter((a) => inseridas.has(a.c.id_externo) && (a.palavras.length || a.pct >= (cliente.limiar ?? 20)));
    if (relevantes.length) {
      const linhas = relevantes.slice(0, 8).map((a) => `${id(a.c)}: ${a.c.ementa.slice(0, 140)}${a.c.ementa.length > 140 ? '…' : ''}` +
        (a.palavras.length ? ` [palavra-chave: ${a.palavras.join(', ')}]` : ` [${a.pct}% parecida]`));
      if (relevantes.length > 8) linhas.push(`e mais ${relevantes.length - 8}.`);
      const { error } = await sb.from('avisos').insert({
        cliente_id: cliente.id, tipo: 'nova', link: '?secao=novas',
        titulo: relevantes.length === 1 ? `1 proposição nova de interesse: ${id(relevantes[0].c)}` : `${relevantes.length} proposições novas de interesse`,
        texto: linhas.join('\n'),
      });
      if (error && !/avisos/.test(error.message)) erros.push(error.message);
    }
  }

  // Limpa o que ninguém revisou em 60 dias
  await sb.from('candidatas').delete().neq('status', 'monitorada').lt('coletado_em', new Date(hoje.getTime() - 60 * 864e5).toISOString());

  return new Response(JSON.stringify({ novas, clientes: (clientes ?? []).length, camara: cd.length, senado: sf.length, erros }), {
    headers: { ...cors, 'Content-Type': 'application/json' }, status: erros.length && !novas && !cd.length && !sf.length ? 502 : 200,
  });
});
