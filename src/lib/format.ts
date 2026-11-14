// Formatação de moeda, data e ids. (sem dependência externa)

export function brl(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function dataCurta(ts: number): string {
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function horaCurta(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Data local no formato ISO de data (yyyy-mm-dd) — o formato do campo `validade`
 * (v0.6: promoções ativas). Hora local, não UTC: "hoje" aqui é o "hoje" de quem
 * está usando (madrugada em UTC não pode virar ontem no app).
 */
export function dataIso(d: Date = new Date()): string {
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
}

/** 'yyyy-mm-dd' válido? (usado para validar validade antes de confiar nela) */
export function dataIsoValida(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
}

/** 'yyyy-mm-dd' → 'dd/mm' (validade da promoção 🔥 na tela). */
export function diaMes(iso: string): string {
  return dataIsoValida(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : ''
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Minúsculo, sem acento e sem pontuação — a chave de comparação de nomes de
 * produto ("Pão de Açúcar" = "pao de acucar").
 */
export function normalizarNome(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
