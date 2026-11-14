// =====================================================================
// SuperMercado — Edge Function `promocoes` (v0.6.0)
// Google Shopping (SerpAPI) do lado do SERVIDOR.
//
// Por que existe (manual 05 — "backend faz o que o navegador não pode"):
//   • o navegador não alcança o Google Shopping (sem CORS);
//   • a chave da API não pode entrar no bundle (vai no `Secrets` daqui).
//
// Ela lê o cache (`buscas_cache`), e só se não achar chama o SerpAPI.
// Proteção do plano grátis (100 buscas/mês):
//   • cache de 72 h por termo — repetição NÃO gasta cota;
//   • no máximo 5 buscas NOVAS por dia (estourou → 429, o app mostra só a
//     base colaborativa e tenta de novo amanhã).
//
// Configuração: Dashboard → Edge Functions → Secrets → `SERPAPI_KEY`.
// Sem a chave, responde 503 (o app trata e some a seção sem quebrar).
//
// Deploy: dashboard (colar este arquivo) ou CLI:
//   npx supabase functions deploy promocoes --project-ref zfshsndkhbpihutedest
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Cache de respostas por termo (horas) — repetição não gasta cota. */
const CACHE_HORAS = 72
/** Buscas NOVAS por dia (folga pros ~100/mês do plano grátis). */
const LIMITE_DIA = 5
/** Teto de itens devolvidos (a tela mostra ~6). */
const LIMITE_ITENS = 12

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** Mesma normalização do app (normalizarNome) — a chave do cache é esta. */
function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "R$ 17,90" | 17.9 | "17.9" → 17.9 (ou undefined se não der número). */
function paraValor(preco: unknown, extraido: unknown): number | undefined {
  if (typeof extraido === 'number' && Number.isFinite(extraido) && extraido > 0) return extraido
  if (typeof preco === 'string') {
    const n = Number(preco.replace(/[^\d,]/g, '').replace(',', '.'))
    if (Number.isFinite(n) && n > 0) return n
  }
  if (typeof preco === 'number' && Number.isFinite(preco) && preco > 0) return preco
  return undefined
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const termo = new URL(req.url).searchParams.get('q')?.trim() ?? ''
    if (normalizar(termo).length < 3) return json({ erro: 'termo muito curto', motivo: 'erro' }, 400)

    const chave = normalizar(termo)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // 1) cache de 72 h — acerto não toca o SerpAPI e não conta pra cota.
    const { data: cache } = await supabase
      .from('buscas_cache')
      .select('dados, em')
      .eq('chave', chave)
      .maybeSingle()
    if (cache?.dados && Date.now() - Date.parse(cache.em) < CACHE_HORAS * 3600 * 1000) {
      return json({ ...(cache.dados as Record<string, unknown>), cache: true })
    }

    // 2) cota diária de buscas NOVAS (protege o plano grátis de estouro).
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('buscas_cache')
      .select('chave', { count: 'exact', head: true })
      .gte('em', hoje.toISOString())
    if ((count ?? 0) >= LIMITE_DIA) {
      return json({ erro: 'limite diário de buscas novas atingido', motivo: 'limite' }, 429)
    }

    // 3) chave da API: só aqui, no servidor.
    const chaveSerp = Deno.env.get('SERPAPI_KEY')
    if (!chaveSerp) return json({ erro: 'SERPAPI_KEY não configurada', motivo: 'sem-chave' }, 503)

    const url =
      `https://serpapi.com/search.json?engine=google_shopping` +
      `&q=${encodeURIComponent(termo)}&hl=pt-br&gl=br&api_key=${chaveSerp}`
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!r.ok) return json({ erro: `serpapi respondeu ${r.status}`, motivo: 'erro' }, 502)
    const bruto = (await r.json()) as Record<string, unknown>
    const lista = Array.isArray(bruto.shopping_results) ? bruto.shopping_results : []
    const itens = []
    for (const x of lista as Array<Record<string, unknown>>) {
      const titulo = typeof x.title === 'string' ? x.title : ''
      const valor = paraValor(x.price, x.extracted_price)
      if (!titulo || !valor) continue
      itens.push({
        titulo,
        valor,
        loja: typeof x.source === 'string' && x.source ? x.source : 'Loja',
        link: typeof x.link === 'string' ? x.link : '',
        thumb: typeof x.thumbnail === 'string' ? x.thumbnail : undefined,
      })
      if (itens.length >= LIMITE_ITENS) break
    }

    const dados = { itens }
    // 4) guarda pra próxima (upsert: busca repetida re-serva por 72 h).
    await supabase.from('buscas_cache').upsert({ chave, dados, em: new Date().toISOString() })
    return json(dados)
  } catch (erro) {
    return json({ erro: String(erro).slice(0, 200), motivo: 'erro' }, 500)
  }
})
