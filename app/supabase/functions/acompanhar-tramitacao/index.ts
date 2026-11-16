// Acompanha a tramitação das proposições monitoradas, todo dia às 7h20 (melhorias.sql) ou pelo botão "Atualizar agora".
// Para cada proposição (uma vez só, mesmo que vários clientes a monitorem):
// - guarda a linha do tempo em "tramitacoes" (Câmara: /proposicoes/{id}/tramitacoes; Senado: /dadosabertos/processo/{id});
// - atualiza situação, órgão atual, relator, regime e forma de apreciação em "proposicoes";
// - cria avisos quando ela anda (relator designado, pauta, prazo de emendas, votação) e uma tarefa para o prazo de emendas.
// Corpo opcional: { "proposicao_id": "<uuid>" } confere só aquela (o app usa ao abrir o detalhe ou no botão).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const CAMARA = 'https://dadosabertos.camara.leg.br/api/v2';
const SENADO = 'https://legis.senado.leg.br/dadosabertos';
const POR_RODADA = 120;          // proposições por execução (as mais antigas primeiro), para caber no tempo da função
const normalizar = (t: string) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function json(url: string, tentativas = 3): Promise<any> {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (r.ok) return await r.json();
    if (r.status === 404) return null;
    throw new Error(`${url} respondeu ${r.status}`);
  } catch (e) {
    if (tentativas <= 1) throw e;
    await new Promise((ok) => setTimeout(ok, 2000));
    return json(url, tentativas - 1);
  }
}

type Passo = { quando: string; orgao: string | null; descricao: string | null; despacho: string | null; situacao: string | null; url: string | null; marca: string };
type Estado = {
  id_casa: string; passos: Passo[]; situacao: string | null; orgao_atual: string | null; relator: string | null;
  regime: string | null; apreciacao: string | null; tramitando: boolean | null;
};

// ---------- Câmara ----------
async function idCamara(p: any): Promise<string | null> {
  if (p.id_casa) return p.id_casa;
  if (/^CD:\d+$/.test(p.id_externo ?? '')) return p.id_externo.slice(3);
  const j = await json(`${CAMARA}/proposicoes?siglaTipo=${encodeURIComponent(p.sigla)}&numero=${encodeURIComponent(p.numero)}&ano=${p.ano}&itens=5`);
  return j?.dados?.[0]?.id ? String(j.dados[0].id) : null;
}
const relatores = new Map<string, string | null>();
async function nomeRelator(uri: string | null | undefined): Promise<string | null> {
  if (!uri) return null;
  if (!relatores.has(uri)) {
    const j = await json(uri).catch(() => null);
    const s = j?.dados?.ultimoStatus;
    relatores.set(uri, s?.nome ? `Dep. ${s.nomeEleitoral || s.nome} (${s.siglaPartido}/${s.siglaUf})` : null);
  }
  return relatores.get(uri) ?? null;
}
async function camara(p: any): Promise<Estado | null> {
  const id = await idCamara(p);
  if (!id) return null;
  const [det, tram] = await Promise.all([json(`${CAMARA}/proposicoes/${id}`), json(`${CAMARA}/proposicoes/${id}/tramitacoes`)]);
  const st = det?.dados?.statusProposicao ?? {};
  const passos: Passo[] = (tram?.dados ?? []).map((t: any) => ({
    quando: new Date((t.dataHora || '').length === 16 ? t.dataHora + ':00-03:00' : t.dataHora).toISOString(),
    orgao: t.siglaOrgao ?? null, descricao: t.descricaoTramitacao ?? null, despacho: t.despacho ?? null,
    situacao: t.descricaoSituacao ?? null, url: t.url ?? null, marca: `seq:${t.sequencia}`,
  }));
  const situacao = st.descricaoSituacao ?? null;
  return {
    id_casa: id, passos, situacao, orgao_atual: st.siglaOrgao ?? null, relator: await nomeRelator(st.uriUltimoRelator),
    regime: st.regime ?? null, apreciacao: st.apreciacao ?? null,
    tramitando: situacao ? !/arquivad|transformad[oa] em norma|retirad/i.test(situacao) : null,
  };
}

// ---------- Senado ----------
async function idSenado(p: any): Promise<string | null> {
  if (p.id_casa) return p.id_casa;
  const lista = await json(`${SENADO}/processo?sigla=${encodeURIComponent(p.sigla)}&numero=${encodeURIComponent(p.numero)}&ano=${p.ano}`);
  const codigo = /^SF:\d+$/.test(p.id_externo ?? '') ? Number(p.id_externo.slice(3)) : null;
  const achado = (Array.isArray(lista) ? lista : []).find((x: any) => codigo ? x.codigoMateria === codigo : true);
  return achado?.id ? String(achado.id) : null;
}
async function senado(p: any): Promise<Estado | null> {
  const id = await idSenado(p);
  if (!id) return null;
  const d = await json(`${SENADO}/processo/${id}`);
  if (!d) return null;
  const informes = (d.autuacoes ?? []).flatMap((a: any) => a.informesLegislativos ?? []);
  const passos: Passo[] = informes.map((i: any) => ({
    quando: new Date(String(i.data).replace(' ', 'T') + (String(i.data).length > 10 ? '-03:00' : 'T12:00:00-03:00')).toISOString(),
    orgao: i.colegiado?.sigla || i.enteAdministrativo?.sigla || null, descricao: i.descricao ?? null, despacho: null,
    situacao: i.siglaSituacaoIniciada ? (d.autuacoes ?? []).flatMap((a: any) => a.situacoes ?? []).find((s: any) => s.sigla === i.siglaSituacaoIniciada)?.descricao ?? null : null,
    url: null, marca: `inf:${i.id}`,
  }));
  // Relator: o informe mais recente que fala em relatoria ("Designado Relator o Senador ...", "Distribuído ao Senador ...")
  let relator: string | null = null;
  const NOME = /(?:[Dd]esignad[oa]s?\s+[Rr]elator[a]?[^.]*?|[Dd]istribu[ií]d[oa]\s+(?:a[oa]\s+)?)(Senador[a]?\s+[A-ZÀ-Ú][\wÀ-ú'-]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ú][\wÀ-ú'-]+)*)/;
  for (const i of [...informes].sort((a: any, b: any) => String(b.data).localeCompare(String(a.data)))) {
    const t = String(i.descricao ?? '');
    if (/encerrada a relatoria/i.test(t)) break;
    const m = t.match(NOME);
    if (m) { relator = m[1].trim(); break; }
  }
  const autuacao = (d.autuacoes ?? [])[0] ?? {};
  const urgencia = informes.some((i: any) => /urg[eê]ncia/i.test(i.descricao ?? '') && /aprovad/i.test(i.descricao ?? ''));
  return {
    id_casa: id, passos, situacao: d.situacaoAtual ?? null, orgao_atual: autuacao.siglaEnteControleAtual ?? null, relator,
    regime: urgencia ? 'Urgência' : null, apreciacao: null, tramitando: d.tramitando ? d.tramitando === 'Sim' : null,
  };
}

// ---------- o que cada passo novo significa ----------
function classificar(passos: Passo[]) {
  const texto = (x: Passo) => normalizar([x.descricao, x.despacho, x.situacao].filter(Boolean).join(' '));
  if (passos.some((x) => /aprovad|rejeitad|votacao|vota[cç][aã]o|sancionad|vetad|transformad/.test(texto(x)))) return 'votacao';
  if (passos.some((x) => /(designad|design[oa]u?|distribuid)[^.]*relator|relator[a]? designad|parecer do relator/.test(texto(x)))) return 'relator';
  if (passos.some((x) => /pauta|ordem do dia/.test(texto(x)))) return 'pauta';
  if (passos.some((x) => /abertura de prazo|prazo para (apresentacao de )?emendas[^.]*(a partir|\d{2}\/\d{2}\/\d{4} a)/.test(texto(x)))) return 'prazo';
  return 'tramitacao';
}
const TITULOS: Record<string, string> = {
  votacao: 'foi votada', relator: 'tem relator', pauta: 'entrou em pauta', prazo: 'abriu prazo de emendas', tramitacao: 'andou',
};
// Fim do prazo de emendas. O Senado costuma trazer as duas datas ("... de 12/11/2026 a 19/11/2026"); a Câmara só a abertura
// ("Abertura de Prazo para Emendas ao Projeto (5 sessões) a partir de 12/11/2026"): conta 7 dias corridos, como estimativa.
function fimPrazoEmendas(passos: Passo[]): { fim: string; orgao: string | null; estimado: boolean } | null {
  for (const x of passos) {
    const t = [x.descricao, x.despacho].filter(Boolean).join(' ');
    if (!/prazo[^.]*emendas/i.test(t) || /encerra/i.test(t)) continue;
    const m = t.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(?:a|at[eé])\s*(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return { fim: `${m[6]}-${m[5]}-${m[4]}`, orgao: x.orgao, estimado: false };
    const a = t.match(/a partir de (\d{2})\/(\d{2})\/(\d{4})/i);
    if (a) {
      const fim = new Date(Date.UTC(+a[3], +a[2] - 1, +a[1] + 7)).toISOString().slice(0, 10);
      return { fim, orgao: x.orgao, estimado: true };
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const corpo = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const erros: string[] = [];

  // Pedido do app para uma proposição: só se quem pede pode ver aquele cliente
  let filtro: string | null = null;
  if (typeof corpo.proposicao_id === 'string') {
    const doUsuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data } = await doUsuario.from('proposicoes').select('id').eq('id', corpo.proposicao_id).maybeSingle();
    if (!data) return resposta({ erro: 'Proposição não encontrada' }, 404);
    filtro = corpo.proposicao_id;
  }

  const campos = 'id, cliente_id, casa, sigla, numero, ano, id_externo, id_casa, situacao, tramitacao_conferida_em';
  let consulta = sb.from('proposicoes').select(campos);
  if (filtro) {
    const { data: alvo } = await sb.from('proposicoes').select('casa, sigla, numero, ano').eq('id', filtro).single();
    consulta = consulta.eq('casa', alvo!.casa).eq('sigla', alvo!.sigla).eq('numero', alvo!.numero).eq('ano', alvo!.ano);
  }
  const { data: todas, error } = await consulta.order('tramitacao_conferida_em', { ascending: true, nullsFirst: true }).limit(5000);
  if (error) return resposta({ erros: [error.message] }, 500);

  // Uma consulta por proposição, mesmo que vários clientes a monitorem
  const grupos = new Map<string, any[]>();
  for (const p of todas ?? []) {
    const k = [p.casa, String(p.sigla).toUpperCase(), String(p.numero).replace(/^0+/, ''), p.ano].join(':');
    grupos.set(k, [...(grupos.get(k) ?? []), p]);
  }
  const fila = [...grupos.values()].slice(0, POR_RODADA);
  const hoje = new Date().toISOString().slice(0, 10);
  let conferidas = 0, comNovidade = 0;

  async function conferir(lista: any[]) {
    const p = lista.find((x) => x.id_casa) ?? lista[0];
    const estado = p.casa === 'CD' ? await camara(p) : await senado(p);
    const agora = new Date().toISOString();
    if (!estado) {
      await sb.from('proposicoes').update({ tramitacao_conferida_em: agora }).in('id', lista.map((x) => x.id));
      return;
    }
    const ref = `${p.casa}:${estado.id_casa}`;
    const { count } = await sb.from('tramitacoes').select('id', { count: 'exact', head: true }).eq('ref', ref);
    const primeira = !count;
    let novos: Passo[] = [];
    for (let i = 0; i < estado.passos.length; i += 300) {
      const { data, error } = await sb.from('tramitacoes')
        .upsert(estado.passos.slice(i, i + 300).map((x) => ({ ...x, ref })), { onConflict: 'ref,marca', ignoreDuplicates: true })
        .select('quando, orgao, descricao, despacho, situacao, url, marca');
      if (error) erros.push(error.message); else novos = novos.concat(data ?? []);
    }
    const ultima = estado.passos.reduce((m, x) => (x.quando > m ? x.quando : m), '');
    const { error: e2 } = await sb.from('proposicoes').update({
      id_casa: estado.id_casa, situacao: estado.situacao ?? undefined, orgao_atual: estado.orgao_atual, relator: estado.relator,
      regime: estado.regime, apreciacao: estado.apreciacao, tramitando: estado.tramitando,
      ultima_tramitacao_em: ultima || null, tramitacao_conferida_em: agora,
    }).in('id', lista.map((x) => x.id));
    if (e2) erros.push(e2.message);
    conferidas++;
    // Na primeira vez, a história inteira entra sem avisos; depois, cada passo novo vira aviso
    if (primeira || !novos.length) return;
    comNovidade++;
    novos.sort((a, b) => a.quando.localeCompare(b.quando));
    const tipo = classificar(novos);
    const ident = `${String(p.sigla).toUpperCase()} ${p.numero}/${p.ano}`;
    const linhas = novos.slice(-6).map((x) => `${new Date(x.quando).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · ${x.orgao ?? ''} · ${x.descricao ?? ''}${x.despacho ? ': ' + x.despacho : ''}`.slice(0, 400));
    const prazo = fimPrazoEmendas(novos);
    for (const x of lista) {
      const { error: e3 } = await sb.from('avisos').insert({
        cliente_id: x.cliente_id, proposicao_id: x.id, tipo, link: `?proposicao=${x.id}`,
        titulo: `${ident} (${p.casa === 'CD' ? 'Câmara' : 'Senado'}) ${TITULOS[tipo]}`, texto: linhas.join('\n'),
      });
      if (e3) erros.push(e3.message);
      if (prazo && prazo.fim >= hoje) {
        const { error: e4 } = await sb.from('tarefas').insert({
          cliente_id: x.cliente_id, proposicao_id: x.id, prioridade: 'alta', status: 'aberta', prazo: prazo.fim,
          titulo: `Prazo de emendas: ${ident}${prazo.orgao ? ' na ' + prazo.orgao : ''}`, origem: `emendas:${ref}:${prazo.fim}`,
          notas: prazo.estimado ? 'Criada pelo app a partir da tramitação. Data estimada: a Câmara conta o prazo em sessões (em geral 5), confira na pauta da comissão.' : 'Criada pelo app a partir da tramitação.',
        });
        if (e4 && !/duplicate|unique/i.test(e4.message)) erros.push(e4.message);
      }
    }
  }

  // Cinco de cada vez, para não sobrecarregar as Casas
  for (let i = 0; i < fila.length; i += 5) {
    await Promise.all(fila.slice(i, i + 5).map((l) => conferir(l).catch((e) => { erros.push(String(e).slice(0, 300)); })));
  }
  return resposta({ conferidas, comNovidade, pendentes: Math.max(0, grupos.size - fila.length), erros: erros.slice(0, 20) });
});
