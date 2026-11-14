// Dados de demonstração: na primeira abertura o app já mostra uma lista pronta.
// O usuário apaga/edita — serve para entender o app sem ler manual.

import type { Lista, Preco } from '../types'

export function listaDemo(): Lista {
  const agora = Date.now()
  return {
    id: 'lista-demo',
    nome: 'Compras da semana',
    criadoEm: agora,
    atualizadoEm: agora,
    itens: [
      { id: 'd1', nome: 'Banana prata', quantidade: 1, unidade: 'kg', categoria: 'hortifruti', precoUnitario: 5.99, marcado: false, criadoEm: agora },
      { id: 'd2', nome: 'Tomate italiano', quantidade: 0.5, unidade: 'kg', categoria: 'hortifruti', precoUnitario: 7.9, marcado: false, criadoEm: agora },
      { id: 'd3', nome: 'Pão francês', quantidade: 1, unidade: 'kg', categoria: 'padaria', precoUnitario: 16.9, marcado: false, criadoEm: agora },
      { id: 'd4', nome: 'Leite integral 1L', quantidade: 3, unidade: 'un', categoria: 'laticinios', precoUnitario: 5.49, marcado: false, criadoEm: agora },
      { id: 'd5', nome: 'Arroz tipo 1 5kg', quantidade: 1, unidade: 'pct', categoria: 'mercearia', precoUnitario: 24.9, marcado: false, criadoEm: agora },
      { id: 'd6', nome: 'Feijão preto 1kg', quantidade: 2, unidade: 'pct', categoria: 'mercearia', precoUnitario: 8.5, marcado: false, criadoEm: agora },
      { id: 'd7', nome: 'Detergente', quantidade: 2, unidade: 'un', categoria: 'limpeza', precoUnitario: 2.79, marcado: false, criadoEm: agora },
      { id: 'd8', nome: 'Água mineral 1,5L', quantidade: 6, unidade: 'un', categoria: 'bebidas', precoUnitario: 3.29, marcado: false, criadoEm: agora },
    ],
  }
}

/**
 * Preços de demonstração da aba 💰 — duas lojas cobrindo os 8 itens (para a
 * comparação "mais barata" já nascer funcional) + iFood cobrindo só 3 (para
 * mostrar que loja de cobertura menor não disputa o título).
 * Semear UMA vez (flag própria); depois que o usuário apagar, não volta.
 */
export function precosDemo(): Preco[] {
  const p = (id: string, produto: string, loja: string, valor: number): Preco => ({
    id, produto, loja, valor, registradoPor: 'demo', atualizadoEm: Date.now(),
  })
  return [
    p('sd1', 'Banana prata', 'Assaí', 5.49),
    p('sd2', 'Tomate italiano', 'Assaí', 7.49),
    p('sd3', 'Pão francês', 'Assaí', 16.5),
    p('sd4', 'Leite integral 1L', 'Assaí', 5.29),
    p('sd5', 'Arroz tipo 1 5kg', 'Assaí', 23.9),
    p('sd6', 'Feijão preto 1kg', 'Assaí', 8.29),
    p('sd7', 'Detergente', 'Assaí', 2.49),
    p('sd8', 'Água mineral 1,5L', 'Assaí', 3.19),
    p('sd9', 'Banana prata', 'Carrefour', 5.99),
    p('sd10', 'Tomate italiano', 'Carrefour', 6.99),
    p('sd11', 'Pão francês', 'Carrefour', 17.9),
    p('sd12', 'Leite integral 1L', 'Carrefour', 5.49),
    p('sd13', 'Arroz tipo 1 5kg', 'Carrefour', 25.9),
    p('sd14', 'Feijão preto 1kg', 'Carrefour', 8.99),
    p('sd15', 'Detergente', 'Carrefour', 2.79),
    p('sd16', 'Água mineral 1,5L', 'Carrefour', 3.49),
    p('sd17', 'Leite integral 1L', 'iFood', 5.99),
    p('sd18', 'Arroz tipo 1 5kg', 'iFood', 28.9),
    p('sd19', 'Detergente', 'iFood', 3.29),
  ]
}
