/* 공통: 헤더/푸터, 장바구니, 유틸 */
const CART_KEY = "nine_cart";
const LIKE_KEY = "nine_likes";
const CHECKOUT_KEY = "nine_checkout";
const ORDER_KEY = "nine_pending_order";

const won = (n) => n.toLocaleString("ko-KR") + "원";

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

/* ---------- 장바구니 ---------- */
const Cart = {
  get: () => readJSON(CART_KEY, []),
  save(items) { writeJSON(CART_KEY, items); renderCartBadge(); },
  add(id, size, qty) {
    const items = Cart.get();
    const found = items.find((i) => i.id === id && i.size === size);
    if (found) found.qty += qty;
    else items.push({ id, size, qty, checked: true });
    Cart.save(items);
  },
  count: () => Cart.get().reduce((s, i) => s + i.qty, 0),
};

/* 장바구니 항목 → 화면 표시용 데이터 */
function expandItems(items) {
  return items
    .map((i) => {
      const p = getProduct(i.id);
      return p ? { ...i, product: p, unit: salePrice(p), total: salePrice(p) * i.qty } : null;
    })
    .filter(Boolean);
}

function calcOrder(items) {
  const origin = items.reduce((s, i) => s + i.product.price * i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const freeItem = items.some((i) => i.product.tags.includes("무료배송"));
  const shipping = subtotal === 0 || subtotal >= 50000 || freeItem ? 0 : 3000;
  return { origin, discount: origin - subtotal, subtotal, shipping, total: subtotal + shipping };
}

/* ---------- 좋아요 ---------- */
const Likes = {
  get: () => readJSON(LIKE_KEY, []),
  toggle(id) {
    const list = Likes.get();
    const idx = list.indexOf(id);
    idx >= 0 ? list.splice(idx, 1) : list.push(id);
    writeJSON(LIKE_KEY, list);
    return idx < 0;
  },
};

const HEART = `<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" fill="rgba(0,0,0,.15)" stroke="#fff" stroke-width="1.6"/></svg>`;

/* ---------- 헤더 / 푸터 ---------- */
function renderHeader(active) {
  const el = document.getElementById("header");
  if (!el) return;
  const nav = Object.entries(CATEGORIES)
    .map(([key, c]) => `<a href="${c.page}" class="${key === active ? "is-active" : ""}">${c.name}</a>`)
    .join("");
  el.className = "header";
  el.innerHTML = `
    <div class="inner header__top">
      <a href="index.html" class="logo">NINE STORE</a>
      <form class="search" action="clothes.html" onsubmit="return false">
        <input type="search" placeholder="브랜드, 상품을 검색해 보세요" aria-label="검색">
      </form>
      <div class="header__util">
        <a href="#" onclick="toast('데모 페이지입니다'); return false;">로그인</a>
        <a href="cart.html" class="cart-link">장바구니 <span class="cart-badge" id="cartBadge">0</span></a>
      </div>
    </div>
    <nav class="inner gnb">
      ${nav}
      <a href="#" onclick="toast('준비 중입니다'); return false;">아우터</a>
      <a href="#" onclick="toast('준비 중입니다'); return false;">가방</a>
      <a href="#" onclick="toast('준비 중입니다'); return false;">액세서리</a>
      <a href="#" onclick="toast('준비 중입니다'); return false;">세일</a>
    </nav>`;
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
      <p>본 사이트는 토스페이먼츠 결제 연동 퍼블리싱 데모입니다. 실제 상품 판매 및 배송은 이루어지지 않습니다.</p>
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

document.addEventListener("DOMContentLoaded", () => {
  renderHeader(document.body.dataset.category);
  renderFooter();
});
