/* 상품 데이터 + 상품 이미지
 * 사진은 PHOTOS(Unsplash)에서 가져오고, 사진이 없거나 로드에 실패하면 SVG 일러스트로 대체합니다.
 */
const CATEGORIES = {
  clothes: { name: "상의", title: "상의", desc: "티셔츠 · 후드 · 맨투맨 · 셔츠", page: "clothes.html" },
  shoes: { name: "신발", title: "신발", desc: "스니커즈 · 러닝화 · 하이탑", page: "shoes.html" },
  pants: { name: "바지", title: "바지", desc: "데님 · 슬랙스 · 카고 · 숏팬츠", page: "pants.html" },
};

const PRODUCTS = [
  // ---------- 상의 ----------
  { id: "c01", category: "clothes", sub: "티셔츠", shape: "tee", color: "#f4f4f2", brand: "STANDARD LAB", name: "에센셜 오버핏 반팔 티셔츠 화이트", price: 39000, discount: 30, rating: 4.9, reviews: 12840, sizes: ["S", "M", "L", "XL"], tags: ["무료배송", "단독"] },
  { id: "c02", category: "clothes", sub: "후드", shape: "hoodie", color: "#2b2b2b", brand: "LOW TIDE", name: "헤비웨이트 스웻 후드 집업 블랙", price: 89000, discount: 25, rating: 4.8, reviews: 6421, sizes: ["M", "L", "XL"], tags: ["무료배송"] },
  { id: "c03", category: "clothes", sub: "티셔츠", shape: "tee", color: "#1f2a44", brand: "NORTHBOUND", name: "코튼 로고 그래픽 반팔 티셔츠 네이비", price: 35000, discount: 20, rating: 4.7, reviews: 3290, sizes: ["S", "M", "L", "XL"], tags: [] },
  { id: "c04", category: "clothes", sub: "맨투맨", shape: "hoodie", color: "#9aa58c", brand: "OAKSHED", name: "피그먼트 다잉 후디 세이지", price: 72000, discount: 35, rating: 4.8, reviews: 2104, sizes: ["S", "M", "L"], tags: ["무료배송", "한정"] },
  { id: "c05", category: "clothes", sub: "티셔츠", shape: "tee", color: "#c9b79c", brand: "GRAYMOOD", name: "워셔블 린넨 블렌드 티셔츠 베이지", price: 42000, discount: 10, rating: 4.6, reviews: 980, sizes: ["M", "L", "XL"], tags: [] },
  { id: "c06", category: "clothes", sub: "후드", shape: "hoodie", color: "#8e8e8e", brand: "UNIFORM.", name: "베이직 기모 후드 티셔츠 멜란지 그레이", price: 59000, discount: 40, rating: 4.9, reviews: 15302, sizes: ["S", "M", "L", "XL", "XXL"], tags: ["무료배송", "단독"] },
  { id: "c07", category: "clothes", sub: "티셔츠", shape: "tee", color: "#7a1f2b", brand: "HALFTONE", name: "빈티지 워싱 레터링 티셔츠 버건디", price: 38000, discount: 15, rating: 4.5, reviews: 712, sizes: ["S", "M", "L"], tags: [] },
  { id: "c08", category: "clothes", sub: "후드", shape: "hoodie", color: "#3d4a3a", brand: "STILL LIFE", name: "오버사이즈 아치 로고 후드 다크 올리브", price: 79000, discount: 20, rating: 4.7, reviews: 1843, sizes: ["M", "L", "XL"], tags: ["무료배송"] },
  { id: "c09", category: "clothes", sub: "티셔츠", shape: "tee", color: "#9cc0e0", brand: "PALE BLUE", name: "썸머 쿨링 반팔 티셔츠 스카이 블루", price: 29000, discount: 0, rating: 4.4, reviews: 431, sizes: ["S", "M", "L", "XL"], tags: [] },
  { id: "c10", category: "clothes", sub: "후드", shape: "hoodie", color: "#e9e2d0", brand: "RUNWAY 9", name: "투웨이 크롭 후드 집업 아이보리", price: 69000, discount: 30, rating: 4.6, reviews: 1022, sizes: ["S", "M"], tags: ["한정"] },

  // ---------- 신발 ----------
  { id: "s01", category: "shoes", sub: "스니커즈", shape: "sneaker", color: "#f6f6f6", brand: "RUNWAY 9", name: "클래식 레더 로우 스니커즈 화이트", price: 99000, discount: 20, rating: 4.9, reviews: 22310, sizes: ["230", "240", "250", "260", "270", "280"], tags: ["무료배송", "단독"] },
  { id: "s02", category: "shoes", sub: "러닝화", shape: "runner", color: "#2d2d2d", brand: "NORTHBOUND", name: "에어 쿠션 데일리 러닝화 블랙", price: 129000, discount: 15, rating: 4.8, reviews: 8705, sizes: ["240", "250", "260", "270", "280"], tags: ["무료배송"] },
  { id: "s03", category: "shoes", sub: "하이탑", shape: "hightop", color: "#b23a2e", brand: "HALFTONE", name: "캔버스 하이탑 스니커즈 레드", price: 69000, discount: 30, rating: 4.7, reviews: 3412, sizes: ["230", "240", "250", "260", "270"], tags: [] },
  { id: "s04", category: "shoes", sub: "스니커즈", shape: "sneaker", color: "#a89a84", brand: "OAKSHED", name: "스웨이드 테니스 스니커즈 토프", price: 119000, discount: 25, rating: 4.8, reviews: 1976, sizes: ["250", "260", "270", "280"], tags: ["무료배송", "한정"] },
  { id: "s05", category: "shoes", sub: "러닝화", shape: "runner", color: "#5c7fb8", brand: "PALE BLUE", name: "라이트 메쉬 러닝화 블루", price: 89000, discount: 10, rating: 4.5, reviews: 860, sizes: ["240", "250", "260", "270"], tags: [] },
  { id: "s06", category: "shoes", sub: "하이탑", shape: "hightop", color: "#1d1d1d", brand: "LOW TIDE", name: "레더 하이탑 워커 블랙", price: 159000, discount: 35, rating: 4.9, reviews: 4103, sizes: ["250", "260", "270", "280", "290"], tags: ["무료배송", "단독"] },
  { id: "s07", category: "shoes", sub: "스니커즈", shape: "sneaker", color: "#d8d2c4", brand: "GRAYMOOD", name: "빈티지 코트 스니커즈 크림", price: 79000, discount: 20, rating: 4.6, reviews: 1290, sizes: ["230", "240", "250", "260"], tags: [] },
  { id: "s08", category: "shoes", sub: "러닝화", shape: "runner", color: "#8d8d8d", brand: "UNIFORM.", name: "트레일 아웃도어 러너 그레이", price: 139000, discount: 0, rating: 4.7, reviews: 655, sizes: ["250", "260", "270", "280"], tags: ["무료배송"] },
  { id: "s09", category: "shoes", sub: "스니커즈", shape: "sneaker", color: "#3e5c45", brand: "STILL LIFE", name: "레트로 트레이너 포레스트 그린", price: 109000, discount: 30, rating: 4.8, reviews: 2380, sizes: ["240", "250", "260", "270", "280"], tags: ["한정"] },
  { id: "s10", category: "shoes", sub: "하이탑", shape: "hightop", color: "#efe8dc", brand: "STANDARD LAB", name: "캔버스 하이탑 오프화이트", price: 59000, discount: 15, rating: 4.6, reviews: 3011, sizes: ["230", "240", "250", "260", "270", "280"], tags: [] },

  // ---------- 바지 ----------
  { id: "p01", category: "pants", sub: "데님", shape: "pants", color: "#3c5a82", brand: "STANDARD LAB", name: "와이드 스트레이트 데님 팬츠 미드 블루", price: 59000, discount: 30, rating: 4.9, reviews: 18904, sizes: ["28", "30", "32", "34"], tags: ["무료배송", "단독"] },
  { id: "p02", category: "pants", sub: "슬랙스", shape: "pants", color: "#2a2a2a", brand: "UNIFORM.", name: "세미 와이드 히든 밴딩 슬랙스 블랙", price: 49000, discount: 25, rating: 4.8, reviews: 25611, sizes: ["S", "M", "L", "XL"], tags: ["무료배송"] },
  { id: "p03", category: "pants", sub: "카고", shape: "cargo", color: "#6b6a4a", brand: "NORTHBOUND", name: "나일론 파라슈트 카고 팬츠 올리브", price: 79000, discount: 20, rating: 4.7, reviews: 4208, sizes: ["S", "M", "L"], tags: [] },
  { id: "p04", category: "pants", sub: "숏팬츠", shape: "shorts", color: "#c7b495", brand: "GRAYMOOD", name: "코튼 치노 버뮤다 숏팬츠 베이지", price: 39000, discount: 15, rating: 4.6, reviews: 1730, sizes: ["S", "M", "L", "XL"], tags: [] },
  { id: "p05", category: "pants", sub: "슬랙스", shape: "pants", color: "#8a8a8a", brand: "OAKSHED", name: "울 블렌드 투턱 슬랙스 그레이", price: 89000, discount: 35, rating: 4.8, reviews: 2950, sizes: ["28", "30", "32", "34", "36"], tags: ["무료배송", "한정"] },
  { id: "p06", category: "pants", sub: "데님", shape: "pants", color: "#1c2433", brand: "LOW TIDE", name: "생지 셀비지 데님 팬츠 인디고", price: 129000, discount: 10, rating: 4.9, reviews: 1104, sizes: ["29", "30", "31", "32", "33"], tags: ["무료배송"] },
  { id: "p07", category: "pants", sub: "카고", shape: "cargo", color: "#d9d4c7", brand: "STILL LIFE", name: "와이드 카펜터 카고 팬츠 아이보리", price: 69000, discount: 30, rating: 4.7, reviews: 2287, sizes: ["S", "M", "L", "XL"], tags: [] },
  { id: "p08", category: "pants", sub: "숏팬츠", shape: "shorts", color: "#2f3a52", brand: "PALE BLUE", name: "스윔 겸용 나일론 숏팬츠 네이비", price: 35000, discount: 0, rating: 4.5, reviews: 388, sizes: ["M", "L", "XL"], tags: [] },
  { id: "p09", category: "pants", sub: "데님", shape: "pants", color: "#9ab3cf", brand: "HALFTONE", name: "라이트 워싱 루즈핏 데님 스카이", price: 65000, discount: 20, rating: 4.6, reviews: 1543, sizes: ["28", "30", "32", "34"], tags: ["단독"] },
  { id: "p10", category: "pants", sub: "슬랙스", shape: "pants", color: "#5b4636", brand: "RUNWAY 9", name: "코듀로이 와이드 팬츠 브라운", price: 55000, discount: 25, rating: 4.7, reviews: 977, sizes: ["S", "M", "L"], tags: ["무료배송"] },
];

/* 상품 사진 (Unsplash, Unsplash License — 무료 상업적 사용 가능) */
const PHOTOS = {
  c01: "photo-1581655353564-df123a1eb820",
  c02: "photo-1579572331145-5e53b299c64e",
  c03: "photo-1621951753163-ee63e7fc147e",
  c04: "photo-1565978771542-0db9ab9ad3de",
  c05: "photo-1562157873-818bc0726f68",
  c06: "photo-1556821840-3a63f95609a7",
  c07: "photo-1575737132307-1fad104f1f67",
  c08: "photo-1454793781512-0fafb38dce83",
  c09: "photo-1625728273603-0404614abb7e",
  c10: "photo-1620799140188-3b2a02fd9a77",
  s01: "photo-1544441892-794166f1e3be",
  s02: "photo-1606107557195-0e29a4b5b4aa",
  s03: "photo-1561909848-977d0617f275",
  s04: "photo-1591370409347-2fd43b7842de",
  s05: "photo-1571008887538-b36bb32f4571",
  s06: "photo-1605732440685-d0654d81aa30",
  s07: "photo-1608229751021-ed4bd8677753",
  s08: "photo-1600185365926-3a2ce3cdb9eb",
  s09: "photo-1564518042543-a208a659329d",
  s10: "photo-1512374382149-233c42b6a83b",
  p01: "photo-1602293589930-45aad59ba3ab",
  p02: "photo-1718252540617-6ecda2b56b57",
  p03: "photo-1511794322962-129ddbd0af38",
  p04: "photo-1621496503717-095a410e1566",
  p05: "photo-1473966968600-fa801b869a1a",
  p06: "photo-1624378439575-d8705ad7ae80",
  p07: "photo-1548883354-7622d03aca27",
  p08: "photo-1589431665783-99ede05457c6",
  p09: "photo-1542272604-787c3835535d",
  p10: "photo-1788885939600-dc9d21535986",
};

function getProduct(id) {
  return PRODUCTS.find((p) => p.id === id);
}

function salePrice(p) {
  return Math.round((p.price * (100 - p.discount)) / 100 / 100) * 100;
}

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
  const photo = PHOTOS[p.id];
  if (!photo) return productSVG(p);
  const src = `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=${width}&h=${Math.round(width * 1.2)}&q=80`;
  const alt = p.name.replace(/"/g, "&quot;");
  return `<img src="${src}" alt="${alt}" loading="lazy" onerror="this.outerHTML=productSVG(getProduct('${p.id}'))">`;
}

function productSVG(p) {
  const stroke = isLight(p.color) ? "#9a9a9a" : "rgba(0,0,0,.45)";
  return `<svg viewBox="0 0 500 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${p.name}">
    <rect width="500" height="600" fill="#f1f1f1"/>
    ${SHAPES[p.shape](p.color, stroke)}
  </svg>`;
}
