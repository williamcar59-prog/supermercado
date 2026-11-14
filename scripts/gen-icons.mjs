/**
 * Gera os ícones do PWA (PNG) por desenho vetorial simples, sem dependências externas.
 * Adaptado de APP_CARRO/scripts/gen-icons.mjs — aqui o símbolo é um carrinho de compras.
 * Uso: npm run icons
 * Saída: public/icons/*.png e public/apple-touch-icon.png
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT = join(ROOT, 'public', 'icons')
mkdirSync(OUT, { recursive: true })

/* ------------------------- codificador PNG ------------------------- */
const CRC_TABLE = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c
}
const crc32 = (buf) => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const head = Buffer.from(type, 'ascii')
  const body = Buffer.concat([head, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}
const png = (w, h, rgba) => {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0 // filtro: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------- desenho comum ------------------------- */
const VERDE = [0x1f, 0x9d, 0x55] // #1f9d55 (tema do app)
const VERDE_ESC = [0x0e, 0x5a, 0x30]
const BRANCO = [255, 255, 255]

/** Preenche um pixel com alpha (0..255) — composição simples, sem antialias. */
const px = (buf, w, x, y, cor, a) => {
  if (x < 0 || y < 0 || a <= 0) return
  const i = (y * w + x) * 4
  if (i < 0 || i + 3 >= buf.length) return
  const al = a / 255
  buf[i] = Math.round(cor[0] * al + buf[i] * (1 - al))
  buf[i + 1] = Math.round(cor[1] * al + buf[i + 1] * (1 - al))
  buf[i + 2] = Math.round(cor[2] * al + buf[i + 2] * (1 - al))
  buf[i + 3] = Math.max(buf[i + 3], Math.round(a))
}
/** Distância até o círculo (negativa = dentro). */
const circulo = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r
/** Retângulo arredondado. */
const retangulo = (x, y, rx, ry, w2, h2, r) =>
  Math.max(Math.abs(x - rx) - w2 / 2 + r, Math.abs(y - ry) - h2 / 2 + r) - r
/** Distância até um segmento (negativa = dentro do traço). */
const segmento = (x, y, x1, y1, x2, y2) => {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2))
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}

/**
 * Desenha o carrinho de compras num canvas SIZE×SIZE (já com fundo verde).
 * Coordenadas em "unidades de 100" para escalar em qualquer tamanho.
 *
 * Forma: alça → conector → cesta (trapézio vazado) → 2 rodízios.
 */
function desenhar(buf, size) {
  const u = size / 100 // escala
  const TRACO = 3.2 // meia-largura do traço da alça
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const X = x / u
      const Y = y / u

      // fundo: círculo branco sobre o verde (margem de segurança p/ maskable)
      const dCirculo = circulo(X, Y, 50, 50, 44)
      if (dCirculo > 0) continue
      const alphaFundo = dCirculo < -1.5 ? 255 : Math.round((1.5 - dCirculo) * 170)
      px(buf, size, x, y, BRANCO, Math.min(255, alphaFundo))

      let cor = null

      // ---- alça: barra horizontal + conector inclinado até a cesta ----
      const dAlca = Math.min(
        segmento(X, Y, 16, 26, 31, 26), // barra
        segmento(X, Y, 31, 26, 42, 38), // desce até o canto da cesta
      )
      if (dAlca < TRACO) cor = VERDE_ESC

      // ---- cesta: trapézio (preenchido) com miolo branco → vira contorno ----
      const t = (Y - 38) / 28 // 0 topo, 1 base
      if (t >= 0 && t <= 1) {
        const largura = 40 + t * 6 // 40 em cima, 46 embaixo (centro em 62)
        if (Math.abs(X - 62) < largura / 2) cor = VERDE_ESC
        // miolo (branco = cor do fundo do círculo)
        const tInt = (Y - 44) / 18
        if (tInt >= 0 && tInt <= 1) {
          const largInt = 28 + tInt * 4
          if (Math.abs(X - 62) < largInt / 2) cor = BRANCO
        }
      }

      // ---- rodízios sob a cesta ----
      if (circulo(X, Y, 54, 73, 5.5) < 0) cor = VERDE_ESC
      if (circulo(X, Y, 71, 73, 5.5) < 0) cor = VERDE_ESC

      if (cor) px(buf, size, x, y, cor, 255)
    }
  }
}

/** Gera um PNG de `size` px. `maskable` = preenche a área segura (fundo até a borda). */
function gerar(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4)
  // fundo verde (full-bleed para o maskable ficar consistente)
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = VERDE[0]
    buf[i + 1] = VERDE[1]
    buf[i + 2] = VERDE[2]
    buf[i + 3] = 255
  }
  if (!maskable) {
    // versão normal: recorta para cantos arredondados (transparência fora)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = retangulo(x, y, size / 2, size / 2, size, size, size * 0.22)
        if (d > 0) {
          const i = (y * size + x) * 4 + 3
          buf[i] = d > 1 ? 0 : Math.round((1 - d) * 255)
        }
      }
    }
  }
  desenhar(buf, size)
  return png(size, size, buf)
}

/* ------------------------------- saída ------------------------------- */
const alvos = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}],
]
for (const [nome, size, opcoes] of alvos) {
  writeFileSync(join(OUT, nome), gerar(size, opcoes))
  console.log(`✓ ${nome} (${size}px)`)
}
console.log(`Ícones em ${OUT}`)
