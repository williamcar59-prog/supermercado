import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
//
// Portas reservadas do projeto (registradas em MANUAL_IA_UTEIS/01-inventario):
//   dev     5179  (a 5173 é de CARRO/CARD_GAMES/COLECAO; 5178 é do BORDADO_CROCHE)
//   preview 4178  (a 4173 é a padrão do vite preview; 4177 é do BORDADO_CROCHE)

const pacote = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

/* segundos NÃO são capricho: sem eles, dois builds no mesmo minuto dariam o
   mesmo carimbo — e é justamente em build colado no outro que precisa
   distinguir (detectar cache velho). */
function carimbo(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const dia = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
  const hora = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  return `${dia} ${hora}`
}

export default defineConfig(({ mode }) => {
  // .env do usuário (não versionado): sem ele, __NUVEM_* vira '' e o
  // compartilhamento fica desligado — app 100% local, sem erro de build.
  const env = loadEnv(mode, process.cwd(), '')
  // GitHub Pages serve em /<repo>/ (CI define BASE_PATH); local continua '/'.
  // Nada de segredo aqui: só o caminho base do site.
  const base = env.BASE_PATH || process.env.BASE_PATH || '/'
  return {
  base,
  plugins: [
    react(),
    // PWA (manual 04): registro NOSSO (injectRegister: false) para controlar
    // o aviso de atualização; versão nova → prompt "Atualizar", nunca força.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'SuperMercado — Lista de compras',
        short_name: 'SuperMercado',
        description: 'Lista de compras com total estimado, preços e lojas perto de você.',
        lang: 'pt-BR',
        // start_url/scope OMITIDOS de propósito: o plugin usa o `base` sozinho
        // (local '/', GitHub Pages '/supermercado/'). Colocar '/' aqui quebraria
        // a instalação no Pages — o app abriria fora do subcaminho.
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1f9d55',
        background_color: '#ffffff',
        icons: [
          // SEM barra inicial: caminho relativo ao manifest — vale nos dois bases.
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          // SEM maskable o Android reclama na instalação.
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        // Relativo ao base: no Pages é /supermercado/index.html, não a raiz.
        navigateFallback: `${base}index.html`, // SPA: recarregar /qualquer/rota não dá 404
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // O app é o que precisa abrir offline; dados externos com cache curto.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/nominatim\.openstreetmap\.org\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mapa-nominatim',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 30, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  define: {
    /* vindo do package.json: sobe quando a mudança é de verdade */
    __VERSAO__: JSON.stringify(pacote.version),
    /* gerado aqui, na hora do build: muda sozinho a cada build */
    __BUILD__: JSON.stringify(carimbo(new Date())),
    /* Supabase do compartilhamento de preços (público por design; RLS protege) */
    __NUVEM_URL__: JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
    __NUVEM_ANON__: JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
  },
  server: {
    port: 5179,
    host: true, // testar no celular pela Wi-Fi
    watch: {
      // O OneDrive fica trocando arquivo e trava o watcher.
      ignored: ['**/apk/**', '**/dist/**', '**/node_modules/**'],
    },
  },
  preview: {
    port: 4178,
    host: true,
  },
  }
})
