-- =====================================================================
-- SuperMercado — base compartilhada de preços (colaborativa / "P2P")
-- Cole este arquivo inteiro no SQL Editor do Supabase → Run.
-- Depois: copie .env.example → .env com URL + anon key e refaça o build.
--
-- É IDEMPOTENTE: roda do zero (banco novo) OU em cima de um banco já
-- criado (a v0.5 adicionou a MARCA; a v0.6 adiciona a VALIDADE de promoção 🔥
-- e a tabela de cache das buscas da Edge Function).
--
-- Modelo: qualquer aparelho ANÔNIMO (sem login) pode:
--   • LER todos os preços (leitura pública = ajuda todo mundo);
--   • ESCREVER só pela função registrar_preco(), que valida o dado e
--     aplica limite diário por aparelho — sem policy de insert direto,
--     não existe como "furar" a regra pela API (manual 05, lição 1).
--
-- LIÇÕES APLICADAS AQUI (manual 07):
--   • nenhum parâmetro tem `default` (erro 42P13);
--   • acrescentar parâmetro = SOBRECARGA → drop da assinatura antiga E
--     revoke/grant já citando a assinatura NOVA (senão 42883 no fim desfaz
--     a transação inteira);
--   • DDL do Postgres é transacional: ou aplica tudo, ou nada.
-- =====================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------ tabela de preços
create table if not exists public.precos (
  id            uuid primary key default gen_random_uuid(),
  produto       text        not null,
  produto_norm  text        not null,   -- normalizarNome() no cliente (sem acento/caixa)
  loja          text        not null,
  loja_norm     text        not null,
  valor         numeric     not null check (valor > 0 and valor <= 100000),
  marca         text,                   -- v0.5: opcional
  marca_norm    text        not null default '',
  validade      date,                   -- v0.6: promoção 🔥 vale até essa data (opcional)
  cidade        text,
  cidade_norm   text        not null default '',
  uf            text,
  dispositivo    uuid        not null,   -- id anônimo do aparelho (sem PII)
  atualizado_em timestamptz not null default now()
);

-- Migrações de banco criado em versões anteriores
alter table public.precos add column if not exists marca text;
alter table public.precos add column if not exists marca_norm text not null default '';
alter table public.precos add column if not exists validade date;

-- Mesmo produto + loja + cidade + MARCA = UM registro (upsert).
-- A marca entra na chave: "Café Pilão no Assaí" e "Café 3 Corações no Assaí"
-- são preços diferentes e não podem se sobrescrever.
alter table public.precos drop constraint if exists uq_preco_chave;
alter table public.precos
  add constraint uq_preco_chave unique (produto_norm, loja_norm, cidade_norm, marca_norm);

create index if not exists idx_precos_produto on public.precos (produto_norm);
create index if not exists idx_precos_data    on public.precos (atualizado_em desc);

alter table public.precos enable row level security;

-- LEITURA pública: é para os outros verem o preço que você pagou.
drop policy if exists precos_leitura_publica on public.precos;
create policy precos_leitura_publica
  on public.precos for select
  using (true);

-- NÃO existe policy de insert/update/delete direto → escrita SÓ pela função.

-- ------------------------------------- limite diário por aparelho (anti-spam)
create table if not exists public.preco_envios (
  dispositivo uuid   not null,
  dia         date   not null default current_date,
  qtd         int    not null default 0,
  primary key (dispositivo, dia)
);

alter table public.preco_envios enable row level security;
-- sem policy nenhuma: ninguém lê/escreve direto — só a função (definer).

-- ------------------------------------------- função escritora validadora
-- SECURITY DEFINER: roda como dono do banco → o visitante anônimo consegue
-- registrar um preço sem precisar de policy de escrita na tabela.
--
-- v0.6: 11 argumentos (entrou p_validade). As assinaturas antigas de 10 (v0.5,
-- com marca) e 9 (v0.4) são dropadas aqui embaixo — e revoke/grant JÁ CITAM A
-- DE 11 (senão 42883 no fim desfaz a transação inteira).
drop function if exists public.registrar_preco(text, text, text, text, numeric, text, text, text, uuid);
drop function if exists public.registrar_preco(text, text, text, text, numeric, text, text, text, text, uuid);

create or replace function public.registrar_preco(
  p_produto      text,
  p_produto_norm text,
  p_loja         text,
  p_loja_norm    text,
  p_valor        numeric,
  p_marca        text,
  p_validade     date,
  p_cidade       text,
  p_cidade_norm  text,
  p_uf           text,
  p_dispositivo  uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qtd int;
begin
  -- 1) validação (espelho do cliente, mas AQUI é que vale)
  if p_dispositivo is null then
    raise exception 'dispositivo obrigatório';
  end if;
  if coalesce(trim(p_produto_norm), '') = '' or length(trim(p_produto_norm)) < 3 then
    raise exception 'produto inválido';
  end if;
  if coalesce(trim(p_loja_norm), '') = '' or length(trim(p_loja_norm)) < 2 then
    raise exception 'loja inválida';
  end if;
  if p_valor is null or p_valor <= 0 or p_valor > 100000 then
    raise exception 'valor implausível';
  end if;
  if p_marca is not null and length(trim(p_marca)) > 60 then
    raise exception 'marca longa demais';
  end if;
  if p_validade is not null then
    if p_validade < current_date then
      raise exception 'validade já passou';
    end if;
    if p_validade > current_date + 90 then
      raise exception 'validade longa demais (máx 90 dias)';
    end if;
  end if;

  -- 2) limite: 120 registros/dia por aparelho (joga lixo fora, não gente boa)
  insert into public.preco_envios (dispositivo, dia, qtd)
  values (p_dispositivo, current_date, 1)
  on conflict (dispositivo, dia)
  do update set qtd = preco_envios.qtd + 1
  returning qtd into v_qtd;

  if v_qtd > 120 then
    raise exception 'limite diário de preços atingido';
  end if;

  -- 3) upsert: mesmo produto+loja+cidade+marca atualiza (não duplica)
  insert into public.precos
    (produto, produto_norm, loja, loja_norm, valor, marca, marca_norm, validade,
     cidade, cidade_norm, uf, dispositivo, atualizado_em)
  values
    (trim(p_produto), trim(p_produto_norm), trim(p_loja), trim(p_loja_norm),
     p_valor,
     nullif(trim(coalesce(p_marca, '')), ''),
     coalesce(trim(p_marca), ''),
     p_validade,
     nullif(trim(coalesce(p_cidade, '')), ''),
     coalesce(trim(p_cidade_norm), ''),
     nullif(trim(coalesce(p_uf, '')), ''),
     p_dispositivo, now())
  on conflict (produto_norm, loja_norm, cidade_norm, marca_norm) do update
    set valor        = excluded.valor,
        marca        = excluded.marca,
        validade     = excluded.validade,
        cidade       = excluded.cidade,
        uf           = excluded.uf,
        produto      = excluded.produto,
        loja         = excluded.loja,
        dispositivo  = excluded.dispositivo,
        atualizado_em = now();
end;
$$;

-- O anon (chave pública do app) pode EXECUTAR a função — e só isso.
-- Assinatura NOVA com 11 argumentos (10 e 9 não existem mais).
revoke execute on function public.registrar_preco(text, text, text, text, numeric, text, date, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.registrar_preco(text, text, text, text, numeric, text, date, text, text, text, uuid)
  to anon;

-- ---------------------------------- cache das buscas da Edge Function (v0.6)
-- A função `promocoes` (Deno) guarda aqui a resposta do Google Shopping por
-- 72 h — repetição não gasta a cota grátis do SerpAPI e o contador de linhas
-- de HOJE é a cota de buscas novas (5/dia).
create table if not exists public.buscas_cache (
  chave text primary key,             -- termo normalizado (normalizarNome)
  dados jsonb not null,               -- { itens: [...] }
  em    timestamptz not null default now()
);

create index if not exists idx_buscas_cache_em on public.buscas_cache (em desc);

alter table public.buscas_cache enable row level security;
-- sem policy: NINGUÉM lê/escreve direto — só a Edge Function (service role).

-- =====================================================================
-- Conferência rápida (rode depois, coluna "SQL Editor → New query"):
--   select count(*) from public.precos;                 -- deve listar sem erro
--   select p.proname, p.pronargs from pg_proc p
--     where p.proname = 'registrar_preco';               -- pronargs = 11
--   select column_name from information_schema.columns
--     where table_name = 'precos' and column_name in ('marca','validade');
-- =====================================================================
