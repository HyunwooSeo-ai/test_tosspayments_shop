-- 상품 삭제 시 장바구니·좋아요 연쇄 삭제가 빠르도록 외래 키 인덱스 추가
create index if not exists cart_items_product_id_idx on public.cart_items (product_id);
create index if not exists likes_product_id_idx on public.likes (product_id);
