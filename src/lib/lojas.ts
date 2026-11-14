// Lojas próximas — Nominatim do OpenStreetMap com viewbox limitado à região
// do usuário. Testado ao vivo em 13/11/2026: 200, CORS `*`, ~270ms,
// devolveu Pão de Açúcar, Carrefour, Extra, St. Marche, Dia Market, Giga.
// (Overpass, alternativa natural, estava 502/timeout — por isso Nominatim.)

import { distanciaKm, type Coordenada } from './geoloc'
import { normalizarNome } from './format'

const NOMINATIM = 'https://nominatim.openstreetmap.org'

export interface LojaProxima {
  id: string
  nome: string
  lat: number
  lon: number
  distanciaKm: number
  horario?: string
  telefone?: string
}

interface ItemNominatim {
  place_id?: number | string
  lat?: string | number
  lon?: string | number
  name?: string
  extratags?: Record<string, string>
}

/**
 * Converte a resposta do Nominatim em LojaProxima[], já com distância.
 * Puro e testável — o teste passa um fixture no lugar da resposta real.
 */
export function parseLojas(bruto: unknown, origem: Coordenada): LojaProxima[] {
  if (!Array.isArray(bruto)) return []
  const lojas: LojaProxima[] = []
  for (const item of bruto as ItemNominatim[]) {
    const lat = Number(item.lat)
    const lon = Number(item.lon)
    const nome = typeof item.name === 'string' ? item.name.trim() : ''
    if (!nome || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const id = String(item.place_id ?? `${normalizarNome(nome)}|${lat}|${lon}`)
    const tags = item.extratags ?? {}
    lojas.push({
      id,
      nome,
      lat,
      lon,
      distanciaKm: distanciaKm(origem, { lat, lon }),
      horario: tags.opening_hours || undefined,
      telefone: tags.phone || tags['contact:phone'] || undefined,
    })
  }
  return lojas.sort((a, b) => a.distanciaKm - b.distanciaKm)
}

/**
 * Busca supermercados/mercados dentro de uma caixa (~5 km) ao redor do ponto.
 * `termo`: 'supermercado' primeiro; 'mercado' como segunda onda (política do
 * Nominatim pede no máximo 1 req/s — quem chama respeita o intervalo).
 */
export async function buscarLojas(origem: Coordenada, termo = 'supermercado'): Promise<LojaProxima[]> {
  const d = 0.05 // ~5 km de lado
  const viewbox = `${origem.lon - d},${origem.lat + d},${origem.lon + d},${origem.lat - d}`
  const url =
    `${NOMINATIM}/search?format=jsonv2&limit=8&bounded=1&extratags=1&countrycodes=br` +
    `&viewbox=${encodeURIComponent(viewbox)}&q=${encodeURIComponent(termo)}`
  try {
    const r = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } })
    if (!r.ok) return []
    return parseLojas(await r.json(), origem)
  } catch {
    return []
  }
}

/** Junta duas ondas de resultados sem repetir a mesma loja. */
export function mesclarLojas(...lotes: LojaProxima[][]): LojaProxima[] {
  const vistos = new Map<string, LojaProxima>()
  for (const lote of lotes) {
    for (const loja of lote) {
      if (!vistos.has(loja.id)) vistos.set(loja.id, loja)
    }
  }
  return [...vistos.values()].sort((a, b) => a.distanciaKm - b.distanciaKm)
}

/** Segunda onda: só se a primeira devolveu pouca coisa. */
export async function buscarMaisLojas(origem: Coordenada): Promise<LojaProxima[]> {
  await new Promise((r) => setTimeout(r, 1100)) // respeita 1 req/s do Nominatim
  return buscarLojas(origem, 'mercado')
}
