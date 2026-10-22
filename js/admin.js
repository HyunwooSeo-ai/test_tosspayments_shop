/* 관리자 화면 (7단계): 상품·재고·사진(7-4, 7-5, 7-7), 주문(7-6), 카테고리(7-8)
 * 화면 접근은 profiles.role로 막고(7-3), 실제 데이터 수정 권한은 DB의 RLS 정책이 같은 값으로 다시 확인합니다.
 */
document.addEventListener("DOMContentLoaded", async () => {
  await App.ready;
  if (showLoadError()) return;
  if (!requireLogin()) return;

  const $ = (id) => document.getElementById(id);
  if (!Auth.isAdmin()) {
    $("adminMain").innerHTML = `<p class="empty">관리자만 접근할 수 있는 페이지입니다.<br><br><a href="clothes.html" class="link-btn">쇼핑몰로 돌아가기</a></p>`;
    return;
  }

  const TABS = ["products", "orders", "categories"];
  const qTab = new URLSearchParams(location.search).get("tab");
  const tab = TABS.includes(qTab) ? qTab : "products";
  document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("is-active", a.dataset.tab === tab));
  const panel = $(`tab-${tab}`);
  panel.hidden = false;

  const SHIP_FLOW = ["PAID", "PREPARING", "SHIPPING", "DELIVERED"];
  let categories = [];

  async function loadCategories() {
    const { data, error } = await sb.from("categories").select("*").order("sort");
    if (error) throw error;
    categories = data;
  }

  /* =================== 상품·재고 =================== */
  let products = [];
  let editing = null; // 수정 중인 상품 (새 상품이면 null)

  async function loadProducts() {
    // 관리자는 RLS에 따라 숨긴 상품까지 모두 조회됩니다.
    const { data, error } = await sb.from("products").select(PRODUCT_SELECT).order("sort").order("created_at");
    if (error) throw error;
    products = data.map(toProduct);
  }

  function renderProducts() {
    const catName = (k) => categories.find((c) => c.key === k)?.name || k;
    panel.innerHTML = `
      <div class="admin-bar">
        <span>${products.length}개 상품</span>
        <input type="search" id="pSearch" placeholder="상품명·브랜드 검색">
        <button type="button" class="btn btn--line btn--sm" id="embedProducts" title="상품 설명이 바뀐 상품만 챗봇 검색용으로 다시 학습합니다">챗봇 학습</button>
        <button type="button" class="btn btn--primary btn--sm" id="newProduct">+ 새 상품</button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>사진</th><th>상품</th><th>카테고리</th><th>판매가</th><th>재고</th><th>노출</th><th></th></tr></thead>
          <tbody id="pRows"></tbody>
        </table>
      </div>`;

    const draw = () => {
      const q = $("pSearch").value.trim().toLowerCase();
      const list = products.filter((p) => !q || `${p.brand} ${p.name} ${p.id}`.toLowerCase().includes(q));
      $("pRows").innerHTML = list.map((p) => `
        <tr class="${p.visible ? "" : "is-hidden"}">
          <td><div class="table__thumb">${productImage(p, 120)}</div></td>
          <td><b>${esc(p.brand)}</b><br>${esc(p.name)}<br><small>${esc(p.id)}</small></td>
          <td>${esc(catName(p.category))}<br><small>${esc(p.sub)}</small></td>
          <td>${won(salePrice(p))}<br><small>${won(p.price)} · ${p.discount}%</small></td>
          <td>${p.sizes.map((s) => `<span class="stock-chip${p.stock[s] === 0 ? " is-zero" : ""}">${esc(s)} ${p.stock[s]}</span>`).join(" ")}</td>
          <td>${p.visible ? "노출" : "<b class='warn'>숨김</b>"}</td>
          <td><button type="button" class="link-btn js-edit" data-id="${esc(p.id)}">수정</button></td>
        </tr>`).join("") || `<tr><td colspan="7" class="empty">상품이 없습니다.</td></tr>`;
    };
    $("pSearch").addEventListener("input", draw);
    $("newProduct").addEventListener("click", () => openProduct(null));
    $("embedProducts").addEventListener("click", async (e) => {
      e.target.disabled = true;
      const r = await embedProducts();
      e.target.disabled = false;
      if (r) toast(r.updated ? `챗봇이 상품 ${r.updated}개를 새로 학습했어요` : "챗봇이 이미 최신 상품을 알고 있어요");
    });
    $("pRows").addEventListener("click", (e) => {
      const btn = e.target.closest(".js-edit");
      if (btn) openProduct(products.find((p) => p.id === btn.dataset.id));
    });
    draw();
  }

  /* 챗봇 학습(embed-products). 실패해도 상품 저장에는 영향이 없습니다. */
  async function embedProducts() {
    try {
      return await callFn("embed-products", {});
    } catch (err) {
      console.error(err);
      toast(`챗봇 학습 실패: ${err.message}`);
      return null;
    }
  }

  /* ---------- 상품 등록·수정 모달 ---------- */
  const modal = $("productModal");
  const form = $("productForm");
  let pendingFile = null;

  function stockRow(size = "", qty = 0) {
    return `<div class="stock-row">
      <input class="js-size" value="${esc(size)}" placeholder="사이즈" maxlength="10" aria-label="사이즈">
      <input class="js-qty" type="number" min="0" value="${qty}" aria-label="재고 수량">
      <button type="button" class="link-btn js-del-row">삭제</button>
    </div>`;
  }

  function previewImage(url) {
    $("fPreview").innerHTML = url ? `<img src="${esc(url)}" alt="">` : "";
  }

  function openProduct(p) {
    editing = p;
    pendingFile = null;
    form.reset();
    $("productModalTitle").textContent = p ? "상품 수정" : "새 상품 등록";
    $("fCategory").innerHTML = categories.filter((c) => !c.is_sale)
      .map((c) => `<option value="${esc(c.key)}">${esc(c.name)}</option>`).join("");
    $("fCategory").value = p?.category || categories[0]?.key;
    $("fSub").value = p?.sub || "";
    $("fBrand").value = p?.brand || "";
    $("fName").value = p?.name || "";
    $("fPrice").value = p?.price || "";
    $("fDiscount").value = p?.discount ?? 0;
    form.querySelectorAll("input[name=tag]").forEach((c) => (c.checked = !!p?.tags.includes(c.value)));
    $("fImage").value = p?.image || "";
    $("fVisible").checked = p ? p.visible : true;
    previewImage(p?.image);
    $("stockRows").innerHTML = p ? p.sizes.map((s) => stockRow(s, p.stock[s])).join("") : stockRow("FREE", 10);
    $("productHint").textContent = "";
    modal.showModal();
  }

  $("productCancel").addEventListener("click", () => modal.close());
  $("addStockRow").addEventListener("click", () => $("stockRows").insertAdjacentHTML("beforeend", stockRow()));
  $("stockRows").addEventListener("click", (e) => e.target.closest(".js-del-row")?.parentElement.remove());
  $("fImage").addEventListener("input", () => { pendingFile = null; previewImage($("fImage").value.trim()); });
  $("fFile").addEventListener("change", () => {
    pendingFile = $("fFile").files[0] || null;
    if (pendingFile) previewImage(URL.createObjectURL(pendingFile));
  });

  // 7-7 사진은 Supabase 저장소(product-images 버킷)에 올리고 공개 주소를 image_url로 저장합니다.
  async function uploadPhoto(productId, file) {
    if (file.size > 5 * 1024 * 1024) throw new Error("사진은 5MB 이하만 올릴 수 있습니다.");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${productId}/${Date.now()}.${ext}`;
    const { error } = await sb.storage.from("product-images").upload(path, file, { contentType: file.type });
    if (error) throw error;
    return sb.storage.from("product-images").getPublicUrl(path).data.publicUrl;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const hint = $("productHint");
    const price = Number($("fPrice").value);
    const discount = Number($("fDiscount").value || 0);
    const rows = [...$("stockRows").querySelectorAll(".stock-row")]
      .map((r, i) => ({ size: r.querySelector(".js-size").value.trim(), qty: Number(r.querySelector(".js-qty").value), sort: i + 1 }))
      .filter((r) => r.size);
    const imageUrl = $("fImage").value.trim();

    const invalid =
      (!$("fBrand").value.trim() && "브랜드를 입력해 주세요.") ||
      (!$("fName").value.trim() && "상품명을 입력해 주세요.") ||
      ((!Number.isInteger(price) || price < 100) && "정가를 100원 이상 숫자로 입력해 주세요.") ||
      ((!Number.isInteger(discount) || discount < 0 || discount > 90) && "할인율은 0~90 사이로 입력해 주세요.") ||
      (!rows.length && "사이즈를 하나 이상 입력해 주세요.") ||
      (rows.some((r) => !Number.isInteger(r.qty) || r.qty < 0) && "재고는 0 이상의 숫자로 입력해 주세요.") ||
      (new Set(rows.map((r) => r.size)).size !== rows.length && "같은 사이즈가 두 번 있습니다.") ||
      (imageUrl && !/^https:\/\//.test(imageUrl) && "이미지 주소는 https://로 시작해야 합니다.");
    if (invalid) {
      hint.textContent = invalid;
      return;
    }

    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    hint.textContent = "저장하는 중…";
    try {
      const values = {
        category: $("fCategory").value,
        sub: $("fSub").value.trim(),
        brand: $("fBrand").value.trim(),
        name: $("fName").value.trim(),
        price,
        discount,
        tags: [...form.querySelectorAll("input[name=tag]:checked")].map((c) => c.value),
        is_visible: $("fVisible").checked,
        image_url: imageUrl || null,
      };

      let id = editing?.id;
      if (id) {
        const { error } = await sb.from("products").update(values).eq("id", id);
        if (error) throw error;
      } else {
        const maxSort = Math.max(0, ...products.map((p) => p.sort || 0));
        const { data, error } = await sb.from("products").insert({ ...values, sort: maxSort + 1 }).select("id").single();
        if (error) throw error;
        id = data.id;
      }

      if (pendingFile) {
        const url = await uploadPhoto(id, pendingFile);
        const { error } = await sb.from("products").update({ image_url: url }).eq("id", id);
        if (error) throw error;
      }

      // 7-5 사이즈별 재고: 입력한 사이즈는 저장하고, 지운 사이즈는 삭제합니다.
      const { error: upErr } = await sb.from("product_stock")
        .upsert(rows.map((r) => ({ product_id: id, ...r })), { onConflict: "product_id,size" });
      if (upErr) throw upErr;
      const removed = (editing?.sizes || []).filter((s) => !rows.some((r) => r.size === s));
      if (removed.length) {
        const { error } = await sb.from("product_stock").delete().eq("product_id", id).in("size", removed);
        if (error) throw error;
      }

      modal.close();
      toast(editing ? "상품을 수정했어요" : "상품을 등록했어요");
      embedProducts(); // 챗봇 검색용 임베딩도 갱신 (바뀐 상품만)
      await loadProducts();
      renderProducts();
    } catch (err) {
      console.error(err);
      hint.textContent = `저장하지 못했습니다. (${err.message || err})`;
    } finally {
      btn.disabled = false;
    }
  });

  /* =================== 주문 =================== */
  async function renderOrders() {
    panel.innerHTML = `
      <div class="admin-bar">
        <select id="oStatus" aria-label="상태 필터">
          <option value="">전체 상태</option>
          ${Object.entries(ORDER_STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
        </select>
        <span id="oCount"></span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>주문</th><th>주문자</th><th>상품</th><th>금액</th><th>상태</th><th></th></tr></thead>
          <tbody id="oRows"><tr><td colspan="6" class="empty">불러오는 중…</td></tr></tbody>
        </table>
      </div>`;

    const draw = async () => {
      let query = sb.from("orders")
        .select("id, order_name, total_amount, status, created_at, receiver_name, receiver_phone, payment_method")
        .order("created_at", { ascending: false }).limit(200);
      if ($("oStatus").value) query = query.eq("status", $("oStatus").value);
      const { data, error } = await query;
      if (error) {
        $("oRows").innerHTML = `<tr><td colspan="6" class="empty">주문을 불러오지 못했습니다.</td></tr>`;
        return;
      }
      $("oCount").textContent = `${data.length}건`;
      $("oRows").innerHTML = data.map((o) => `
        <tr>
          <td><a class="link-btn" href="order.html?id=${encodeURIComponent(o.id)}">${esc(o.id)}</a><br><small>${fmtDate(o.created_at)}</small></td>
          <td>${esc(o.receiver_name)}<br><small>${esc(o.receiver_phone)}</small></td>
          <td>${esc(o.order_name)}<br><small>${esc(o.payment_method || "")}</small></td>
          <td>${won(o.total_amount)}</td>
          <td>${SHIP_FLOW.includes(o.status)
            ? `<select class="js-status" data-id="${esc(o.id)}" aria-label="주문 상태">${SHIP_FLOW.map((s) =>
              `<option value="${s}" ${s === o.status ? "selected" : ""}>${ORDER_STATUS[s]}</option>`).join("")}</select>`
            : statusBadge(o.status)}</td>
          <td>${[...SHIP_FLOW, "WAITING_DEPOSIT"].includes(o.status)
            ? `<button type="button" class="link-btn js-cancel" data-id="${esc(o.id)}">취소·환불</button>` : ""}</td>
        </tr>`).join("") || `<tr><td colspan="6" class="empty">주문이 없습니다.</td></tr>`;
    };

    $("oStatus").addEventListener("change", draw);
    $("oRows").addEventListener("change", async (e) => {
      const sel = e.target.closest(".js-status");
      if (!sel) return;
      const { error } = await sb.rpc("admin_set_order_status", { p_order: sel.dataset.id, p_status: sel.value });
      toast(error ? "상태를 바꾸지 못했어요" : `‘${ORDER_STATUS[sel.value]}’(으)로 바꿨어요`);
      if (error) draw();
    });
    $("oRows").addEventListener("click", async (e) => {
      const btn = e.target.closest(".js-cancel");
      if (!btn) return;
      const reason = prompt("취소 사유를 입력해 주세요.", "판매자 취소");
      if (reason === null) return;
      btn.disabled = true;
      try {
        await callFn("cancel-payment", { orderId: btn.dataset.id, reason });
        toast("주문을 취소했어요");
        draw();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });
    draw();
  }

  /* =================== 카테고리 =================== */
  function renderCategories() {
    const row = (c, isNew) => `
      <tr data-key="${esc(c.key || "")}">
        <td>${isNew ? `<input class="js-key" placeholder="영문 key (예: outer2)" maxlength="30">` : `<code>${esc(c.key)}</code>`}</td>
        <td><input class="js-name" value="${esc(c.name || "")}" maxlength="20" aria-label="이름"></td>
        <td><input class="js-desc" value="${esc(c.description || "")}" maxlength="100" aria-label="설명"></td>
        <td><input class="js-sort" type="number" value="${c.sort ?? 100}" style="width:70px" aria-label="순서"></td>
        <td><input type="checkbox" class="js-visible" ${c.is_visible !== false ? "checked" : ""} aria-label="노출"></td>
        <td><input type="checkbox" class="js-sale" ${c.is_sale ? "checked" : ""} aria-label="세일 모음"></td>
        <td><button type="button" class="link-btn js-save">${isNew ? "추가" : "저장"}</button></td>
      </tr>`;
    panel.innerHTML = `
      <p class="summary__note" style="margin:16px 0">노출을 켠 카테고리는 헤더 메뉴에 순서대로 나옵니다. "세일 모음"을 켜면 30% 이상 할인 상품을 모아 보여 줍니다.</p>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>key</th><th>이름</th><th>설명</th><th>순서</th><th>노출</th><th>세일 모음</th><th></th></tr></thead>
          <tbody id="cRows">${categories.map((c) => row(c)).join("")}${row({}, true)}</tbody>
        </table>
      </div>`;

    $("cRows").addEventListener("click", async (e) => {
      const btn = e.target.closest(".js-save");
      if (!btn) return;
      const tr = btn.closest("tr");
      const isNew = !tr.dataset.key;
      const key = isNew ? tr.querySelector(".js-key").value.trim() : tr.dataset.key;
      const values = {
        name: tr.querySelector(".js-name").value.trim(),
        description: tr.querySelector(".js-desc").value.trim(),
        sort: Number(tr.querySelector(".js-sort").value) || 0,
        is_visible: tr.querySelector(".js-visible").checked,
        is_sale: tr.querySelector(".js-sale").checked,
      };
      if (!/^[a-z0-9_-]{2,30}$/.test(key)) return toast("key는 영문 소문자·숫자 2~30자로 입력해 주세요");
      if (!values.name) return toast("이름을 입력해 주세요");

      const { error } = isNew
        ? await sb.from("categories").insert({ key, ...values })
        : await sb.from("categories").update(values).eq("key", key);
      if (error) {
        console.error(error);
        return toast(error.code === "23505" ? "이미 있는 key입니다" : "저장하지 못했어요");
      }
      toast(isNew ? "카테고리를 추가했어요" : "카테고리를 저장했어요");
      await loadCategories();
      await loadCatalog(); // 헤더 메뉴에 바로 반영
      renderHeader();
      renderCategories();
    });
  }

  try {
    await loadCategories();
    if (tab === "products") {
      await loadProducts();
      renderProducts();
    } else if (tab === "orders") {
      await renderOrders();
    } else {
      renderCategories();
    }
  } catch (err) {
    console.error(err);
    panel.innerHTML = `<p class="empty">정보를 불러오지 못했습니다.</p>`;
  }
});
