/* 카테고리 목록 페이지 (clothes / shoes / pants) */
document.addEventListener("DOMContentLoaded", () => {
  const category = document.body.dataset.category;
  const all = PRODUCTS.filter((p) => p.category === category);
  const subs = ["전체", ...new Set(all.map((p) => p.sub))];
  const state = { sub: "전체", sort: "rank" };

  const chips = document.getElementById("chips");
  const grid = document.getElementById("grid");
  const count = document.getElementById("count");
  const sort = document.getElementById("sort");

  chips.innerHTML = subs
    .map((s) => `<button type="button" class="chip${s === "전체" ? " is-active" : ""}" data-sub="${s}">${s}</button>`)
    .join("");

  chips.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    state.sub = btn.dataset.sub;
    chips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === btn));
    render();
  });
  sort.addEventListener("change", () => { state.sort = sort.value; render(); });

  grid.addEventListener("click", (e) => {
    const like = e.target.closest(".card__like");
    if (!like) return;
    e.preventDefault();
    const on = Likes.toggle(like.dataset.id);
    like.classList.toggle("is-on", on);
    toast(on ? "좋아요에 추가했어요" : "좋아요를 취소했어요");
  });

  // 랭킹 = 리뷰 수 기준
  const ranked = [...all].sort((a, b) => b.reviews - a.reviews);
  const rankOf = Object.fromEntries(ranked.map((p, i) => [p.id, i + 1]));

  function render() {
    let list = all.filter((p) => state.sub === "전체" || p.sub === state.sub);
    const sorters = {
      rank: (a, b) => rankOf[a.id] - rankOf[b.id],
      low: (a, b) => salePrice(a) - salePrice(b),
      high: (a, b) => salePrice(b) - salePrice(a),
      discount: (a, b) => b.discount - a.discount,
      rating: (a, b) => b.rating - a.rating,
    };
    list.sort(sorters[state.sort]);
    count.textContent = `${list.length}개 상품`;

    const likes = Likes.get();
    grid.innerHTML = list.length
      ? list.map((p) => `
        <a class="card" href="product.html?id=${p.id}">
          <div class="card__thumb">
            ${productImage(p)}
            ${state.sort === "rank" ? `<span class="card__rank">${rankOf[p.id]}</span>` : ""}
            <button type="button" class="card__like${likes.includes(p.id) ? " is-on" : ""}" data-id="${p.id}" aria-label="좋아요">${HEART}</button>
          </div>
          <div class="card__body">
            <p class="card__brand">${p.brand}</p>
            <p class="card__name">${p.name}</p>
            ${priceHTML(p)}
            <div class="card__meta"><span class="star">★ ${p.rating}</span><span>후기 ${p.reviews.toLocaleString("ko-KR")}</span></div>
            <div class="card__tags">${p.tags.map((t) => `<span class="tag${t === "무료배송" ? " tag--free" : ""}">${t}</span>`).join("")}</div>
          </div>
        </a>`).join("")
      : `<p class="empty">상품이 없습니다.</p>`;
  }

  render();
});
