-- 챗봇(RAG): 상품 설명 임베딩(Upstage solar-embedding-2, 1024차원)과 유사도 검색, 호출 횟수 제한
create extension if not exists vector with schema extensions;

-- 상품 하나당 임베딩 하나. content_hash가 바뀐 상품만 다시 임베딩한다.
create table public.product_embeddings (
  product_id text primary key references public.products (id) on delete cascade on update cascade,
  content text not null,
  content_hash text not null,
  embedding extensions.vector(1024) not null,
  updated_at timestamptz not null default now()
);
create index product_embeddings_hnsw on public.product_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

-- Edge Function(service role)만 읽고 쓴다. 정책이 없으므로 화면에서는 접근할 수 없다.
alter table public.product_embeddings enable row level security;

-- 질문 임베딩과 가까운 노출 상품을 고른다.
create or replace function public.match_products(p_embedding extensions.vector(1024), p_count int default 8)
returns table (product_id text, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select e.product_id, 1 - (e.embedding <=> p_embedding) as similarity
  from product_embeddings e
  join products p on p.id = e.product_id
  where p.is_visible
  order by e.embedding <=> p_embedding
  limit least(greatest(p_count, 1), 20);
$$;

-- 챗봇 호출 기록(횟수 제한용). 하루 지난 기록은 지운다.
create table public.chat_requests (
  id bigint generated always as identity primary key,
  client text not null, -- 회원 id 또는 IP
  created_at timestamptz not null default now()
);
create index chat_requests_client_idx on public.chat_requests (client, created_at);
alter table public.chat_requests enable row level security;

-- 기록을 남기고, 최근 1분 호출 수가 p_limit을 넘으면 false
create or replace function public.chat_allow(p_client text, p_limit int default 10)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count from chat_requests
  where client = p_client and created_at > now() - interval '1 minute';
  if v_count >= p_limit then
    return false;
  end if;
  insert into chat_requests (client) values (p_client);
  return true;
end;
$$;

revoke execute on function public.match_products(extensions.vector, int) from public, anon, authenticated;
revoke execute on function public.chat_allow(text, int) from public, anon, authenticated;

select cron.schedule('purge-chat-requests', '0 4 * * *', $$delete from public.chat_requests where created_at < now() - interval '1 day'$$);
