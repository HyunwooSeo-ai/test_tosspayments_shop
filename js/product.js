/* 상품 상세: 사이즈별 재고(1-6), 장바구니·바로 구매, 리뷰(7-1, 7-2) */
document.addEventListener("DOMContentLoaded", async () => {
  await App.ready;
  if (showLoadError()) return;

  const id = new URLSearchParams(location.search).get("id");
  const p = getProduct(id);
  if (!p) {
    location.replace("clothes.html");
    return;
  }
  document.body.dataset.category = p.category;
  renderHeader(p.category);
  document.title = `${p.name} | NINE STORE`;

  const state = { size: null, qty: 1 };
  const $ = (sel) => document.getElementById(sel);
  const maxQty = () => Math.min(10, state.size ? p.stock[state.size] : 10);

  const cat = CATEGORIES[p.category];
  $("thumb").innerHTML = productImage(p, 1000);
  $("breadcrumb").innerHTML = cat ? `<a href="${cat.page}">${esc(cat.name)}</a> &gt; ${esc(p.sub)}` : esc(p.sub);
  $("brand").textContent = p.brand;
  $("name").textContent = p.name;
  $("price").innerHTML = priceHTML(p);
  $("ship").textContent = salePrice(p) >= 50000 || p.tags.includes("무료배송") ? "무료배송" : "3,000원 (5만원 이상 구매 시 무료)";
  $("point").textContent = `최대 ${Math.round(salePrice(p) * 0.05).toLocaleString("ko-KR")}원 적립`;
  renderRatingRow();

  // 재고가 0인 사이즈는 "품절"로 표시하고 선택할 수 없습니다.
  $("sizes").innerHTML = p.sizes.map((s) => {
    const left = p.stock[s];
    const label = left === 0 ? `${esc(s)} <small>품절</small>` : left <= 5 ? `${esc(s)} <small>${left}개 남음</small>` : esc(s);
    return `<button type="button" class="size" data-size="${esc(s)}" ${left === 0 ? "disabled" : ""}>${label}</button>`;
  }).join("");
  $("sizes").addEventListener("click", (e) => {
    const btn = e.target.closest(".size");
    if (!btn || btn.disabled) return;
    state.size = btn.dataset.size;
    $("sizes").querySelectorAll(".size").forEach((b) => b.classList.toggle("is-active", b === btn));
    $("hint").textContent = "";
    setQty(state.qty);
  });

  if (isSoldOut(p)) {
    $("addCart").disabled = true;
    $("buyNow").disabled = true;
    $("buyNow").textContent = "품절";
  }

  $("minus").addEventListener("click", () => setQty(state.qty - 1));
  $("plus").addEventListener("click", () => setQty(state.qty + 1));
  setQty(1);

  $("addCart").addEventListener("click", async () => {
    if (!requireSize()) return;
    try {
      await Cart.add(p.id, state.size, state.qty);
      toast("장바구니에 담았어요");
    } catch (err) {
      console.error(err);
      toast("장바구니에 담지 못했어요");
    }
  });

  // 비로그인으로 "바로 구매"를 누르면 로그인 후 주문서로 돌아옵니다. (2-5)
  $("buyNow").addEventListener("click", () => {
    if (!requireSize()) return;
    writeJSON(CHECKOUT_KEY, { source: "direct", items: [{ id: p.id, size: state.size, qty: state.qty }] }, "sessionStorage");
    if (requireLogin("checkout.html")) location.href = "checkout.html";
  });

  function setQty(n) {
    state.qty = Math.min(maxQty(), Math.max(1, n));
    $("qty").textContent = state.qty;
    $("total").textContent = won(salePrice(p) * state.qty);
  }

  function requireSize() {
    if (state.size) return true;
    $("hint").textContent = "사이즈를 선택해 주세요.";
    return false;
  }

  function renderRatingRow() {
    $("review").innerHTML = p.reviews
      ? `<span style="color:#ffa800">★ ${p.rating.toFixed(1)}</span> · 후기 ${p.reviews.toLocaleString("ko-KR")}개`
      : "아직 후기가 없습니다";
  }

  /* ---------- 리뷰 ---------- */
  const reviewList = $("reviewList");
  const reviewForm = $("reviewForm");
  let rating = 5;

  async function loadReviews() {
    const [{ data: rows, error }, { data: prod }] = await Promise.all([
      sb.from("reviews").select("id, user_id, author_name, rating, content, created_at")
        .eq("product_id", p.id).order("created_at", { ascending: false }).limit(50),
      sb.from("products").select("rating_avg, review_count").eq("id", p.id).single(),
    ]);
    if (error) {
      reviewList.innerHTML = `<p class="empty">후기를 불러오지 못했습니다.</p>`;
      return;
    }
    if (prod) {
      p.rating = Number(prod.rating_avg);
      p.reviews = prod.review_count;
      renderRatingRow();
    }
    $("reviewCount").textContent = p.reviews ? `${p.reviews}개 · 평균 ★ ${p.rating.toFixed(1)}` : "";
    reviewList.innerHTML = rows.length
      ? rows.map((r) => `
        <div class="review">
          <div class="review__head">
            <span class="review__stars">${"★".repeat(r.rating)}<span>${"★".repeat(5 - r.rating)}</span></span>
            <span class="review__meta">${esc(r.author_name)} · ${fmtDate(r.created_at).slice(0, 10)}</span>
            ${Auth.user && r.user_id === Auth.user.id ? `<button type="button" class="link-btn js-del-review" data-id="${r.id}">삭제</button>` : ""}
          </div>
          <p class="review__body">${esc(r.content)}</p>
        </div>`).join("")
      : `<p class="empty" style="padding:40px 0">아직 작성된 후기가 없습니다.</p>`;

    // 구매 완료한 회원만, 아직 쓰지 않았을 때 작성 폼을 보여 줍니다.
    const mine = Auth.user && rows.some((r) => r.user_id === Auth.user.id);
    let canWrite = false;
    if (Auth.user && !mine) {
      const { data } = await sb.rpc("has_purchased", { p_product: p.id });
      canWrite = data === true;
    }
    reviewForm.hidden = !canWrite;
  }

  $("stars").innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" aria-label="${n}점">★</button>`).join("");
  const paintStars = () => $("stars").querySelectorAll("button").forEach((b) => b.classList.toggle("is-on", Number(b.dataset.n) <= rating));
  paintStars();
  $("stars").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    rating = Number(b.dataset.n);
    paintStars();
  });

  reviewForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const content = $("reviewContent").value.trim();
    if (content.length < 5) {
      $("reviewHint").textContent = "후기를 5자 이상 입력해 주세요.";
      return;
    }
    const btn = reviewForm.querySelector("button[type=submit]");
    btn.disabled = true;
    const { error } = await sb.from("reviews").insert({ product_id: p.id, rating, content });
    btn.disabled = false;
    if (error) {
      console.error(error);
      $("reviewHint").textContent = "후기를 등록하지 못했습니다. 구매 완료한 상품만 후기를 쓸 수 있어요.";
      return;
    }
    $("reviewContent").value = "";
    $("reviewHint").textContent = "";
    toast("후기를 등록했어요");
    loadReviews();
  });

  reviewList.addEventListener("click", async (e) => {
    const btn = e.target.closest(".js-del-review");
    if (!btn || !confirm("후기를 삭제할까요?")) return;
    const { error } = await sb.from("reviews").delete().eq("id", btn.dataset.id);
    if (error) return toast("삭제하지 못했어요");
    toast("후기를 삭제했어요");
    loadReviews();
  });

  loadReviews();
});
