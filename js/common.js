/* 공통: 로그인 상태, 장바구니, 좋아요, 헤더/푸터, 유틸
 * App.ready: 로그인 확인 → 상품·장바구니·좋아요 불러오기가 끝나면 풀리는 Promise. 페이지 스크립트는 이걸 기다린 뒤 그립니다.
 */
const CART_KEY = "nine_cart";         // 비로그인 장바구니 (localStorage)
const CHECKOUT_KEY = "nine_checkout"; // 주문서로 넘길 상품 목록 (sessionStorage)

const won = (n) => Number(n || 0).toLocaleString("ko-KR") + "원";

function store(type) {
  try { return window[type]; } catch (e) { return null; }
}
function readJSON(key, fallback, type = "localStorage") {
  try {
    const v = store(type)?.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) { return fallback; }
}
function writeJSON(key, value, type = "localStorage") {
  try { store(type)?.setItem(key, JSON.stringify(value)); } catch (e) {}
}
function removeKey(key, type = "localStorage") {
  try { store(type)?.removeItem(key); } catch (e) {}
}

const fmtDate = (s) => {
  const d = new Date(s);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const ORDER_STATUS = {
  PENDING: "결제 대기", CONFIRMING: "결제 확인 중", WAITING_DEPOSIT: "입금 대기", PAID: "결제 완료",
  PREPARING: "배송 준비", SHIPPING: "배송 중", DELIVERED: "배송 완료",
  CANCELED: "취소됨", FAILED: "결제 실패", EXPIRED: "만료",
};
const statusBadge = (s) => `<span class="badge badge--${s.toLowerCase()}">${ORDER_STATUS[s] || s}</span>`;

/* ---------- 로그인 상태 (2단계) ---------- */
const Auth = {
  user: null,
  profile: null, // { name, phone, address, role }
  async init() {
    const { data: { session } } = await sb.auth.getSession();
    Auth.user = session?.user || null;
    Auth.profile = null;
    if (Auth.user) {
      const { data } = await sb.from("profiles").select("name, phone, address, role").eq("id", Auth.user.id).maybeSingle();
      Auth.profile = data;
    }
  },
  // 화면 표시용. 실제 권한은 DB(RLS)와 서버 함수가 profiles.role로 판단합니다.
  isAdmin: () => Auth.profile?.role === "admin",
  async signOut() {
    await sb.auth.signOut();
    location.href = "clothes.html";
  },
};

const currentPage = () => (location.pathname.split("/").pop() || "index.html") + location.search;
const loginUrl = (next = currentPage()) => `login.html?next=${encodeURIComponent(next)}`;

/* 로그인이 필요하면 로그인 화면으로 보내고 false. 로그인 후 next로 돌아옵니다. (2-5) */
function requireLogin(next) {
  if (Auth.user) return true;
  location.href = loginUrl(next);
  return false;
}

/* 로그인 후 돌아갈 주소: 이 사이트의 html 페이지만 허용 (외부 주소로 보내지 않음) */
function safeNext(raw) {
  return raw && /^[a-z0-9_-]+\.html(\?[^#]*)?$/i.test(raw) ? raw : "clothes.html";
}

/* ---------- 장바구니 (4단계: 로그인하면 계정, 아니면 브라우저) ---------- */
const sameItem = (a, b) => a.id === b.id && a.size === b.size;

const Cart = {
  items: [], // [{ id, size, qty, checked }]
  async load() {
    if (Auth.user) {
      const { data, error } = await sb.from("cart_items").select("product_id, size, qty, checked").order("created_at");
      if (error) throw error;
      Cart.items = data.map((r) => ({ id: r.product_id, size: r.size, qty: r.qty, checked: r.checked }));
    } else {
      Cart.items = readJSON(CART_KEY, []);
    }
    renderCartBadge();
    return Cart.items;
  },
  get: () => Cart.items,
  count: () => Cart.items.reduce((s, i) => s + i.qty, 0),
  saveLocal() {
    writeJSON(CART_KEY, Cart.items);
    renderCartBadge();
  },
  async add(id, size, qty) {
    if (Auth.user) {
      const { error } = await sb.rpc("cart_add", { p_product: id, p_size: size, p_qty: qty });
      if (error) throw error;
      return Cart.load();
    }
    const found = Cart.items.find((i) => sameItem(i, { id, size }));
    if (found) { found.qty = Math.min(10, found.qty + qty); found.checked = true; }
    else Cart.items.push({ id, size, qty, checked: true });
    Cart.saveLocal();
  },
  // patch: { qty } 또는 { checked }
  async update(id, size, patch) {
    if (Auth.user) {
      const { error } = await sb.from("cart_items").update(patch).eq("user_id", Auth.user.id).eq("product_id", id).eq("size", size);
      if (error) throw error;
    }
    Cart.items.forEach((i) => sameItem(i, { id, size }) && Object.assign(i, patch));
    Auth.user ? renderCartBadge() : Cart.saveLocal();
  },
  async checkAll(checked) {
    if (Auth.user) {
      const { error } = await sb.from("cart_items").update({ checked }).eq("user_id", Auth.user.id);
      if (error) throw error;
    }
    Cart.items.forEach((i) => (i.checked = checked));
    if (!Auth.user) Cart.saveLocal();
  },
  async remove(list) {
    if (Auth.user) {
      const results = await Promise.all(list.map((i) =>
        sb.from("cart_items").delete().eq("user_id", Auth.user.id).eq("product_id", i.id).eq("size", i.size)));
      const failed = results.find((r) => r.error);
      if (failed) throw failed.error;
    }
    Cart.items = Cart.items.filter((i) => !list.some((r) => sameItem(i, r)));
    Auth.user ? renderCartBadge() : Cart.saveLocal();
  },
  // 4-2 로그인 전에 담은 상품을 계정 장바구니에 합칩니다. 같은 상품·사이즈는 수량을 더합니다.
  async mergeLocal() {
    const local = readJSON(CART_KEY, []);
    for (const i of local) {
      const { error } = await sb.rpc("cart_add", { p_product: i.id, p_size: i.size, p_qty: i.qty });
      if (error) console.warn("장바구니 합치기 실패", i, error);
    }
    removeKey(CART_KEY);
  },
};

/* 장바구니 항목 → 화면 표시용 데이터 (판매 중이 아닌 상품은 빠짐) */
function expandItems(items) {
  return items
    .map((i) => {
      const p = getProduct(i.id);
      return p ? { ...i, product: p, unit: salePrice(p), total: salePrice(p) * i.qty, stock: p.stock[i.size] ?? 0 } : null;
    })
    .filter(Boolean);
}

/* 금액 미리보기. 실제 결제 금액은 서버(create_order)가 같은 규칙으로 다시 계산합니다. */
function calcOrder(items) {
  const origin = items.reduce((s, i) => s + i.product.price * i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const freeItem = items.some((i) => i.product.tags.includes("무료배송"));
  const shipping = subtotal === 0 || subtotal >= 50000 || freeItem ? 0 : 3000;
  return { origin, discount: origin - subtotal, subtotal, shipping, total: subtotal + shipping };
}

/* ---------- 좋아요 (4-3: 로그인 필요, 계정에 저장) ---------- */
const Likes = {
  ids: new Set(),
  async load() {
    Likes.ids = new Set();
    removeKey("nine_likes"); // 예전 브라우저 저장분 정리
    if (!Auth.user) return;
    const { data, error } = await sb.from("likes").select("product_id").order("created_at", { ascending: false });
    if (error) throw error;
    Likes.ids = new Set(data.map((r) => r.product_id));
  },
  has: (id) => Likes.ids.has(id),
  // 켜지면 true, 꺼지면 false, 로그인 화면으로 보내면 null
  async toggle(id) {
    if (!requireLogin()) return null;
    if (Likes.ids.has(id)) {
      const { error } = await sb.from("likes").delete().eq("user_id", Auth.user.id).eq("product_id", id);
      if (error) throw error;
      Likes.ids.delete(id);
      return false;
    }
    const { error } = await sb.from("likes").insert({ product_id: id });
    if (error) throw error;
    Likes.ids.add(id);
    return true;
  },
};

const HEART = `<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" fill="rgba(0,0,0,.15)" stroke="#fff" stroke-width="1.6"/></svg>`;

/* ---------- 헤더 / 푸터 ---------- */
function renderHeader(active) {
  const el = document.getElementById("header");
  if (!el) return;
  const nav = Object.entries(CATEGORIES)
    .map(([key, c]) => `<a href="${c.page}" class="${key === active ? "is-active" : ""}">${esc(c.name)}</a>`)
    .join("");
  const q = document.body.dataset.page === "search" ? new URLSearchParams(location.search).get("q") || "" : "";
  const util = Auth.user
    ? `${Auth.isAdmin() ? `<a href="admin.html">관리자</a>` : ""}
       <a href="mypage.html">마이페이지</a>
       <button type="button" id="logoutBtn">로그아웃</button>`
    : `<a href="${loginUrl()}">로그인</a><a href="signup.html">회원가입</a>`;

  el.className = "header";
  el.innerHTML = `
    <div class="inner header__top">
      <a href="index.html" class="logo">NINE STORE</a>
      <form class="search" action="search.html" method="get" role="search">
        <input type="search" name="q" value="${esc(q)}" placeholder="브랜드, 상품을 검색해 보세요" aria-label="검색">
      </form>
      <div class="header__util">
        ${util}
        <a href="cart.html" class="cart-link">장바구니 <span class="cart-badge" id="cartBadge">0</span></a>
      </div>
    </div>
    <nav class="inner gnb">${nav}</nav>`;

  el.querySelector(".search").addEventListener("submit", (e) => {
    if (!e.target.q.value.trim()) e.preventDefault();
  });
  el.querySelector("#logoutBtn")?.addEventListener("click", () => Auth.signOut());
  renderCartBadge();
}

function renderCartBadge() {
  const b = document.getElementById("cartBadge");
  if (b) b.textContent = Cart.count();
}

function renderFooter() {
  const el = document.getElementById("footer");
  if (!el) return;
  el.className = "footer";
  el.innerHTML = `
    <div class="inner">
      <strong>NINE STORE</strong>
      <p>본 사이트는 토스페이먼츠 결제 연동 데모입니다. 실제 상품 판매 및 배송은 이루어지지 않습니다.</p>
      <p>결제는 테스트 키로 진행되며 실제 금액이 청구되지 않습니다.</p>
      <p>상품 사진: <a href="https://unsplash.com" target="_blank" rel="noopener" style="text-decoration:underline">Unsplash</a> (Unsplash License)</p>
    </div>`;
}

/* ---------- 토스트 ---------- */
let toastTimer;
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("is-show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-show"), 1800);
}

function priceHTML(p) {
  return `<div class="price">
    ${p.discount ? `<span class="price__rate">${p.discount}%</span>` : ""}
    <span class="price__now">${salePrice(p).toLocaleString("ko-KR")}원</span>
    ${p.discount ? `<span class="price__origin">${p.price.toLocaleString("ko-KR")}원</span>` : ""}
  </div>`;
}

const ratingText = (p) => (p.reviews ? `★ ${p.rating.toFixed(1)}` : "★ -");

/* 상품 카드 (목록, 검색, 마이페이지 좋아요) */
function cardHTML(p, rank) {
  return `
    <a class="card" href="product.html?id=${encodeURIComponent(p.id)}">
      <div class="card__thumb">
        ${productImage(p)}
        ${rank ? `<span class="card__rank">${rank}</span>` : ""}
        ${isSoldOut(p) ? `<span class="card__soldout">품절</span>` : ""}
        <button type="button" class="card__like${Likes.has(p.id) ? " is-on" : ""}" data-id="${esc(p.id)}" aria-label="좋아요">${HEART}</button>
      </div>
      <div class="card__body">
        <p class="card__brand">${esc(p.brand)}</p>
        <p class="card__name">${esc(p.name)}</p>
        ${priceHTML(p)}
        <div class="card__meta"><span class="star">${ratingText(p)}</span><span>후기 ${p.reviews.toLocaleString("ko-KR")}</span></div>
        <div class="card__tags">${p.tags.map((t) => `<span class="tag${t === "무료배송" ? " tag--free" : ""}">${esc(t)}</span>`).join("")}</div>
      </div>
    </a>`;
}

/* 카드의 좋아요 버튼 처리 (이벤트 위임) */
function bindLikeButtons(container, onChange) {
  container.addEventListener("click", async (e) => {
    const like = e.target.closest(".card__like");
    if (!like) return;
    e.preventDefault();
    try {
      const on = await Likes.toggle(like.dataset.id);
      if (on === null) return;
      like.classList.toggle("is-on", on);
      toast(on ? "좋아요에 추가했어요" : "좋아요를 취소했어요");
      onChange?.(like.dataset.id, on);
    } catch (err) {
      console.error(err);
      toast("좋아요를 저장하지 못했어요");
    }
  });
}

/* ---------- 시작 ---------- */
const App = {
  error: null,
  ready: (async () => {
    try {
      await Auth.init();
      await Promise.all([loadCatalog(), Cart.load(), Likes.load()]);
    } catch (e) {
      console.error(e);
      App.error = e;
    }
  })(),
};

/* App.ready가 실패했을 때 본문에 안내를 띄웁니다. 페이지 스크립트에서 true면 중단합니다. */
function showLoadError(target = document.querySelector("main")) {
  if (!App.error) return false;
  if (target) target.innerHTML = `<p class="empty">정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>`;
  return true;
}

document.addEventListener("DOMContentLoaded", async () => {
  renderFooter();
  await App.ready;
  renderHeader(document.body.dataset.category);
});
