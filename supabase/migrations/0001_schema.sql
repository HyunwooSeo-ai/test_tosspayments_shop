-- NINE STORE 기본 스키마: 표, 출입 규칙(RLS), 회원 정보 자동 생성

-- ---------- 관리자 판별 ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  phone text not null default '',
  address text not null default '',
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- RLS 정책 안에서 profiles를 다시 조회하므로 security definer로 재귀를 피한다.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- 카테고리 / 상품 / 재고 ----------
create table public.categories (
  key text primary key check (key ~ '^[a-z0-9_-]{2,30}$'),
  name text not null,
  description text not null default '',
  sort int not null default 0,
  is_visible boolean not null default true,
  is_sale boolean not null default false, -- true면 할인 상품을 모아 보여 주는 카테고리
  created_at timestamptz not null default now()
);

create table public.products (
  id text primary key default ('n' || substr(md5(random()::text), 1, 9)) check (id ~ '^[A-Za-z0-9_-]{2,30}$'),
  category text not null references public.categories (key) on update cascade,
  sub text not null default '',
  brand text not null,
  name text not null,
  price int not null check (price > 0),
  discount int not null default 0 check (discount between 0 and 90),
  tags text[] not null default '{}',
  image_url text,
  shape text not null default 'tee', -- 사진이 없을 때 쓰는 SVG 일러스트 모양
  color text not null default '#dddddd',
  popularity int not null default 0, -- 인기순 기준(판매 수량 누적)
  rating_avg numeric(2, 1) not null default 0,
  review_count int not null default 0,
  is_visible boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.products (category);

create table public.product_stock (
  product_id text not null references public.products (id) on delete cascade on update cascade,
  size text not null,
  qty int not null default 0 check (qty >= 0),
  sort int not null default 0,
  primary key (product_id, size)
);

-- ---------- 장바구니 / 좋아요 ----------
create table public.cart_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade on update cascade,
  size text not null,
  qty int not null check (qty between 1 and 10),
  checked boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id, size)
);

create table public.likes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade on update cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- ---------- 주문 / 주문 상품 / 결제 ----------
create table public.orders (
  id text primary key, -- 토스 orderId로 그대로 쓴다
  user_id uuid not null references auth.users (id),
  order_name text not null,
  source text not null default 'direct' check (source in ('direct', 'cart')),
  origin_amount int not null default 0,
  discount_amount int not null default 0,
  shipping_fee int not null default 0,
  total_amount int not null default 0,
  status text not null default 'PENDING' check (status in (
    'PENDING', 'CONFIRMING', 'WAITING_DEPOSIT', 'PAID', 'PREPARING', 'SHIPPING', 'DELIVERED',
    'CANCELED', 'FAILED', 'EXPIRED')),
  receiver_name text not null,
  receiver_phone text not null,
  receiver_email text not null,
  receiver_address text not null,
  payment_method text,
  fail_code text,
  fail_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  canceled_at timestamptz
);
create index on public.orders (user_id, created_at desc);
create index on public.orders (status, created_at);

create table public.order_items (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders (id) on delete cascade,
  product_id text not null references public.products (id) on update cascade,
  size text not null,
  qty int not null check (qty > 0),
  unit_price int not null,   -- 주문 당시 할인가
  origin_price int not null, -- 주문 당시 정가
  brand text not null,
  product_name text not null
);
create index on public.order_items (order_id);
create index on public.order_items (product_id);

create table public.payments (
  order_id text primary key references public.orders (id) on delete cascade,
  payment_key text not null unique,
  method text,
  status text,
  approved_at timestamptz,
  canceled_at timestamptz,
  cancel_reason text,
  raw jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- 리뷰 ----------
create table public.reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade on update cascade,
  author_name text not null default '',
  rating int not null check (rating between 1 and 5),
  content text not null check (char_length(content) between 5 and 1000),
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);
create index on public.reviews (product_id, created_at desc);

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_stock enable row level security;
alter table public.cart_items enable row level security;
alter table public.likes enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.reviews enable row level security;

-- profiles: 본인과 관리자만. role은 아래 컬럼 권한으로 수정 불가.
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (name, phone, address) on public.profiles to authenticated;

-- categories / products / stock: 누구나 보기(숨김은 관리자만), 관리자만 수정
create policy "categories_select" on public.categories for select
  using (is_visible or (select public.is_admin()));
create policy "categories_admin" on public.categories for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "products_select" on public.products for select
  using (is_visible or (select public.is_admin()));
create policy "products_admin" on public.products for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "stock_select" on public.product_stock for select using (true);
create policy "stock_admin" on public.product_stock for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- 장바구니 / 좋아요: 본인만
create policy "cart_own" on public.cart_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "likes_own" on public.likes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 주문: 본인과 관리자 보기. 생성·변경은 서버 함수(service role)만.
create policy "orders_select" on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "order_items_select" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and (o.user_id = (select auth.uid()) or (select public.is_admin()))));
-- 결제 원문은 관리자만. 손님은 orders.payment_method로 결제 수단만 본다.
create policy "payments_admin" on public.payments for select to authenticated
  using ((select public.is_admin()));

-- 리뷰: 누구나 보기, 구매 확정(결제 완료 이후 상태)한 본인만 작성·삭제
create or replace function public.has_purchased(p_product text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.order_items oi join public.orders o on o.id = oi.order_id
    where o.user_id = auth.uid() and oi.product_id = p_product
      and o.status in ('PAID', 'PREPARING', 'SHIPPING', 'DELIVERED'));
$$;
create policy "reviews_select" on public.reviews for select using (true);
create policy "reviews_insert" on public.reviews for insert to authenticated
  with check (user_id = (select auth.uid()) and public.has_purchased(product_id));
create policy "reviews_delete" on public.reviews for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
revoke update on public.reviews from anon, authenticated;

-- ---------- 트리거 ----------
-- 가입하면 회원 정보 자동 생성
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name) values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 리뷰 작성자 이름은 가려서 저장 (예: 김*스)
create or replace function public.review_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  select name into n from public.profiles where id = new.user_id;
  n := coalesce(nullif(n, ''), '회원');
  new.author_name := case
    when char_length(n) <= 1 then n
    when char_length(n) = 2 then left(n, 1) || '*'
    else left(n, 1) || repeat('*', char_length(n) - 2) || right(n, 1) end;
  new.created_at := now();
  return new;
end;
$$;
create trigger reviews_before_insert before insert on public.reviews
  for each row execute function public.review_before_insert();

-- 리뷰가 바뀌면 상품 별점·리뷰 수 재계산
create or replace function public.refresh_product_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid text := coalesce(new.product_id, old.product_id);
begin
  update public.products p set
    rating_avg = coalesce((select round(avg(rating)::numeric, 1) from public.reviews where product_id = pid), 0),
    review_count = (select count(*) from public.reviews where product_id = pid)
  where p.id = pid;
  return null;
end;
$$;
create trigger reviews_after_change after insert or delete on public.reviews
  for each row execute function public.refresh_product_rating();

-- 주문 수정 시각
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ---------- 상품 사진 저장소 ----------
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
  on conflict (id) do nothing;
create policy "product_images_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy "product_images_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
create policy "product_images_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
