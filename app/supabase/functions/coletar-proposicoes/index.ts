// Coleta as proposições apresentadas ontem e hoje na Câmara e no Senado e guarda em "candidatas".
// Roda todo dia pelo agendamento (agendamento.sql) e quando alguém toca em "Buscar agora" no app.
// Traz tudo o que foi apresentado: o app decide o que mostrar (palavras-chave e semelhança com as monitoradas).
// Tudo o que chega também vai para "entradas", que alimenta a contagem por tipo da aba Geral.
// Para preencher dias passados: corpo {"inicio": "2026-10-01", "fim": "2026-10-31", "soEntradas": true}, até 31 dias por vez.
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

const dia = (d: Date) => d.toISOString().slice(0, 10);
const normalizar = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

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
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const hoje = new Date(), ontem = new Date(hoje.getTime() - 864e5);
  const erros: string[] = [];
  const corpo = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const dataValida = (t: unknown) => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t);
  let inicio = dia(ontem), fim = dia(hoje);
  if (dataValida(corpo.inicio) && dataValida(corpo.fim) && corpo.inicio <= corpo.fim) {
    if (Date.parse(corpo.fim) - Date.parse(corpo.inicio) > 31 * 864e5) {
      return new Response(JSON.stringify({ erros: ['Use no máximo 31 dias por vez'] }), { headers: { ...cors, 'Content-Type': 'application/json' }, status: 400 });
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
  let coletadas = todas.filter(principal);
  if (corpo.soEntradas) {
    return new Response(JSON.stringify({ entradas: entradas.length, camara: cd.length, senado: sf.length, erros }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Não traz de volta o que já é monitorado
  const { data: monitoradas } = await sb.from('proposicoes').select('casa, sigla, numero, ano');
  const chave = (p: any) => [p.casa, String(p.sigla).toUpperCase(), String(p.numero).replace(/^0+/, ''), p.ano].join(':');
  const ja = new Set((monitoradas ?? []).map(chave));
  coletadas = coletadas.filter((c) => !ja.has(chave(c)));

  const { data: palavras } = await sb.from('palavras').select('termo');
  await temasDaCamara(coletadas, (palavras ?? []).map((p: any) => p.termo));

  let novas = 0;
  for (let i = 0; i < coletadas.length; i += 200) {
    const { data, error } = await sb.from('candidatas')
      .upsert(coletadas.slice(i, i + 200), { onConflict: 'id_externo', ignoreDuplicates: true }).select('id');
    if (error) erros.push(error.message); else novas += data?.length ?? 0;
  }

  // Limpa o que ninguém revisou em 60 dias
  await sb.from('candidatas').delete().neq('status', 'monitorada').lt('coletado_em', new Date(hoje.getTime() - 60 * 864e5).toISOString());

  return new Response(JSON.stringify({ novas, camara: cd.length, senado: sf.length, erros }), {
    headers: { ...cors, 'Content-Type': 'application/json' }, status: erros.length && !novas && !cd.length && !sf.length ? 502 : 200,
  });
});
