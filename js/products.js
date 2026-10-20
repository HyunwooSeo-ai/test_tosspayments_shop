/* 상품 데이터 + 상품 이미지
 * 카테고리·상품·재고는 Supabase DB에서 불러옵니다(loadCatalog). 페이지는 App.ready 이후에 PRODUCTS를 씁니다.
 * 사진은 image_url을 쓰고, 사진이 없거나 로드에 실패하면 SVG 일러스트로 대체합니다.
 */
let CATEGORIES = {}; // key → { name, title, desc, page, isSale }
let PRODUCTS = [];   // 노출 중인 상품만

/* HTML에 넣을 문자열 이스케이프 (DB 값은 관리자·회원이 바꿀 수 있으므로 항상 거친다) */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/* 상의·신발·바지는 전용 페이지, 그 밖의 카테고리는 list.html?cat= 으로 엽니다. */
function categoryPage(key) {
  return ["clothes", "shoes", "pants"].includes(key) ? `${key}.html` : `list.html?cat=${encodeURIComponent(key)}`;
}

/* DB 행 → 화면에서 쓰는 상품 객체 */
function toProduct(r) {
  const stock = [...(r.product_stock || [])].sort((a, b) => a.sort - b.sort);
  return {
    id: r.id, category: r.category, sub: r.sub, shape: r.shape, color: r.color,
    brand: r.brand, name: r.name, price: r.price, discount: r.discount, tags: r.tags || [],
    image: r.image_url, rating: Number(r.rating_avg), reviews: r.review_count, popularity: r.popularity,
    visible: r.is_visible, sort: r.sort,
    sizes: stock.map((s) => s.size),
    stock: Object.fromEntries(stock.map((s) => [s.size, s.qty])),
  };
}

const PRODUCT_SELECT = "*, product_stock(size, qty, sort)";

async function loadCatalog() {
  const [cats, prods] = await Promise.all([
    sb.from("categories").select("*").eq("is_visible", true).order("sort"),
    sb.from("products").select(PRODUCT_SELECT).eq("is_visible", true).order("sort"),
  ]);
  if (cats.error || prods.error) throw cats.error || prods.error;
  CATEGORIES = Object.fromEntries(cats.data.map((c) => [c.key, {
    name: c.name, title: c.name, desc: c.description, page: categoryPage(c.key), isSale: c.is_sale,
  }]));
  PRODUCTS = prods.data.map(toProduct);
}

function getProduct(id) {
  return PRODUCTS.find((p) => p.id === id);
}

/* 할인가: 100원 단위 반올림. 서버(sale_price 함수)와 같은 규칙입니다. */
function salePrice(p) {
  return Math.round((p.price * (100 - p.discount)) / 100 / 100) * 100;
}

const totalStock = (p) => Object.values(p.stock || {}).reduce((s, n) => s + n, 0);
const isSoldOut = (p) => p.sizes.length > 0 && totalStock(p) === 0;

/* ---------- SVG 상품 이미지 ---------- */
function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 200;
}

const SHAPES = {
  tee: (c, s) => `
    <path d="M170 150 L218 132 Q250 160 282 132 L330 150 L400 215 L362 262 L330 240 L330 480 L170 480 L170 240 L138 262 L100 215 Z" fill="${c}" stroke="${s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M218 132 Q250 172 282 132" fill="none" stroke="${s}" stroke-width="3"/>`,
  hoodie: (c, s) => `
    <path d="M200 120 Q250 80 300 120 L300 170 L200 170 Z" fill="${c}" stroke="${s}" stroke-width="3"/>
    <path d="M170 160 L330 160 L410 350 L372 366 L330 270 L330 490 L170 490 L170 270 L128 366 L90 350 Z" fill="${c}" stroke="${s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M215 160 Q250 200 285 160" fill="none" stroke="${s}" stroke-width="3"/>
    <line x1="238" y1="185" x2="236" y2="240" stroke="${s}" stroke-width="3"/>
    <line x1="262" y1="185" x2="264" y2="240" stroke="${s}" stroke-width="3"/>
    <path d="M200 380 L300 380 L310 440 L190 440 Z" fill="none" stroke="${s}" stroke-width="3"/>
    <rect x="170" y="470" width="160" height="20" fill="none" stroke="${s}" stroke-width="3"/>`,
  pants: (c, s) => `
    <path d="M175 110 L325 110 L350 500 L272 500 L250 215 L228 500 L150 500 Z" fill="${c}" stroke="${s}" stroke-width="3" stroke-linejoin="round"/>
    <rect x="175" y="110" width="150" height="24" fill="none" stroke="${s}" stroke-width="3"/>
    <line x1="250" y1="134" x2="250" y2="215" stroke="${s}" stroke-width="3"/>
    <path d="M185 140 Q205 175 228 160 M315 140 Q295 175 272 160" fill="none" stroke="${s}" stroke-width="3"/>`,
  cargo: (c, s) => `
    <path d="M175 110 L325 110 L355 500 L274 500 L250 215 L226 500 L145 500 Z" fill="${c}" stroke="${s}" stroke-width="3" stroke-linejoin="round"/>
    <rect x="175" y="110" width="150" height="24" fill="none" stroke="${s}" stroke-width="3"/>
    <line x1="250" y1="134" x2="250" y2="215" stroke="${s}" stroke-width="3"/>
    <rect x="160" y="280" width="52" height="64" fill="none" stroke="${s}" stroke-width="3"/>
    <rect x="290" y="280" width="52" height="64" fill="none" stroke="${s}" stroke-width="3"/>
    <line x1="160" y1="296" x2="212" y2="296" stroke="${s}" stroke-width="3"/>
    <line x1="290" y1="296" x2="342" y2="296" stroke="${s}" stroke-width="3"/>`,
  shorts: (c, s) => `
    <path d="M165 190 L335 190 L360 400 L268 400 L250 290 L232 400 L140 400 Z" fill="${c}" stroke="${s}" stroke-width="3" stroke-linejoin="round"/>
    <rect x="165" y="190" width="170" height="24" fill="none" stroke="${s}" stroke-width="3"/>
    <line x1="250" y1="214" x2="250" y2="290" stroke="${s}" stroke-width="3"/>`,
  sneaker: (c, s) => `
    <path d="M80 390 Q82 315 150 305 L250 268 Q290 258 312 300 Q340 340 405 350 Q432 356 432 390 Z" fill="${c}" stroke="${s}" stroke-width="3" stroke-linejoin="round"/>
    <rect x="76" y="390" width="360" height="28" rx="8" fill="#fafafa" stroke="${s}" stroke-width="3"/>
    <path d="M230 285 L262 318 M210 295 L242 328 M190 304 L222 337" stroke="${s}" stroke-width="3"/>
    <path d="M140 360 Q230 340 330 360" fill="none" stroke="${s}" stroke-width="3"/>`,
  runner: (c, s) => `
    <path d="M85 380 Q90 310 160 295 L245 262 Q285 252 305 292 Q340 330 410 338 Q440 344 438 380 Z" fill="${c}" stroke="${s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M78 380 L440 380 Q445 412 420 420 L100 420 Q72 414 78 380 Z" fill="#ececec" stroke="${s}" stroke-width="3"/>
    <path d="M150 340 L230 300 L300 345" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".8"/>
    <path d="M228 278 L258 308 M208 288 L238 318" stroke="${s}" stroke-width="3"/>`,
  hightop: (c, s) => `
    <path d="M110 390 L118 210 Q120 190 145 190 L230 190 Q250 190 252 215 L258 300 Q300 330 400 345 Q432 350 432 390 Z" fill="${c}" stroke="${s}" stroke-width="3" stroke-linejoin="round"/>
    <rect x="104" y="390" width="332" height="30" rx="6" fill="#fafafa" stroke="${s}" stroke-width="3"/>
    <circle cx="160" cy="300" r="18" fill="#fafafa" stroke="${s}" stroke-width="3"/>
    <path d="M200 215 L240 225 M200 240 L242 250 M200 265 L246 275" stroke="${s}" stroke-width="3"/>`,
};

/* 상품 이미지: 실제 사진 우선, 로드 실패 시 SVG 일러스트로 대체 */
function productImage(p, width = 600) {
  if (!p.image) return productSVG(p);
  const src = p.image.startsWith("https://images.unsplash.com/")
    ? `${p.image}?auto=format&fit=crop&w=${width}&h=${Math.round(width * 1.2)}&q=80`
    : p.image;
  return `<img src="${esc(src)}" alt="${esc(p.name)}" loading="lazy" onerror="this.outerHTML=productSVG(getProduct('${esc(p.id)}')||{})">`;
}

function productSVG(p) {
  const color = /^#[0-9a-f]{6}$/i.test(p.color || "") ? p.color : "#dddddd";
  const stroke = isLight(color) ? "#9a9a9a" : "rgba(0,0,0,.45)";
  const shape = SHAPES[p.shape] || SHAPES.tee;
  return `<svg viewBox="0 0 500 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(p.name)}">
    <rect width="500" height="600" fill="#f1f1f1"/>
    ${shape(color, stroke)}
  </svg>`;
}
