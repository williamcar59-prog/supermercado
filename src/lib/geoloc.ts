// GPS, distância e geocodificação. Fonte: OpenStreetMap (Nominatim) — grátis,
// sem chave, CORS liberado. Testado ao vivo em 13/11/2026.

export interface Coordenada {
  lat: number
  lon: number
}

const NOMINATIM = 'https://nominatim.openstreetmap.org'

// ------------------------------------------------------------- distância

function grauRad(g: number): number {
  return (g * Math.PI) / 180
}

/** Distância em km entre dois pontos (haversine). */
export function distanciaKm(a: Coordenada, b: Coordenada): number {
  const R = 6371
  const dLat = grauRad(b.lat - a.lat)
  const dLon = grauRad(b.lon - a.lon)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(grauRad(a.lat)) * Math.cos(grauRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** "350 m" abaixo de 1 km, "1,2 km" acima. */
export function formatarDistancia(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1).replace('.', ',')} km`
}

// ------------------------------------------------------------------- GPS

export type ResultadoGps =
  | { ok: true; coord: Coordenada }
  | { ok: false; motivo: 'indisponivel' | 'negado' | 'tempo' }

const CHAVE_COORD = 'supermercado:coord:v1'

/**
 * Pede a localização ao aparelho.
 * Em `http://` (ex.: pelo IP da Wi-Fi) o navegador bloqueia geolocalização —
 * motivo 'indisponivel'; o app oferece busca por cidade nesse caso.
 */
export function obterGps(timeoutMs = 9000): Promise<ResultadoGps> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ ok: false, motivo: 'indisponivel' })
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, coord: { lat: pos.coords.latitude, lon: pos.coords.longitude } }),
      (erro) =>
        resolve({
          ok: false,
          motivo: erro.code === erro.PERMISSION_DENIED ? 'negado' : erro.code === erro.TIMEOUT ? 'tempo' : 'indisponivel',
        }),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60 * 1000 },
    )
  })
}

/** Última localização aceita (evita pedir de novo a cada item). */
export function coordenadaSalva(): Coordenada | null {
  try {
    const bruto = localStorage.getItem(CHAVE_COORD)
    if (!bruto) return null
    const c = JSON.parse(bruto) as Coordenada
    return typeof c.lat === 'number' && typeof c.lon === 'number' ? c : null
  } catch {
    return null
  }
}

export function salvarCoordenada(c: Coordenada): void {
  try {
    localStorage.setItem(CHAVE_COORD, JSON.stringify(c))
  } catch {
    /* silencioso: é só cache */
  }
}

// -------------------------------------------------------- geocodificação

/**
 * Converte "Campinas, SP" em coordenadas — caminho alternativo quando o GPS
 * está bloqueado (http em LAN, permissão negada).
 */
export async function geocodificar(texto: string): Promise<Coordenada | null> {
  const q = texto.trim()
  if (!q) return null
  try {
    const url = `${NOMINATIM}/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`
    const r = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } })
    if (!r.ok) return null
    const b = (await r.json()) as Array<{ lat: string; lon: string }>
    if (!Array.isArray(b) || !b.length) return null
    const lat = Number(b[0].lat)
    const lon = Number(b[0].lon)
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
  } catch {
    return null
  }
}

// ------------------------------------------------- região (cidade/UF)

export interface Regiao {
  cidade: string
  /** Sigla (SP). Vazia quando o estado veio irreconhecível. */
  uf: string
}

/** Nome do estado por extenso → sigla (o Nominatim devolve por extenso; state_code vem null). */
const SIGLAS: Record<string, string> = {
  'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA',
  'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO',
  'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
  'minas gerais': 'MG', 'para': 'PA', 'paraiba': 'PB', 'parana': 'PR',
  'pernambuco': 'PE', 'piaui': 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', 'rondonia': 'RO',
  'roraima': 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP',
  'sergipe': 'SE', 'tocantins': 'TO',
}

export function siglaUf(estado: string | null | undefined): string {
  if (!estado) return ''
  return SIGLAS[estado.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()] ?? ''
}

/**
 * Converte a resposta do Nominatim `/reverse` em Regiao.
 * Puro — teste passa fixture. Cidade: city > town > village > municipality.
 */
export function parseReverse(bruto: unknown): Regiao | null {
  const endereco = (bruto as { address?: Record<string, unknown> } | null)?.address
  if (!endereco) return null
  const cidade = [
    endereco.city, endereco.town, endereco.village, endereco.municipality, endereco.county,
  ].find((c) => typeof c === 'string' && c.trim()) as string | undefined
  if (!cidade) return null
  return { cidade: cidade.trim(), uf: siglaUf(typeof endereco.state === 'string' ? endereco.state : null) }
}

const CHAVE_REGIAO = 'supermercado:regiao:v1'

/**
 * Região já resolvida (leitura síncrona, sem rede) — null se nunca resolveu.
 * Usada para a mescla de preços priorizar a própria cidade na hora de abrir.
 */
export function regiaoSalva(): Regiao | null {
  try {
    const bruto = localStorage.getItem(CHAVE_REGIAO)
    if (!bruto) return null
    const c = JSON.parse(bruto) as Partial<Regiao>
    return typeof c.cidade === 'string' && c.cidade ? { cidade: c.cidade, uf: c.uf ?? '' } : null
  } catch {
    return null
  }
}

/**
 * Cidade/UF da posição atual (1 req ao Nominatim, com cache por coordenada —
 * respeita o limite de 1 req/s). Devolve null se falhar (preço vai sem região).
 */
export async function regiaoDaCoordenada(c: Coordenada, timeoutMs = 7000): Promise<Regiao | null> {
  // Cache: mesma coordenada (±~500 m) não refaz a chamada.
  try {
    const bruto = localStorage.getItem(CHAVE_REGIAO)
    if (bruto) {
      const cache = JSON.parse(bruto) as Coordenada & Regiao
      if (
        typeof cache.cidade === 'string' &&
        Math.abs(cache.lat - c.lat) < 0.005 &&
        Math.abs(cache.lon - c.lon) < 0.005
      ) {
        return { cidade: cache.cidade, uf: cache.uf ?? '' }
      }
    }
  } catch { /* cache corrompido: refaz */ }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const url = `${NOMINATIM}/reverse?lat=${c.lat}&lon=${c.lon}&format=jsonv2&zoom=10&addressdetails=1`
    const r = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' }, signal: ctrl.signal })
    if (!r.ok) return null
    const regiao = parseReverse(await r.json())
    if (regiao) {
      try {
        localStorage.setItem(CHAVE_REGIAO, JSON.stringify({ ...c, ...regiao }))
      } catch { /* só cache */ }
    }
    return regiao
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
