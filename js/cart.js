/* 장바구니: 로그인하면 계정 장바구니(cart_items), 아니면 브라우저 저장소 */
document.addEventListener("DOMContentLoaded", async () => {
  await App.ready;
  if (showLoadError()) return;

  const list = document.getElementById("cartList");
  const checkAll = document.getElementById("checkAll");
  const $ = (id) => document.getElementById(id);
  let items = [];

  // 품절된 옵션은 주문에서 뺍니다.
  const orderable = () => items.filter((i) => i.checked && i.stock >= i.qty);

  function render() {
    items = expandItems(Cart.get());

    list.innerHTML = items.length
      ? items.map((i, idx) => {
        const soldOut = i.stock === 0;
        const short = !soldOut && i.stock < i.qty;
        return `
        <div class="cart-item${soldOut ? " is-soldout" : ""}" data-idx="${idx}">
          <input type="checkbox" class="js-check" ${i.checked ? "checked" : ""} aria-label="선택">
          <a href="product.html?id=${encodeURIComponent(i.id)}" class="cart-item__thumb">${productImage(i.product)}</a>
          <div>
            <p class="card__brand">${esc(i.product.brand)}</p>
            <a href="product.html?id=${encodeURIComponent(i.id)}" class="card__name" style="min-height:0">${esc(i.product.name)}</a>
            <p class="cart-item__opt">사이즈 ${esc(i.size)}
              ${soldOut ? `<b class="warn">품절</b>` : short ? `<b class="warn">재고 ${i.stock}개</b>` : ""}</p>
            <div class="qty">
              <button type="button" class="js-minus" aria-label="수량 감소">−</button>
              <span>${i.qty}</span>
              <button type="button" class="js-plus" aria-label="수량 증가">+</button>
            </div>
          </div>
          <div class="cart-item__right">
            <span class="cart-item__price">${won(i.total)}</span>
            <button type="button" class="link-btn js-remove">삭제</button>
          </div>
        </div>`;
      }).join("")
      : `<p class="empty">장바구니에 담긴 상품이 없습니다.<br><br><a href="clothes.html" class="link-btn">쇼핑하러 가기</a></p>`;

    checkAll.checked = items.length > 0 && items.every((i) => i.checked);

    const o = calcOrder(orderable());
    $("sumOrigin").textContent = won(o.origin);
    $("sumDiscount").textContent = o.discount ? "-" + won(o.discount) : "0원";
    $("sumShip").textContent = won(o.shipping);
    $("sumTotal").textContent = won(o.total);
    $("orderBtn").disabled = o.subtotal === 0;
    $("orderBtn").textContent = o.subtotal ? `${won(o.total)} 주문하기` : "주문하기";
  }

  async function run(task) {
    try {
      await task();
    } catch (err) {
      console.error(err);
      toast("장바구니를 저장하지 못했어요");
      await Cart.load().catch(() => {});
    }
    render();
  }

  list.addEventListener("click", (e) => {
    const row = e.target.closest(".cart-item");
    if (!row) return;
    const i = items[Number(row.dataset.idx)];
    const max = Math.max(1, Math.min(10, i.stock));
    if (e.target.closest(".js-minus") && i.qty > 1) run(() => Cart.update(i.id, i.size, { qty: i.qty - 1 }));
    if (e.target.closest(".js-plus") && i.qty < max) run(() => Cart.update(i.id, i.size, { qty: i.qty + 1 }));
    if (e.target.closest(".js-remove")) run(() => Cart.remove([i]));
  });
  list.addEventListener("change", (e) => {
    if (!e.target.classList.contains("js-check")) return;
    const i = items[Number(e.target.closest(".cart-item").dataset.idx)];
    run(() => Cart.update(i.id, i.size, { checked: e.target.checked }));
  });
  checkAll.addEventListener("change", () => run(() => Cart.checkAll(checkAll.checked)));
  $("removeChecked").addEventListener("click", () => run(() => Cart.remove(items.filter((i) => i.checked))));

  // 비로그인이면 로그인 후 주문서로 이동합니다. 로그인할 때 이 장바구니는 계정에 합쳐집니다.
  $("orderBtn").addEventListener("click", () => {
    const picked = orderable().map(({ id, size, qty }) => ({ id, size, qty }));
    if (!picked.length) return;
    writeJSON(CHECKOUT_KEY, { source: "cart", items: picked }, "sessionStorage");
    if (requireLogin("checkout.html")) location.href = "checkout.html";
  });

  render();
});
