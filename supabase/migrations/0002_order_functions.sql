-- 주문·결제·장바구니 함수
-- create_order ~ apply_cancel 은 Edge Function(service role)만 실행할 수 있다.
-- 금액 계산, 재고 확인·차감, 상태 전환을 한 트랜잭션 안에서 처리한다.

-- 할인가: 100원 단위 반올림 (화면의 salePrice()와 같은 규칙)
create or replace function public.sale_price(p_price int, p_discount int) returns int
language sql immutable set search_path = public as $$
  select (round(p_price * (100 - p_discount) / 10000.0) * 100)::int;
$$;

-- 재고 되돌리기 (취소·실패 시)
create or replace function public.restore_stock(p_order text) returns void
language sql security definer set search_path = public as $$
  update public.product_stock s set qty = s.qty + oi.qty
  from public.order_items oi
  where oi.order_id = p_order and s.product_id = oi.product_id and s.size = oi.size;
$$;

-- ---------- 3-2 주문 만들기 ----------
create or replace function public.create_order(p_user uuid, p_items jsonb, p_source text, p_receiver jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text := 'ORD-' || to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDDHH24MISS') || '-'
               || substr(md5(gen_random_uuid()::text), 1, 8);
  r record;
  v_unit int;
  v_origin int := 0;
  v_sub int := 0;
  v_free boolean := false;
  v_ship int;
  v_count int := 0;
  v_first text;
  v_name text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'INVALID_ITEMS';
  end if;
  if p_source is null or p_source not in ('direct', 'cart') then p_source := 'direct'; end if;

  insert into orders (id, user_id, order_name, source, receiver_name, receiver_phone, receiver_email, receiver_address)
  values (v_id, p_user, '', p_source, p_receiver ->> 'name', p_receiver ->> 'phone',
          p_receiver ->> 'email', p_receiver ->> 'address');

  for r in
    select x.pid, x.sz, sum(x.q)::int as q, p.brand, p.name, p.price, p.discount, p.tags, s.qty as stock
    from (select e.val ->> 'id' as pid, e.val ->> 'size' as sz, (e.val ->> 'qty')::int as q, e.ord
          from jsonb_array_elements(p_items) with ordinality as e(val, ord)) x
    left join products p on p.id = x.pid and p.is_visible
    left join product_stock s on s.product_id = x.pid and s.size = x.sz
    group by x.pid, x.sz, p.brand, p.name, p.price, p.discount, p.tags, s.qty
    order by min(x.ord)
  loop
    if r.name is null then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if r.stock is null then raise exception 'INVALID_SIZE'; end if;
    if r.q < 1 or r.q > 10 then raise exception 'INVALID_QTY'; end if;
    if r.stock < r.q then raise exception 'OUT_OF_STOCK:% (%)', r.name, r.sz; end if;

    v_unit := sale_price(r.price, r.discount);
    insert into order_items (order_id, product_id, size, qty, unit_price, origin_price, brand, product_name)
    values (v_id, r.pid, r.sz, r.q, v_unit, r.price, r.brand, r.name);

    v_origin := v_origin + r.price * r.q;
    v_sub := v_sub + v_unit * r.q;
    v_free := v_free or '무료배송' = any (r.tags);
    v_count := v_count + 1;
    v_first := coalesce(v_first, r.name);
  end loop;

  -- 배송비: 5만 원 이상 또는 무료배송 상품 포함 시 0원, 아니면 3,000원 (화면의 calcOrder()와 같은 규칙)
  v_ship := case when v_sub >= 50000 or v_free then 0 else 3000 end;
  v_name := left(case when v_count > 1 then v_first || ' 외 ' || (v_count - 1) || '건' else v_first end, 100);

  update orders set order_name = v_name, origin_amount = v_origin, discount_amount = v_origin - v_sub,
    shipping_fee = v_ship, total_amount = v_sub + v_ship
  where id = v_id;

  return jsonb_build_object('orderId', v_id, 'orderName', v_name, 'amount', v_sub + v_ship,
    'origin', v_origin, 'discount', v_origin - v_sub, 'shipping', v_ship);
end;
$$;

-- ---------- 3-3 결제 확정 1단계: 금액 대조 + 재고 차감 + 선점 ----------
-- 반환: OK | ALREADY_DONE | IN_PROGRESS | NOT_FOUND | INVALID_STATUS | AMOUNT_MISMATCH | OUT_OF_STOCK
create or replace function public.begin_confirm(p_order text, p_amount int, p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.user_id <> p_user then return 'NOT_FOUND'; end if;
  if o.status in ('PAID', 'PREPARING', 'SHIPPING', 'DELIVERED', 'WAITING_DEPOSIT') then return 'ALREADY_DONE'; end if;
  -- 6-3 중복 방지: 다른 요청이 확정 중이면 기다리게 한다
  if o.status = 'CONFIRMING' and o.updated_at > now() - interval '1 minute' then return 'IN_PROGRESS'; end if;
  if o.status not in ('PENDING', 'CONFIRMING') then return 'INVALID_STATUS'; end if;

  if o.total_amount <> p_amount then
    update orders set status = 'FAILED', fail_code = 'AMOUNT_MISMATCH',
      fail_message = '결제 금액이 주문 금액과 일치하지 않습니다.'
    where id = p_order and status = 'PENDING';
    return 'AMOUNT_MISMATCH';
  end if;

  if o.status = 'PENDING' then
    begin
      update product_stock s set qty = s.qty - oi.qty
      from order_items oi
      where oi.order_id = p_order and s.product_id = oi.product_id and s.size = oi.size;
    exception when check_violation then
      update orders set status = 'FAILED', fail_code = 'OUT_OF_STOCK', fail_message = '재고가 부족합니다.'
      where id = p_order;
      return 'OUT_OF_STOCK';
    end;
  end if;

  update orders set status = 'CONFIRMING' where id = p_order;
  return 'OK';
end;
$$;

-- ---------- 3-3 결제 확정 2단계: 토스 승인 성공 반영 ----------
-- p_status: 토스 결제 상태 (DONE | WAITING_FOR_DEPOSIT)
create or replace function public.finish_payment(p_order text, p_payment_key text, p_method text,
  p_status text, p_approved timestamptz, p_raw jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  o orders;
  v_new text := case when p_status = 'WAITING_FOR_DEPOSIT' then 'WAITING_DEPOSIT' else 'PAID' end;
begin
  select * into o from orders where id = p_order for update;
  if not found then return 'NOT_FOUND'; end if;
  if o.status in ('PAID', 'PREPARING', 'SHIPPING', 'DELIVERED') then return 'ALREADY_DONE'; end if;
  if o.status = 'CANCELED' then return 'INVALID_STATUS'; end if;
  if o.status = 'WAITING_DEPOSIT' and v_new = 'WAITING_DEPOSIT' then return 'ALREADY_DONE'; end if;

  -- 확정 1단계를 거치지 않고 들어온 경우(웹훅 등): 여기서 재고를 차감한다
  if o.status in ('PENDING', 'FAILED', 'EXPIRED') then
    update product_stock s set qty = greatest(0, s.qty - oi.qty)
    from order_items oi
    where oi.order_id = p_order and s.product_id = oi.product_id and s.size = oi.size;
  end if;

  update orders set status = v_new, payment_method = p_method, fail_code = null, fail_message = null,
    paid_at = case when v_new = 'PAID' then coalesce(p_approved, now()) end
  where id = p_order;

  insert into payments (order_id, payment_key, method, status, approved_at, raw, updated_at)
  values (p_order, p_payment_key, p_method, p_status, p_approved, p_raw, now())
  on conflict (order_id) do update set payment_key = excluded.payment_key, method = excluded.method,
    status = excluded.status, approved_at = excluded.approved_at, raw = excluded.raw, updated_at = now();

  -- 장바구니에서 주문한 상품 정리
  if o.source = 'cart' then
    delete from cart_items c using order_items oi
    where oi.order_id = p_order and c.user_id = o.user_id and c.product_id = oi.product_id and c.size = oi.size;
  end if;

  if v_new = 'PAID' then
    update products p set popularity = p.popularity + t.q
    from (select product_id, sum(qty) as q from order_items where order_id = p_order group by product_id) t
    where p.id = t.product_id;
  end if;
  return 'OK';
end;
$$;

-- ---------- 결제 실패·만료 반영 ----------
-- p_status: FAILED | EXPIRED. 이미 재고를 차감한 상태(CONFIRMING, WAITING_DEPOSIT)면 되돌린다.
create or replace function public.close_order(p_order text, p_status text, p_code text, p_message text)
returns text language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  if p_status not in ('FAILED', 'EXPIRED') then raise exception 'INVALID_STATUS'; end if;
  select * into o from orders where id = p_order for update;
  if not found then return 'NOT_FOUND'; end if;
  if o.status not in ('PENDING', 'CONFIRMING', 'WAITING_DEPOSIT') then return 'SKIPPED'; end if;
  if o.status in ('CONFIRMING', 'WAITING_DEPOSIT') then perform restore_stock(p_order); end if;
  update orders set status = p_status, fail_code = left(p_code, 100), fail_message = left(p_message, 500)
  where id = p_order;
  return 'OK';
end;
$$;

-- ---------- 5-3 / 7-6 취소 반영 ----------
create or replace function public.apply_cancel(p_order text, p_reason text, p_raw jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_order for update;
  if not found then return 'NOT_FOUND'; end if;
  if o.status = 'CANCELED' then return 'ALREADY_DONE'; end if;
  if o.status not in ('PAID', 'PREPARING', 'SHIPPING', 'DELIVERED', 'WAITING_DEPOSIT', 'CONFIRMING') then
    return 'INVALID_STATUS';
  end if;

  perform restore_stock(p_order);
  if o.status in ('PAID', 'PREPARING', 'SHIPPING', 'DELIVERED') then
    update products p set popularity = greatest(0, p.popularity - t.q)
    from (select product_id, sum(qty) as q from order_items where order_id = p_order group by product_id) t
    where p.id = t.product_id;
  end if;

  update orders set status = 'CANCELED', canceled_at = now() where id = p_order;
  update payments set status = 'CANCELED', canceled_at = now(), cancel_reason = left(p_reason, 200),
    raw = coalesce(p_raw, raw), updated_at = now()
  where order_id = p_order;
  return 'OK';
end;
$$;

-- ---------- 3-4 손님이 결제창을 닫거나 실패했을 때 (본인 주문, 결제 대기만) ----------
create or replace function public.mark_order_failed(p_order text, p_code text, p_message text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update orders set status = 'FAILED', fail_code = left(coalesce(p_code, 'UNKNOWN'), 100),
    fail_message = left(coalesce(p_message, ''), 500)
  where id = p_order and user_id = auth.uid() and status = 'PENDING';
  return found;
end;
$$;

-- ---------- 4-1 / 4-2 장바구니 담기·합치기 (같은 상품·사이즈는 수량을 더함) ----------
create or replace function public.cart_add(p_product text, p_size text, p_qty int)
returns void language sql security invoker set search_path = public as $$
  insert into cart_items (user_id, product_id, size, qty)
  values (auth.uid(), p_product, p_size, least(10, greatest(1, p_qty)))
  on conflict (user_id, product_id, size)
  do update set qty = least(10, cart_items.qty + excluded.qty), checked = true;
$$;

-- ---------- 7-6 관리자 배송 상태 변경 ----------
create or replace function public.admin_set_order_status(p_order text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('PAID', 'PREPARING', 'SHIPPING', 'DELIVERED') then raise exception 'INVALID_STATUS'; end if;
  update orders set status = p_status
  where id = p_order and status in ('PAID', 'PREPARING', 'SHIPPING', 'DELIVERED');
  if not found then raise exception 'INVALID_STATUS'; end if;
end;
$$;

-- ---------- 6-2 방치된 주문 정리 ----------
create or replace function public.expire_pending_orders() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update orders set status = 'EXPIRED', fail_code = 'EXPIRED', fail_message = '결제 대기 30분 초과'
  where status = 'PENDING' and created_at < now() - interval '30 minutes';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------- 실행 권한 ----------
revoke execute on function public.restore_stock(text) from public, anon, authenticated;
revoke execute on function public.create_order(uuid, jsonb, text, jsonb) from public, anon, authenticated;
revoke execute on function public.begin_confirm(text, int, uuid) from public, anon, authenticated;
revoke execute on function public.finish_payment(text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke execute on function public.close_order(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.apply_cancel(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.expire_pending_orders() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.review_before_insert() from public, anon, authenticated;
revoke execute on function public.refresh_product_rating() from public, anon, authenticated;
revoke execute on function public.mark_order_failed(text, text, text) from public, anon;
revoke execute on function public.cart_add(text, text, int) from public, anon;
revoke execute on function public.admin_set_order_status(text, text) from public, anon;
grant execute on function public.mark_order_failed(text, text, text) to authenticated;
grant execute on function public.cart_add(text, text, int) to authenticated;
grant execute on function public.admin_set_order_status(text, text) to authenticated;

-- 5분마다 방치된 주문 정리
create extension if not exists pg_cron;
select cron.schedule('expire-pending-orders', '*/5 * * * *', $$select public.expire_pending_orders()$$);
