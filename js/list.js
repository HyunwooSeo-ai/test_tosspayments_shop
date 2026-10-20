/* 상품 목록: 카테고리 페이지(clothes / shoes / pants / list.html?cat=)와 검색 결과(search.html?q=) */
document.addEventListener("DOMContentLoaded", async () => {
  await App.ready;
  if (showLoadError()) return;

  const params = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);
  let all;

  if (document.body.dataset.page === "search") {
    // 1-7 검색: 브랜드·상품명·세부 분류에 검색어(띄어쓰기로 나눈 단어 모두)가 들어간 상품
    const q = (params.get("q") || "").trim();
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    all = terms.length
      ? PRODUCTS.filter((p) => terms.every((t) => `${p.brand} ${p.name} ${p.sub}`.toLowerCase().includes(t)))
      : [];
    $("bannerTitle").textContent = q ? `‘${q}’ 검색 결과` : "검색";
    $("bannerDesc").textContent = q ? `${all.length}개 상품을 찾았어요` : "브랜드나 상품명을 입력해 보세요";
    document.title = `${q || "검색"} | NINE STORE`;
  } else {
    const key = document.body.dataset.category || params.get("cat");
    const cat = CATEGORIES[key];
    if (!cat) {
      location.replace("clothes.html");
      return;
    }
    if (!document.body.dataset.category) {
      document.body.dataset.category = key;
      renderHeader(key);
    }
    // 세일 카테고리는 30% 이상 할인 상품을 모아 보여 줍니다.
    all = cat.isSale ? PRODUCTS.filter((p) => p.discount >= 30) : PRODUCTS.filter((p) => p.category === key);
    if ($("bannerTitle")) {
      $("bannerTitle").textContent = `${cat.title} 랭킹`;
      $("bannerDesc").textContent = cat.desc;
      document.title = `${cat.title} | NINE STORE`;
    }
  }

  const subs = ["전체", ...new Set(all.map((p) => p.sub).filter(Boolean))];
  const state = { sub: "전체", sort: "rank" };

  const chips = $("chips");
  const grid = $("grid");
  const count = $("count");
  const sort = $("sort");

  chips.innerHTML = subs
    .map((s) => `<button type="button" class="chip${s === "전체" ? " is-active" : ""}" data-sub="${esc(s)}">${esc(s)}</button>`)
    .join("");

  chips.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    state.sub = btn.dataset.sub;
    chips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === btn));
    render();
  });
  sort.addEventListener("change", () => { state.sort = sort.value; render(); });
  bindLikeButtons(grid);

  // 랭킹(인기순) = 누적 판매량(popularity) 기준
  const ranked = [...all].sort((a, b) => b.popularity - a.popularity);
  const rankOf = Object.fromEntries(ranked.map((p, i) => [p.id, i + 1]));

  function render() {
    const list = all.filter((p) => state.sub === "전체" || p.sub === state.sub);
    const sorters = {
      rank: (a, b) => rankOf[a.id] - rankOf[b.id],
      low: (a, b) => salePrice(a) - salePrice(b),
      high: (a, b) => salePrice(b) - salePrice(a),
      discount: (a, b) => b.discount - a.discount,
      rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
    };
    list.sort(sorters[state.sort]);
    count.textContent = `${list.length}개 상품`;

    grid.innerHTML = list.length
      ? list.map((p) => cardHTML(p, state.sort === "rank" ? rankOf[p.id] : null)).join("")
      : `<p class="empty">${document.body.dataset.page === "search" ? "검색 결과가 없습니다." : "상품이 없습니다."}</p>`;
  }

  render();
});
