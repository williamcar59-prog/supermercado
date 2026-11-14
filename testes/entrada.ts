/**
 * Smoke test da camada de dados (src/lib/api.ts) — roda em Node, sem browser.
 *
 * Por que existe: aqui moram os bugs caros (perder lista, ressuscitar demo,
 * quebrar com storage corrompido). O app não tem backend, então este arquivo
 * É a fonte da verdade — testar vale mais que testar UI.
 *
 * Rodar: npm.cmd run teste
 */

// localStorage fake — o app roda no browser; aqui simulamos o mesmo contrato.
const memoria = new Map<string, string>()
;(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (chave: string) => (memoria.has(chave) ? memoria.get(chave)! : null),
  setItem: (chave: string, valor: string) => void memoria.set(chave, String(valor)),
  removeItem: (chave: string) => void memoria.delete(chave),
  clear: () => void memoria.clear(),
}

import * as api from '../src/lib/api'
import { listaDemo, precosDemo } from '../src/data/demo'
import * as format from '../src/lib/format'
import * as geoloc from '../src/lib/geoloc'
import * as lojasMod from '../src/lib/lojas'
import * as comparar from '../src/lib/comparar'
import * as carrinho from '../src/lib/carrinho'
import * as nuvem from '../src/lib/nuvem'
import * as ofertas from '../src/lib/ofertas'

const CHAVE_LISTAS = 'supermercado:listas:v1'
const CHAVE_SEMEOU = 'supermercado:semeou:v1'

let falhas = 0
function ok(condicao: boolean, mensagem: string): void {
  if (condicao) {
    console.log(`  ok  ${mensagem}`)
  } else {
    falhas++
    console.error(`  FALHOU  ${mensagem}`)
  }
}

console.log('1) semente de demonstração')
api.semearSePreciso(listaDemo())
let ativa = api.carregarListaAtiva()
ok(ativa !== null, 'primeira abertura cria uma lista ativa')
ok(ativa?.itens.length === 8, `lista demo tem 8 itens (veio ${ativa?.itens.length})`)
ok(api.carregarHistorico().length === 0, 'histórico começa vazio')

console.log('2) demo não volta depois que o usuário apaga tudo')
memoria.delete(CHAVE_LISTAS) // usuário limpou o aparelho
api.semearSePreciso(listaDemo())
ok(api.carregarListaAtiva() === null, 'flag impede de ressuscitar a demo')
ok(api.carregarHistorico().length === 0, 'histórico continua vazio')

console.log('3) gravar e reler a lista ativa (ida e volta)')
api.salvarLista({
  id: 'l1',
  nome: 'Teste',
  itens: [
    { id: 'i1', nome: 'Arroz', quantidade: 2, unidade: 'kg', categoria: 'mercearia', marcado: false, criadoEm: 1 },
  ],
  criadoEm: 1,
  atualizadoEm: 1,
})
ativa = api.carregarListaAtiva()
ok(ativa?.nome === 'Teste', 'nome persistiu')
ok(ativa?.itens[0]?.quantidade === 2, 'item persistiu com quantidade')

console.log('4) concluir vira histórico, some da ativa')
api.salvarLista({ ...(ativa!), concluidaEm: Date.now() })
ok(api.carregarListaAtiva() === null, 'não há ativa depois de concluir')
ok(api.carregarHistorico().length === 1, 'histórico tem 1 lista')
ok(api.carregarHistorico()[0]?.itens.length === 1, 'histórico guarda os itens')

console.log('5) remover do histórico')
api.removerLista('l1')
ok(api.carregarHistorico().length === 0, 'histórico vazio depois de remover')

console.log('6) storage corrompido não derruba o app')
memoria.set(CHAVE_LISTAS, '{isso não é json')
ok(api.carregarListaAtiva() === null, 'lista ativa vira null, sem lançar')
ok(api.carregarHistorico().length === 0, 'histórico vazio, sem lançar')
memoria.delete(CHAVE_LISTAS)

console.log('7) normalização de dados sujos')
api.salvarLista({
  id: 'l2',
  nome: '  ',
  itens: [
    { id: 'x', nome: '  ', quantidade: 1, unidade: 'un', categoria: 'outros', marcado: false, criadoEm: 1 }, // sem nome: cai
    { id: 'y', nome: 'Feijão', quantidade: -5, unidade: 'un', categoria: 'outros', marcado: false, criadoEm: 1 }, // qtd ruim: vira 1
    { id: 'z', nome: 'Leite', quantidade: 3, unidade: 'un', categoria: 'outros', marcado: false, criadoEm: 1 },
  ],
  criadoEm: 1,
  atualizadoEm: 1,
})
ativa = api.carregarListaAtiva()
ok(ativa?.nome === 'Minha lista', 'nome vazio vira "Minha lista"')
ok(ativa?.itens.length === 2, `item sem nome é descartado (sobram ${ativa?.itens.length})`)
ok(ativa?.itens.find((i) => i.nome === 'Feijão')?.quantidade === 1, 'quantidade negativa vira 1')

console.log('8) semear com flag já setada não toca em dados existentes')
memoria.set(CHAVE_SEMEOU, '1')
api.semearSePreciso(listaDemo())
ok(api.carregarListaAtiva()?.itens.length === 2, 'dados existentes intactos')

// =============================================================== Fase 0.2

console.log('9) distância e formatação (GPS)')
const sp = { lat: -23.5505, lon: -46.6333 }
const rio = { lat: -22.9068, lon: -43.1729 }
const kmSpRio = geoloc.distanciaKm(sp, rio)
ok(kmSpRio > 350 && kmSpRio < 370, `SP→Rio ≈ 358 km (veio ${kmSpRio.toFixed(1)})`)
ok(geoloc.distanciaKm(sp, sp) === 0, 'mesmo ponto = 0 km')
ok(geoloc.formatarDistancia(0.35) === '350 m', `abaixo de 1 km em metros (veio "${geoloc.formatarDistancia(0.35)}")`)
ok(geoloc.formatarDistancia(1.25) === '1,3 km', `acima de 1 km com vírgula (veio "${geoloc.formatarDistancia(1.25)}")`)

console.log('10) normalização de nome de produto')
ok(format.normalizarNome('Pão de Açúcar') === 'pao de acucar', 'remove acento e caixa')
ok(format.normalizarNome('Café (moído)!') === 'cafe moido', 'remove pontuação')
ok(format.normalizarNome('  Arroz   Tipo  1 ') === 'arroz tipo 1', 'espaços colapsam')

console.log('11) comparação de preço na base (pontuação)')
ok(comparar.pontuarComparacao('arroz tipo 1', 'Arroz Tipo 1 5kg') === 1, 'nome contém a busca = nota 1')
ok(comparar.pontuarComparacao('leite integral', 'Leite') === 1, 'candidato menor também vale (substring)')
ok(comparar.pontuarComparacao('feijão preto', 'Arroz') === 0, 'produto nada a ver = 0')
const baseFake = [
  { id: 'p1', produto: 'Arroz Tipo 1 5kg', loja: 'Assaí', valor: 24.9, registradoPor: 'eu', atualizadoEm: 1 },
  { id: 'p2', produto: 'Leite Integral 1L', loja: 'Carrefour', valor: 5.49, registradoPor: 'eu', atualizadoEm: 1 },
  { id: 'p3', produto: 'Sabão em pó', loja: 'Extra', valor: 9.9, registradoPor: 'eu', atualizadoEm: 1 },
]
const achados = comparar.combinarPrecos('arroz tipo 1', baseFake)
ok(achados.length === 1 && achados[0].id === 'p1', `busca "arroz tipo 1" acha só o arroz (achou ${achados.length})`)
ok(comparar.combinarPrecos('leite', baseFake).length === 1, 'busca "leite" acha só o leite')

console.log('12) registrar preço (atualiza produto+loja, não duplica)')
comparar.registrarPreco({ produto: 'Café torrado 500g', loja: 'iFood', valor: 19.9, registradoPor: 'eu' })
comparar.registrarPreco({ produto: 'Cafe torrado 500g', loja: 'IFOOD', valor: 21.5, registradoPor: 'eu' })
const cafes = api.carregarPrecos().filter((p) => format.normalizarNome(p.produto).includes('cafe'))
ok(cafes.length === 1, `mesmo produto+loja vira 1 registro (tem ${cafes.length})`)
ok(cafes[0].valor === 21.5, 'segundo registro atualiza o valor')

console.log('13) parse das lojas do Nominatim (fixture)')
const fixtureLojas = [
  { place_id: 111, lat: '-23.5600', lon: '-46.6400', name: 'Carrefour', extratags: { opening_hours: 'Mo-Su 08:00-22:00', phone: '+55 11 3000-0000' } },
  { place_id: 222, lat: '-23.5550', lon: '-46.6350', name: 'Pão de Açúcar' },
  { lat: 'lixo', lon: '-46.6', name: 'Coordenada quebrada' },
  { place_id: 333, lat: '-23.55', lon: '-46.63', name: '   ' },
]
const lojasParseadas = lojasMod.parseLojas(fixtureLojas, sp)
ok(lojasParseadas.length === 2, `linhas inválidas caem (ficam ${lojasParseadas.length} de 4)`)
ok(lojasParseadas[0].nome === 'Pão de Açúcar', 'ordenadas por distância (mais perto primeiro)')
ok(lojasParseadas[1].horario === 'Mo-Su 08:00-22:00', 'horário vem em extratags')
ok(lojasParseadas[1].telefone === '+55 11 3000-0000', 'telefone vem em extratags')
ok(lojasMod.parseLojas('não é lista', sp).length === 0, 'resposta estranha vira lista vazia, sem lançar')

console.log('14) mescla de ondas de busca sem duplicar')
const l1 = [{ id: 'a', nome: 'A', lat: 0, lon: 0, distanciaKm: 1 }]
const l2 = [{ id: 'a', nome: 'A', lat: 0, lon: 0, distanciaKm: 1 }, { id: 'b', nome: 'B', lat: 0, lon: 0, distanciaKm: 2 }]
const mescladas = lojasMod.mesclarLojas(l1, l2)
ok(mescladas.length === 2, `duplicata eliminada (ficam ${mescladas.length})`)
ok(mescladas[0].id === 'a', 'ordem por distância preservada')

console.log('15) URLs de comparação com o produto codificado')
const comps = comparar.destinosDeComparacao('arroz tipo 1')
ok(comps.length === 4, `4 comparadores (veio ${comps.length})`)
ok(comps[0].url.includes('tbm=shop') && comps[0].url.includes('arroz%20tipo%201'), 'Google Shopping com busca pronta')
ok(comps.every((c) => c.url.startsWith('https://')), 'só links https')
const entregas = comparar.destinosDeEntrega('arroz')
ok(entregas.some((d) => d.id === 'ifood') && entregas.some((d) => d.id === '99compras'), 'iFood e 99 presentes')

console.log('16) parse da resposta do Mercado Livre (fixture)')
const fixtureML = {
  results: [
    { title: 'Arroz Tio João 5kg', price: 27.9, currency_id: 'BRL', condition: 'new', permalink: 'https://produto.mercadolivre.com.br/MLB-1' },
    { title: 'Preço em texto', price: '27,9' },
    { price: 25 },
    { title: 'Arroz usado bom', price: 20, condition: 'used', permalink: 'https://produto.mercadolivre.com.br/MLB-2' },
  ],
}
const mlParseado = comparar.parseML(fixtureML)
ok(mlParseado.length === 2, `só entradas válidas (ficam ${mlParseado.length})`)
ok(mlParseado[0].preco === 27.9 && !mlParseado[0].usado, 'preço numérico e condição novos')
ok(mlParseado[1].usado === true, 'condição usada reconhecida')
ok(comparar.parseML(null).length === 0 && comparar.parseML({ results: 'x' }).length === 0, 'resposta estranha vira vazia')

console.log('17) destino de entrega copia o nome (URL não tem busca)')
ok(entregas.every((d) => d.url.startsWith('https://')), 'links de entrega https (sem esquema custom)')

// =============================================================== Fase 0.3

console.log('18) cruzamento lista × preços: loja por loja')
const itensCruz = [
  { id: 'i1', nome: 'Arroz Tipo 1 5kg', quantidade: 2, unidade: 'un' as const, categoria: 'mercearia' as const, marcado: false, criadoEm: 1 },
  { id: 'i2', nome: 'Feijão Preto 1kg', quantidade: 1, unidade: 'un' as const, categoria: 'mercearia' as const, marcado: false, criadoEm: 1 },
  { id: 'i3', nome: 'Sabão em pó', quantidade: 1, unidade: 'pct' as const, categoria: 'limpeza' as const, marcado: false, criadoEm: 1 },
]
const baseCruz = [
  { id: 'p1', produto: 'Arroz Tipo 1 5kg', loja: 'Assaí', valor: 24.9, registradoPor: 'eu', atualizadoEm: 1 },
  { id: 'p2', produto: 'Feijão Preto 1kg', loja: 'Assaí', valor: 8.5, registradoPor: 'eu', atualizadoEm: 1 },
  { id: 'p3', produto: 'Arroz Tipo 1 5kg', loja: 'Carrefour', valor: 27.9, registradoPor: 'eu', atualizadoEm: 1 },
  // Carrefour NÃO tem feijão nem sabão → cobre 1 de 3 (não pode vencer)
]
const cruz = carrinho.cruzar(itensCruz, baseCruz)
ok(cruz.lojas.length === 2, `2 lojas na base (veio ${cruz.lojas.length})`)
const assai = cruz.lojas.find((l) => l.chave === 'assai')!
ok(assai.total === 24.9 * 2 + 8.5, `total do Assaí = 58,30 (veio ${assai.total.toFixed(2)})`)
ok(assai.cobertos.length === 2, 'Assaí cobre 2 itens')
ok(cruz.coberturaMax === 2, 'cobertura máxima = 2')
ok(cruz.elegiveis.length === 1 && cruz.maisBarata?.chave === 'assai', 'só lojas de cobertura igual disputam')

console.log('19) comparação justa: mais barata × mais cara, economia')
const baseCruz2 = [
  ...baseCruz,
  { id: 'p4', produto: 'Feijão Preto 1kg', loja: 'Extra', valor: 9.9, registradoPor: 'eu', atualizadoEm: 1 },
  { id: 'p5', produto: 'Arroz Tipo 1 5kg', loja: 'Extra', valor: 30.0, registradoPor: 'eu', atualizadoEm: 1 },
]
const cruz2 = carrinho.cruzar(itensCruz, baseCruz2)
ok(cruz2.elegiveis.length === 2, `Assaí e Extra cobrem 2 itens (veio ${cruz2.elegiveis.length})`)
ok(cruz2.maisBarata?.chave === 'assai', 'Assaí é a mais barata')
ok(cruz2.maisCara?.chave === 'extra', 'Extra é a mais cara entre as de cobertura igual')
ok(Math.abs(cruz2.economia - (30.0 * 2 + 9.9 - (24.9 * 2 + 8.5))) < 0.001, `economia = diferença das elegíveis (veio ${cruz2.economia.toFixed(2)})`)
ok(cruz2.maisBarata!.total === 58.3, 'mais barata totaliza 58,30')

console.log('20) itens sem preço nenhum ficam em "faltando"')
ok(cruz.faltando.length === 1 && cruz.faltando[0].id === 'i3', 'só o sabão falta (3º item)')
ok(carrinho.cruzar([], baseCruz).lojas.length === 0, 'lista vazia → nada a comparar')
ok(carrinho.cruzar(itensCruz, []).faltando.length === 3, 'base vazia → todos faltando')

console.log('21) mesma loja com acento/caixa diferente conta como uma')
const baseAcento = [
  { id: 'a1', produto: 'Arroz Tipo 1 5kg', loja: 'Pão de Açúcar', valor: 25.0, registradoPor: 'eu', atualizadoEm: 1 },
  { id: 'a2', produto: 'Feijão Preto 1kg', loja: 'PAO DE ACUCAR', valor: 9.0, registradoPor: 'eu', atualizadoEm: 1 },
]
const cruzAcento = carrinho.cruzar(itensCruz, baseAcento)
ok(cruzAcento.lojas.length === 1, `grupa numa loja só (veio ${cruzAcento.lojas.length})`)
ok(cruzAcento.lojas[0].total === 25 * 2 + 9, 'total somado da loja única')

console.log('22) semente de preços demo (flag própria, não ressuscita)')
const CHAVE_PRECOS = 'supermercado:precos:v1'
const CHAVE_SEMEOU_PRECOS = 'supermercado:semeouprecos:v1'
memoria.delete(CHAVE_PRECOS)
memoria.delete(CHAVE_SEMEOU_PRECOS)
api.semearPrecosSePreciso(precosDemo())
const seed1 = api.carregarPrecos()
ok(seed1.length === 19, `semeou 19 preços (veio ${seed1.length})`)
api.semearPrecosSePreciso(precosDemo())
ok(api.carregarPrecos().length === 19, 'segunda chamada não duplica (flag)')
memoria.delete(CHAVE_PRECOS) // usuário apagou tudo
api.semearPrecosSePreciso(precosDemo())
ok(api.carregarPrecos().length === 0, 'flag impede de ressuscitar depois de apagar')
memoria.delete(CHAVE_SEMEOU_PRECOS)
memoria.set(CHAVE_PRECOS, JSON.stringify([
  { id: 'meu1', produto: 'Café', loja: 'Minha mercado', valor: 12, registradoPor: 'eu', atualizadoEm: 1 },
]))
api.semearPrecosSePreciso(precosDemo())
const semeadoComPreco = api.carregarPrecos()
ok(semeadoComPreco.length === 1 && semeadoComPreco[0]?.id === 'meu1', 'base já com preço de verdade não é misturada')

console.log('23) demo da aba Preços: comparação justa entre lojas')
const cruzDemo = carrinho.cruzar(listaDemo().itens, precosDemo())
ok(cruzDemo.lojas.length === 3, `3 lojas na base demo (veio ${cruzDemo.lojas.length})`)
ok(cruzDemo.coberturaMax === 8, `Assaí e Carrefour cobrem os 8 itens (veio ${cruzDemo.coberturaMax})`)
ok(cruzDemo.elegiveis.length === 2, 'iFood (3 itens) fica de fora do duelo')
ok(cruzDemo.maisBarata?.loja === 'Assaí', 'Assaí é a mais barata da demo')
ok(cruzDemo.economia > 0, `economia visível na primeira abertura (${cruzDemo.economia.toFixed(2)})`)
ok(cruzDemo.faltando.length === 0, 'lista demo inteira coberta')

console.log('24) nuvem: parseReverse + siglaUf (cidade/UF do registro)')
const fixtureReverse = {
  address: { city: 'São Paulo', state: 'São Paulo', country: 'Brasil', 'state_code': null },
}
const regiaoSp = geoloc.parseReverse(fixtureReverse)
ok(regiaoSp?.cidade === 'São Paulo', 'cidade extraída do /reverse')
ok(regiaoSp?.uf === 'SP', `estado por extenso vira sigla (veio "${regiaoSp?.uf}")`)
const regiaoInterior = geoloc.parseReverse({ address: { town: 'Campinas', state: 'São Paulo' } })
ok(regiaoInterior?.cidade === 'Campinas', 'town serve quando não tem city')
ok(geoloc.parseReverse({ address: {} }) === null, 'sem cidade → null (não inventa)')
ok(geoloc.parseReverse(null) === null && geoloc.parseReverse('lixo') === null, 'resposta estranha → null, sem lançar')
ok(geoloc.siglaUf('Rio de Janeiro') === 'RJ', 'estado com acento vira sigla')
ok(geoloc.siglaUf('Distrito Federal') === 'DF' && geoloc.siglaUf('') === '', 'DF e desconhecido')
ok(geoloc.regiaoSalva() === null, 'região sem cache é null')

console.log('25) nuvem: validação do envio (espelho do banco)')
const envioOk = {
  produto: 'Arroz Tipo 1 5kg', produtoNorm: 'arroz tipo 1 5kg',
  loja: 'Assaí', lojaNorm: 'assai', valor: 24.9,
  cidade: 'São Paulo', cidadeNorm: 'sao paulo', uf: 'SP',
}
ok(nuvem.validarEnvio(envioOk) === null, 'envio plausível passa')
ok(nuvem.validarEnvio({ ...envioOk, produto: 'a', produtoNorm: 'a' }) !== null, 'produto de 1 letra cai')
ok(nuvem.validarEnvio({ ...envioOk, loja: '', lojaNorm: '' }) !== null, 'loja vazia cai')
ok(nuvem.validarEnvio({ ...envioOk, valor: 0 }) !== null && nuvem.validarEnvio({ ...envioOk, valor: 999999 }) !== null, 'valor fora do intervalo cai')
ok(nuvem.validarEnvio({ ...envioOk, cidade: undefined, cidadeNorm: undefined, uf: undefined }) === null, 'região é opcional (GPS negado não trava)')

console.log('26) nuvem: fila de envio (cap, descarte, pendência)')
memoria.delete('supermercado:filaenvio:v1')
ok(nuvem.filaPendente() === 0, 'fila começa vazia')
ok(nuvem.enfileirar(envioOk) === true, 'envio válido entra na fila')
ok(nuvem.enfileirar({ ...envioOk, produto: 'a', produtoNorm: 'a' }) === false, 'envio inválido NÃO entra (fila não vira lixo)')
ok(nuvem.filaPendente() === 1, 'pendência = 1')
for (let i = 0; i < 210; i++) {
  // produtoNorm precisa ter ≥3 chars senão a validação recusa (regra do banco).
  nuvem.enfileirar({ ...envioOk, produto: `Produto ${i}`, produtoNorm: `produto ${i}` })
}
ok(nuvem.filaPendente() === 200, `cap de 200 (veio ${nuvem.filaPendente()})`)
ok(nuvem.enfileirar(envioOk) === true, 'fila cheia ainda aceita (descarta a mais antiga)')
memoria.delete('supermercado:filaenvio:v1')

console.log('27) nuvem: download das linhas do Supabase (fixture)')
const fixtureLinhas = [
  { id: 'uuid-1', produto: 'Arroz Tipo 1 5kg', loja: 'Assaí', valor: 24.9, cidade: 'São Paulo', uf: 'SP', atualizado_em: '2026-11-01T10:00:00+00:00' },
  { id: 'uuid-2', produto: 'Feijão Preto 1kg', loja: 'Carrefour', valor: 8.5, atualizado_em: '2026-11-02T10:00:00+00:00' },
  { produto: '  ', loja: 'X', valor: 1, atualizado_em: '2026-11-01T10:00:00+00:00' }, // sem produto
  { produto: 'Y', loja: '  ', valor: 1, atualizado_em: '2026-11-01T10:00:00+00:00' }, // sem loja
  { produto: 'Z', loja: 'W', valor: -2, atualizado_em: '2026-11-01T10:00:00+00:00' },  // valor negativo
  { produto: 'V', loja: 'U', valor: 5, atualizado_em: 'data-invalida' },                // data ruim
]
const baixados = nuvem.linhasParaPrecos(fixtureLinhas)
ok(baixados.length === 2, `só linhas válidas (ficam ${baixados.length} de 6)`)
ok(baixados[0].fonte === 'comunidade' && baixados[0].registradoPor === 'comunidade', 'marcado como comunidade')
ok(baixados[0].cidade === 'São Paulo' && baixados[0].uf === 'SP', 'cidade/UF preservados')
ok(baixados[1].cidade === undefined, 'sem cidade fica undefined (não string vazia)')
ok(nuvem.linhasParaPrecos('não é lista').length === 0 && nuvem.linhasParaPrecos(null).length === 0, 'resposta estranha → vazio, sem lançar')

console.log('28) nuvem: mescla local × comunidade')
const baseLocal = [
  { id: 'l1', produto: 'Arroz Tipo 1 5kg', loja: 'Assaí', valor: 24.9, registradoPor: 'eu', atualizadoEm: 100, fonte: 'proprio' as const, cidade: 'São Paulo', uf: 'SP' },
  { id: 'l2', produto: 'Café torrado 500g', loja: 'iFood', valor: 19.9, registradoPor: 'eu', atualizadoEm: 100, fonte: 'proprio' as const },
]
const baseNuvem = [
  { id: 'n1', produto: 'Arroz Tipo 1 5kg', loja: 'Assaí', valor: 27.9, registradoPor: 'comunidade', atualizadoEm: 200, fonte: 'comunidade' as const, cidade: 'Campinas', uf: 'SP' },
  { id: 'n2', produto: 'Leite Integral 1L', loja: 'Carrefour', valor: 5.49, registradoPor: 'comunidade', atualizadoEm: 50, fonte: 'comunidade' as const, cidade: 'São Paulo', uf: 'SP' },
]
const mescla = nuvem.mesclarPrecos(baseLocal, baseNuvem, 'São Paulo')
ok(mescla.length === 3, `1 por produto+loja, nada se perde (ficam ${mescla.length})`)
const arroz = mescla.find((p) => p.produto.startsWith('Arroz'))!
ok(arroz.id === 'l1', 'preço da MINHA cidade vence o mais recente de outra cidade')
const mesclaCampinas = nuvem.mesclarPrecos(baseLocal, baseNuvem, 'Campinas')
ok(mesclaCampinas.find((p) => p.produto.startsWith('Arroz'))?.id === 'n1', 'mudou a cidade → o remoto vence')
ok(mescla.find((p) => p.produto.startsWith('Café'))?.id === 'l2', 'registro que só existe local sobrevive')
ok(mescla.find((p) => p.produto.startsWith('Leite'))?.id === 'n2', 'registro que só existe na nuvem sobrevive')
// Empate de cidade/data → o local vence (você confia no que viu).
const empateLocal = { ...baseNuvem[1], id: 'n3', atualizadoEm: 100 }
const empateMinho = { ...baseLocal[0], atualizadoEm: 100 }
const empatados = nuvem.mesclarPrecos([empateMinho], [{ ...empateLocal, produto: 'Arroz Tipo 1 5kg', loja: 'Assaí' }], 'São Paulo')
ok(empatados[0].id === 'l1', 'empate de cidade+data → vence o local')
// Mais recente vence quando ninguém é da cidade atual.
const semCidade = nuvem.mesclarPrecos(baseLocal, baseNuvem)
ok(semCidade.find((p) => p.produto.startsWith('Arroz'))?.id === 'n1', 'sem cidade na mescla → vence o mais recente')

console.log('29) nuvem: baseCompleta e desligamento sem .env')
memoria.delete('supermercado:precosnuvem:v1')
memoria.set(CHAVE_PRECOS, JSON.stringify(baseLocal)) // base local conhecida
ok(nuvem.nuvemConfigurada() === false, 'sem .env a nuvem fica desligada (app 100% local)')
void nuvem.baixarPrecos() // no-op assíncrono quando desligada (não lança)
const completaSemCache = nuvem.baseCompleta()
ok(completaSemCache.length === 2 && !completaSemCache.some((p) => p.fonte === 'comunidade'), `sem cache da nuvem, base = local (veio ${completaSemCache.length})`)
memoria.set('supermercado:precosnuvem:v1', JSON.stringify({ em: Date.now(), itens: baseNuvem }))
const completaComCache = nuvem.baseCompleta('São Paulo')
ok(completaComCache.some((p) => p.fonte === 'comunidade'), 'cache da nuvem entra na base')
ok(completaComCache.length === 3, `local + nuvem sem duplicar (veio ${completaComCache.length})`)
ok(completaComCache.find((p) => p.produto.startsWith('Arroz'))?.id === 'l1', 'mescla respeita a cidade na base completa')
ok(completaComCache.find((p) => p.produto.startsWith('Leite'))?.id === 'n2', 'só-nuvem entra na base')
ok(nuvem.cacheDesatualizado() === false, 'cache recém-baixado não está velho')
memoria.set('supermercado:precosnuvem:v1', JSON.stringify({ em: Date.now() - 8 * 24 * 60 * 60 * 1000, itens: [] }))
ok(nuvem.cacheDesatualizado() === true, 'cache de 8 dias está velho (rebaixa no próximo boot)')
memoria.delete('supermercado:precosnuvem:v1')

console.log('30) marca no item (sobrevive à normalização)')
api.salvarLista({
  id: 'l3',
  nome: 'Com marca',
  itens: [
    { id: 'm1', nome: 'Café', quantidade: 1, unidade: 'un' as const, categoria: 'mercearia' as const, marca: 'Pilão', marcado: false, criadoEm: 1 },
  ],
  criadoEm: 1,
  atualizadoEm: 1,
})
ok(api.carregarListaAtiva()?.itens[0]?.marca === 'Pilão', 'marca persistiu na releitura')
api.salvarLista({
  id: 'l3',
  nome: 'Com marca',
  itens: [
    { id: 'm2', nome: 'Café', quantidade: 1, unidade: 'un' as const, categoria: 'mercearia' as const, marca: '   ', marcado: false, criadoEm: 1 },
  ],
  criadoEm: 1,
  atualizadoEm: 1,
})
ok(api.carregarListaAtiva()?.itens[0]?.marca === undefined, 'marca vazia vira undefined (não string em branco)')

console.log('31) busca com marca: destaca a pedida, mostra todas')
const baseMarca = [
  { id: 'b1', produto: 'Café torrado 500g', loja: 'Assaí', valor: 19.9, marca: '3 Corações', registradoPor: 'eu', atualizadoEm: 10 },
  { id: 'b2', produto: 'Café torrado 500g', loja: 'Carrefour', valor: 22.9, marca: 'Pilão', registradoPor: 'eu', atualizadoEm: 5 },
  { id: 'b3', produto: 'Café torrado 500g', loja: 'Extra', valor: 17.9, registradoPor: 'eu', atualizadoEm: 20 }, // sem marca
]
const comMarca = comparar.combinarPrecos('café torrado', baseMarca, 'Pilão')
ok(comMarca[0]?.id === 'b2', `marca pedida vem primeiro mesmo sendo mais caro (veio ${comMarca[0]?.id})`)
ok(comMarca.length === 3, 'as outras continuam aparecendo (destacar, não filtrar)')
ok(comparar.combinarPrecos('café torrado', baseMarca)[0]?.id === 'b3', 'sem marca na busca, vale o MENOR preço')
ok(comparar.combinarPrecos('café', [{ ...baseMarca[2], produto: 'Arroz' }]).length === 0, 'produto nada a ver continua fora')

console.log('32) marca na validação do envio')
ok(nuvem.validarEnvio({ ...envioOk, marca: 'Pilão' }) === null, 'marca curta passa')
ok(nuvem.validarEnvio({ ...envioOk, marca: 'x'.repeat(61) }) !== null, 'marca >60 caracteres cai')
ok(nuvem.validarEnvio({ ...envioOk, marca: undefined }) === null, 'sem marca continua válido (opcional)')

console.log('33) marca no download da nuvem (fixture)')
const linhasComMarca = nuvem.linhasParaPrecos([
  { id: 'u1', produto: 'Café', loja: 'Assaí', valor: 19.9, marca: 'Pilão', atualizado_em: '2026-11-10T10:00:00+00:00' },
  { id: 'u2', produto: 'Café', loja: 'Extra', valor: 17.9, marca: '   ', atualizado_em: '2026-11-10T10:00:00+00:00' },
])
ok(linhasComMarca[0].marca === 'Pilão', 'marca vem do download')
ok(linhasComMarca[1].marca === undefined, 'marca em branco vira undefined')

console.log('34) mescla: marcas diferentes não se sobrescrevem')
const mesclaMarca = nuvem.mesclarPrecos(
  [{ id: 'lm', produto: 'Café', loja: 'Assaí', valor: 18, marca: 'Pilão', registradoPor: 'eu', atualizadoEm: 100, fonte: 'proprio' as const }],
  [{ id: 'rm', produto: 'Café', loja: 'Assaí', valor: 22, marca: '3 Corações', registradoPor: 'comunidade', atualizadoEm: 200, fonte: 'comunidade' as const }],
  'São Paulo',
)
ok(mesclaMarca.length === 2, `2 marcas na mesma loja coexistem (veio ${mesclaMarca.length})`)

console.log('35) registrar preço com marca (local + fila)')
memoria.delete('supermercado:filaenvio:v1')
comparar.registrarPreco({ produto: 'Café torrado 500g', loja: 'Padaria Central', valor: 21, marca: 'Pilão', registradoPor: 'eu' })
ok(api.carregarPrecos().some((p) => p.marca === 'Pilão' && p.loja === 'Padaria Central'), 'marca gravada no preço local')
ok(nuvem.filaPendente() === 1, 'registro com marca entrou na fila de envio')
comparar.registrarPreco({ produto: 'Café torrado 500g', loja: 'Padaria Central', valor: 19, marca: '3 Corações', registradoPor: 'eu' })
const naPadaria = api.carregarPrecos().filter((p) => p.loja === 'Padaria Central')
ok(naPadaria.length === 2, `mesma loja, marcas diferentes = 2 registros (veio ${naPadaria.length})`)
ok(nuvem.filaPendente() === 2, 'os dois estão na fila para a nuvem')
memoria.delete('supermercado:filaenvio:v1')

console.log('36) datas ISO de validade (dataIso/dataIsoValida/diaMes)')
ok(format.dataIso(new Date(2026, 0, 5)) === '2026-01-05', 'dataIso zera a casa do mês/dia')
ok(format.dataIsoValida('2026-11-14') === true, 'yyyy-mm-dd passa')
ok(format.dataIsoValida('14/11/2026') === false, 'formato brasileiro não passa')
ok(format.dataIsoValida('2026-13-01') === false, 'mês impossível não passa')
ok(format.dataIsoValida(undefined) === false, 'undefined não passa')
ok(format.diaMes('2026-11-20') === '20/11', 'diaMes mostra dd/mm')
ok(format.diaMes('lixo') === '', 'diaMes de lixo vazio (não "undefined/undefined")')

console.log('37) validade no registro local + promoção ativa')
memoria.delete('supermercado:filaenvio:v1')
const futuro = format.dataIso(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000))
comparar.registrarPreco({
  produto: 'Café torrado 500g', loja: 'Assaí São Mateus', valor: 17.9,
  marca: 'Pilão', validade: futuro, registradoPor: 'eu',
})
const promoLocal = api.carregarPrecos().find((p) => p.loja === 'Assaí São Mateus')
ok(promoLocal?.validade === futuro, 'validade futura gravou no preço local')
ok(comparar.promocaoAtiva(promoLocal!) === true, 'promoção futura está ATIVA hoje')
ok(comparar.promocaoAtiva(promoLocal!, '2099-01-01') === false, 'passou da validade → não é mais ativa')
ok(comparar.promocaoAtiva({ ...promoLocal!, validade: undefined }) === false, 'sem validade nunca é promoção')
const filaBruta = JSON.parse(memoria.get('supermercado:filaenvio:v1') ?? '[]') as Array<{ validade?: string }>
ok(filaBruta[0]?.validade === futuro, 'validade subiu para a fila de envio')
// Validade VIOLA as regras do banco (passada / 120 dias) → vira preço normal,
// mas o envio do preço em si continua na fila (nada fica travado).
comparar.registrarPreco({
  produto: 'Açúcar cristal 1kg', loja: 'Assaí São Mateus', valor: 4.5,
  validade: format.dataIso(new Date(Date.now() - 24 * 60 * 60 * 1000)), registradoPor: 'eu',
})
const semValidade = api.carregarPrecos().find((p) => p.produto === 'Açúcar cristal 1kg')
ok(semValidade?.validade === undefined, 'validade passada é descartada (vira preço normal)')
ok(nuvem.filaPendente() >= 1, 'preço com validade inválida AINDA assim foi enfileirado')
memoria.delete('supermercado:filaenvio:v1')

console.log('38) validade na validação do envio (espelho do banco)')
ok(nuvem.validarEnvio({ ...envioOk, validade: futuro }) === null, 'validade futura passa')
ok(nuvem.validarEnvio({ ...envioOk, validade: '2020-01-01' }) !== null, 'validade já passou é recusada')
ok(nuvem.validarEnvio({ ...envioOk, validade: '14/11/2026' }) !== null, 'formato errado é recusado')
ok(
  nuvem.validarEnvio({
    ...envioOk,
    validade: format.dataIso(new Date(Date.now() + 120 * 24 * 60 * 60 * 1000)),
  }) !== null,
  'validade >90 dias é recusada',
)
ok(nuvem.validarEnvio(envioOk) === null, 'sem validade continua válido (opcional)')

console.log('39) validade no download da nuvem (fixture)')
const linhasValidade = nuvem.linhasParaPrecos([
  { id: 'v1', produto: 'Café', loja: 'Assaí', valor: 19.9, validade: '2026-12-01', atualizado_em: '2026-11-10T10:00:00+00:00' },
  { id: 'v2', produto: 'Café', loja: 'Extra', valor: 17.9, validade: 'não é data', atualizado_em: '2026-11-10T10:00:00+00:00' },
  { id: 'v3', produto: 'Café', loja: 'Carrefour', valor: 18.5, atualizado_em: '2026-11-10T10:00:00+00:00' },
])
ok(linhasValidade[0].validade === '2026-12-01', 'validade vem do download')
ok(linhasValidade[1].validade === undefined, 'validade inválida vira undefined')
ok(linhasValidade[2].validade === undefined, 'sem validade continua undefined')

console.log('40) ofertas da web: parse + cache (fixtures, sem rede)')
const parseWeb = ofertas.parseOfertas({
  itens: [
    { titulo: 'Café Pilão torrado 500g', valor: 16.9, loja: 'Amazon', link: 'https://a' },
    { titulo: 'Sem loja — lixo', link: '' }, // sem loja → fora
    { titulo: 'Café 3 Corações 500g', loja: 'Mercado Livre', link: 'https://b' }, // sem valor → aceito
  ],
})
ok(parseWeb.length === 2, `parse aceita o formato da Edge Function (veio ${parseWeb.length})`)
ok(parseWeb[1].valor === undefined, 'item sem valor aceito (mostra "—" na tela)')
const parseCru = ofertas.parseOfertas({
  shopping_results: [
    { title: 'Café torrado', source: 'Assaí', extracted_price: 15.9, link: 'https://c' },
    { title: '', source: 'x' }, // sem título → fora
  ],
})
ok(parseCru.length === 1 && parseCru[0].valor === 15.9, 'parse também entende o formato cru do SerpAPI')
ok(ofertas.parseOfertas(null).length === 0, 'resposta nula não derruba')
ofertas.gravarCacheOfertas('café torrado', parseWeb)
ok(
  (ofertas.cacheDeOfertas('CAFÉ TORRADO') ?? []).length === 2,
  'cache local serve termo com caixa diferente',
)
ok(
  ofertas.cacheDeOfertas('café torrado', Date.now() + 25 * 60 * 60 * 1000) === null,
  'cache de 24 h expira',
)
ok(ofertas.cacheDeOfertas('nunca buscado') === null, 'termo sem cache devolve null (vai buscar)')

console.log('')
if (falhas > 0) {
  console.error(`✗ ${falhas} verificação(ões) falharam`)
  process.exit(1)
}
console.log('✓ todas as verificações passaram')
