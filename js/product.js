/* 상품 상세 */
(function () {
  const id = new URLSearchParams(location.search).get("id");
  const p = getProduct(id);
  if (!p) {
    location.replace("clothes.html");
    return;
  }
  document.body.dataset.category = p.category;
  document.title = `${p.name} | NINE STORE`;

  const state = { size: null, qty: 1 };
  const $ = (sel) => document.getElementById(sel);

  document.addEventListener("DOMContentLoaded", () => {
    const cat = CATEGORIES[p.category];
    $("thumb").innerHTML = productImage(p, 1000);
    $("breadcrumb").innerHTML = `<a href="${cat.page}">${cat.name}</a> &gt; ${p.sub}`;
    $("brand").textContent = p.brand;
    $("name").textContent = p.name;
    $("price").innerHTML = priceHTML(p);
    $("ship").textContent = salePrice(p) >= 50000 || p.tags.includes("무료배송") ? "무료배송" : "3,000원 (5만원 이상 구매 시 무료)";
    $("review").innerHTML = `<span style="color:#ffa800">★ ${p.rating}</span> · 후기 ${p.reviews.toLocaleString("ko-KR")}개`;
    $("point").textContent = `최대 ${Math.round(salePrice(p) * 0.05).toLocaleString("ko-KR")}원 적립`;

    $("sizes").innerHTML = p.sizes.map((s) => `<button type="button" class="size" data-size="${s}">${s}</button>`).join("");
    $("sizes").addEventListener("click", (e) => {
      const btn = e.target.closest(".size");
      if (!btn) return;
      state.size = btn.dataset.size;
      $("sizes").querySelectorAll(".size").forEach((b) => b.classList.toggle("is-active", b === btn));
      $("hint").textContent = "";
    });

    $("minus").addEventListener("click", () => setQty(state.qty - 1));
    $("plus").addEventListener("click", () => setQty(state.qty + 1));
    setQty(1);

    $("addCart").addEventListener("click", () => {
      if (!requireSize()) return;
      Cart.add(p.id, state.size, state.qty);
      toast("장바구니에 담았어요");
    });

    $("buyNow").addEventListener("click", () => {
      if (!requireSize()) return;
      writeJSON(CHECKOUT_KEY, { source: "direct", items: [{ id: p.id, size: state.size, qty: state.qty }] }, "sessionStorage");
      location.href = "checkout.html";
    });
  });

  function setQty(n) {
    state.qty = Math.min(10, Math.max(1, n));
    $("qty").textContent = state.qty;
    $("total").textContent = won(salePrice(p) * state.qty);
  }

  function requireSize() {
    if (state.size) return true;
    $("hint").textContent = "사이즈를 선택해 주세요.";
    return false;
  }
})();
