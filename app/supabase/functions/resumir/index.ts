// Resumo automático de uma proposição monitorada, feito pelo Claude a partir do inteiro teor (ou da ementa, se o texto
// ainda não foi lido). Corpo: { proposicao_id }. Guarda o resultado em proposicoes.resumo_ia para toda a equipe ver.
// Segredo necessário: ANTHROPIC_API_KEY (Edge Functions > Secrets). O texto é editável no app antes de virar alerta.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import Anthropic from 'npm:@anthropic-ai/sdk@1.4.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const LIMITE = 1_500_000; // caracteres; acima disso o texto não cabe numa leitura só

const INSTRUCOES = `Você é analista de relações governamentais no Brasil. Leia a proposição legislativa e escreva, em português do Brasil,
um resumo para a equipe que acompanha o cliente. Use texto simples, sem markdown, com estas quatro partes, cada uma começando pelo rótulo:
O que propõe: duas ou três frases com a mudança concreta.
Quem é afetado: setores, empresas, órgãos ou pessoas atingidos.
Pontos de atenção: obrigações novas, prazos, penalidades, custos, riscos ou oportunidades.
Tramitação: o que a ementa ou o texto indicam sobre regime e próximos passos, se houver.
No máximo 250 palavras. Não invente o que não estiver no texto; se o texto completo não foi fornecido, diga que o resumo se baseia só na ementa.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const chave = Deno.env.get('ANTHROPIC_API_KEY');
  if (!chave) return resposta({ erro: 'O resumo por IA ainda não foi ligado: falta o segredo ANTHROPIC_API_KEY no Supabase.' }, 503);
  const corpo = await req.json().catch(() => ({}));
  if (typeof corpo.proposicao_id !== 'string') return resposta({ erro: 'Informe a proposição' }, 400);

  // Lê com o login de quem pede: as regras do banco garantem que a pessoa vê aquele cliente
  const usuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: p } = await usuario.from('proposicoes')
    .select('id, casa, sigla, numero, ano, ementa, autor, tema_casa, regime, situacao, inteiro_teor').eq('id', corpo.proposicao_id).maybeSingle();
  if (!p) return resposta({ erro: 'Proposição não encontrada' }, 404);
  const texto = String(p.inteiro_teor ?? '').trim();
  if (texto.length > LIMITE) return resposta({ erro: 'O inteiro teor é grande demais para resumir de uma vez.' }, 413);

  const cabecalho = [`${p.sigla} ${p.numero}/${p.ano} (${p.casa === 'CD' ? 'Câmara dos Deputados' : 'Senado Federal'})`,
    `Ementa: ${p.ementa}`, p.autor ? `Autor: ${p.autor}` : '', p.tema_casa ? `Tema: ${p.tema_casa}` : '',
    p.regime ? `Regime: ${p.regime}` : '', p.situacao ? `Situação: ${p.situacao}` : ''].filter(Boolean).join('\n');
  const conteudo = texto ? `${cabecalho}\n\nInteiro teor:\n${texto}` : `${cabecalho}\n\n(O inteiro teor não foi fornecido.)`;

  const cliente = new Anthropic({ apiKey: chave });
  try {
    // deno-lint-ignore no-explicit-any
    const params: any = {
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: INSTRUCOES,
      messages: [{ role: 'user', content: conteudo }],
    };
    const r = await cliente.beta.messages.stream(params).finalMessage();
    if (r.stop_reason === 'refusal') return resposta({ erro: 'O modelo não quis resumir este texto.' }, 422);
    const resumo = r.content.filter((b: { type: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('').trim();
    if (!resumo) return resposta({ erro: 'O resumo voltou vazio. Tente de novo.' }, 502);
    const servidor = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const agora = new Date().toISOString();
    await servidor.from('proposicoes').update({ resumo_ia: resumo, resumo_ia_em: agora })
      .eq('casa', p.casa).eq('sigla', p.sigla).eq('numero', p.numero).eq('ano', p.ano).is('resumo_ia', null);
    await servidor.from('proposicoes').update({ resumo_ia: resumo, resumo_ia_em: agora }).eq('id', p.id);
    return resposta({ resumo, baseado_em: texto ? 'inteiro teor' : 'ementa' });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return resposta({ erro: 'Muitos pedidos de resumo agora. Tente em um minuto.' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return resposta({ erro: 'A chave ANTHROPIC_API_KEY não foi aceita.' }, 503);
    if (e instanceof Anthropic.APIError) return resposta({ erro: 'O serviço de IA respondeu com erro: ' + e.message }, 502);
    return resposta({ erro: 'Não foi possível resumir agora.' }, 500);
  }
});
