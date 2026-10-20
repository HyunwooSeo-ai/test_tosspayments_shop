/* 장바구니 */
document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("cartList");
  const checkAll = document.getElementById("checkAll");
  const $ = (id) => document.getElementById(id);

  function render() {
    const raw = Cart.get();
    const items = expandItems(raw);

    list.innerHTML = items.length
      ? items.map((i, idx) => `
        <div class="cart-item" data-idx="${idx}">
          <input type="checkbox" class="js-check" ${i.checked ? "checked" : ""} aria-label="선택">
          <a href="product.html?id=${i.id}" class="cart-item__thumb">${productImage(i.product)}</a>
          <div>
            <p class="card__brand">${i.product.brand}</p>
            <a href="product.html?id=${i.id}" class="card__name" style="min-height:0">${i.product.name}</a>
            <p class="cart-item__opt">사이즈 ${i.size}</p>
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
        </div>`).join("")
      : `<p class="empty">장바구니에 담긴 상품이 없습니다.<br><br><a href="clothes.html" class="link-btn">쇼핑하러 가기</a></p>`;

    checkAll.checked = items.length > 0 && items.every((i) => i.checked);

    const o = calcOrder(items.filter((i) => i.checked));
    $("sumOrigin").textContent = won(o.origin);
    $("sumDiscount").textContent = o.discount ? "-" + won(o.discount) : "0원";
    $("sumShip").textContent = won(o.shipping);
    $("sumTotal").textContent = won(o.total);
    $("orderBtn").disabled = o.subtotal === 0;
    $("orderBtn").textContent = o.subtotal ? `${won(o.total)} 주문하기` : "주문하기";
  }

  function update(fn) {
    const raw = Cart.get();
    fn(raw);
    Cart.save(raw);
    render();
  }

  list.addEventListener("click", (e) => {
    const row = e.target.closest(".cart-item");
    if (!row) return;
    const idx = Number(row.dataset.idx);
    if (e.target.closest(".js-minus")) update((r) => (r[idx].qty = Math.max(1, r[idx].qty - 1)));
    if (e.target.closest(".js-plus")) update((r) => (r[idx].qty = Math.min(10, r[idx].qty + 1)));
    if (e.target.closest(".js-remove")) update((r) => r.splice(idx, 1));
  });
  list.addEventListener("change", (e) => {
    if (!e.target.classList.contains("js-check")) return;
    const idx = Number(e.target.closest(".cart-item").dataset.idx);
    update((r) => (r[idx].checked = e.target.checked));
  });
  checkAll.addEventListener("change", () => update((r) => r.forEach((i) => (i.checked = checkAll.checked))));
  $("removeChecked").addEventListener("click", () => {
    Cart.save(Cart.get().filter((i) => !i.checked));
    render();
  });

  $("orderBtn").addEventListener("click", () => {
    const items = Cart.get().filter((i) => i.checked).map(({ id, size, qty }) => ({ id, size, qty }));
    if (!items.length) return;
    writeJSON(CHECKOUT_KEY, { source: "cart", items }, "sessionStorage");
    location.href = "checkout.html";
  });

  render();
});
