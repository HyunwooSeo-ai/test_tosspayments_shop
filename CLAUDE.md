# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 개요

토스페이먼츠 결제위젯 v2를 연동한 무신사 스타일 쇼핑몰 데모 "NINE STORE"입니다. 빌드 도구, 패키지 매니저, 프레임워크, 테스트 없이 순수 HTML/CSS/JS로만 만든 정적 퍼블리싱 결과물입니다. UI 문구와 주석은 한국어로 씁니다.

상품·회원·주문은 Supabase(DB, 로그인, Edge Function)에 저장합니다. 요구사항, 단계 순서(1~7단계), 확정된 결정(로그인해야 구매, 이메일 로그인만, 관리자 화면 포함)은 `PRD.md`를 따릅니다.

## 실행

토스 결제창은 `file://`에서 동작하지 않아 반드시 HTTP 서버로 열어야 합니다. 이 PC에는 Node.js와 Python이 없어서 PowerShell `HttpListener`로 만든 정적 서버를 씁니다.

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```

- 주소는 http://localhost:8080 입니다. 포트는 `-Port`로 바꿀 수 있습니다.
- Browser pane에서는 `.claude/launch.json`의 `shop` 설정으로 `preview_start`를 실행하면 됩니다.
- 빌드, 린트, 테스트 명령은 없습니다. 브라우저에서 직접 동작을 확인합니다.
- 로컬 테스트 계정은 git에 올리지 않는 `test-accounts.local.md`에 있습니다(일반 회원 1, 관리자 1).

## 구조

### Supabase
- 프로젝트: `nine-store` (`dyfieegfgskszpyldhzs`, 서울 리전). 화면에는 URL과 publishable 키만 `js/supabase.js`에 둡니다.
- `supabase/migrations/`: 적용한 마이그레이션 원본입니다. 스키마를 바꾸면 여기에 파일을 추가하고 같은 내용을 `apply_migration`으로 적용합니다.
  - `0001_schema.sql`: 표 10개, RLS, 가입 시 `profiles` 자동 생성, 리뷰 별점 집계 트리거, `product-images` 저장소 버킷
  - `0002_order_functions.sql`: 주문·결제 SQL 함수, 5분마다 30분 넘은 결제 대기 주문을 만료하는 pg_cron 작업
  - `0003_seed.sql`: 예전 `products.js`의 상품 30개와 카테고리 7개, 사이즈별 재고
- `supabase/functions/`: Edge Function 원본입니다. 모두 `verify_jwt: false`로 배포하고 함수 안에서 `auth.getUser(token)`으로 직접 인증합니다.
  - `signup`: 이메일 인증 없이 계정을 만듭니다(가입 직후 자동 로그인용).
  - `create-order`: DB 가격으로 금액을 다시 계산하고 재고를 확인한 뒤 PENDING 주문을 만듭니다.
  - `confirm-payment`: 금액 대조 → 재고 차감 → 토스 승인 → PAID 전환. 이미 확정된 주문이면 그대로 성공을 돌려줍니다.
  - `cancel-payment`: 본인(PAID·입금 대기) 또는 관리자만 취소. 토스 취소 후 재고를 되돌립니다.
  - `toss-webhook`: 본문의 orderId로 토스 결제 조회 API를 다시 불러 실제 상태를 반영합니다.
- 토스 시크릿 키는 Edge Function secret `TOSS_SECRET_KEY`에서 읽고, 없으면 문서 공개 테스트 키(`test_gsk_docs_...`)를 씁니다.
- 결제·재고 상태를 바꾸는 SQL 함수(`create_order`, `begin_confirm`, `finish_payment`, `close_order`, `apply_cancel`)는 service role만 실행할 수 있습니다. 화면에서 부르는 RPC는 `cart_add`, `mark_order_failed`, `has_purchased`, `admin_set_order_status`(함수 안에서 관리자 확인)뿐입니다.
- 관리자는 `profiles.role = 'admin'`으로만 정합니다. 회원은 `profiles`의 `name`, `phone`, `address` 컬럼만 수정할 수 있습니다. 관리자 지정은 SQL로 합니다.

### 주문 상태
`PENDING`(결제 대기) → `CONFIRMING`(승인 중, 재고 이미 차감) → `PAID` / `WAITING_DEPOSIT`(가상계좌 입금 대기) → `PREPARING` → `SHIPPING` → `DELIVERED`. 실패는 `FAILED`, 방치는 `EXPIRED`, 취소는 `CANCELED`입니다. 재고는 `begin_confirm`에서 줄이고, 취소·실패하면 `restore_stock`으로 되돌립니다. `CONFIRMING`이 1분 넘게 남아 있으면 다시 확정을 시도할 수 있습니다.

### 스크립트 로딩
ES 모듈 없이 전역 스코프를 공유합니다. 모든 페이지는 아래 순서로 스크립트를 불러옵니다.

1. supabase-js CDN (`@supabase/supabase-js@2.45.4` UMD)
2. `js/supabase.js`: 클라이언트 `sb`, Edge Function 호출 `callFn()`
3. `js/products.js`: 카탈로그 로딩과 이미지
4. `js/common.js`: 공통 로직
5. 페이지 전용 스크립트

순서가 바뀌면 `sb`, `PRODUCTS`, `Cart` 같은 전역이 없어서 깨집니다.

- `common.js`의 `App.ready`는 로그인 확인 → 카탈로그·장바구니·좋아요 불러오기가 끝나면 풀리는 Promise입니다. 페이지 스크립트는 `DOMContentLoaded`에서 `await App.ready` 뒤에 그리고, `showLoadError()`로 실패를 처리합니다.
- `products.js`
  - `loadCatalog()`: 노출 중인 카테고리·상품·재고를 DB에서 읽어 `CATEGORIES`, `PRODUCTS`를 채웁니다. 이후 `getProduct()`는 동기로 씁니다.
  - 상품 객체의 `stock`은 `{ 사이즈: 수량 }`, `sizes`는 정렬된 사이즈 목록입니다.
  - `productImage()`: 사진 로드에 실패하면 인라인 `onerror`에서 전역 `productSVG(getProduct(id))`로 SVG 일러스트를 대신 넣습니다. 그래서 두 함수는 전역이어야 합니다.
  - DB 값(상품명, 리뷰 등)은 HTML에 넣기 전에 항상 `esc()`를 거칩니다.
- `common.js`
  - `Auth`(로그인 상태, `profile`), `Cart`(로그인하면 `cart_items`, 아니면 localStorage), `Likes`(로그인 필요), `cardHTML()`, `requireLogin()`, `safeNext()`
  - 헤더와 푸터는 JS가 `#header`, `#footer`에 그립니다. 헤더 메뉴는 DB 카테고리로 만듭니다.
- 카테고리 페이지: `clothes.html`, `shoes.html`, `pants.html`은 `<body data-category>`로, 그 밖의 카테고리는 `list.html?cat=키`로 엽니다(`categoryPage()`). `is_sale` 카테고리는 30% 이상 할인 상품을 모아 보여 줍니다. 새 카테고리는 관리자 화면에서 추가하면 되고 HTML 파일은 필요 없습니다.
- `<body data-page="...">`: `search`, `login`, `signup`, `reset`, `success`, `fail` 등 페이지 종류를 스크립트에 알립니다.

### 페이지와 브라우저 저장소
| 키 | 저장소 | 용도 |
| --- | --- | --- |
| `nine_cart` | localStorage | 비로그인 장바구니. 로그인하면 `Cart.mergeLocal()`이 계정에 합치고 지웁니다. |
| `nine_checkout` | sessionStorage | 상세(`source: "direct"`) 또는 장바구니(`source: "cart"`) → `checkout.js`. 상품 id·사이즈·수량만 담고, 금액은 서버가 정합니다. |

- 로그인이 필요한 페이지는 `login.html?next=페이지`로 보내고, 로그인 후 `safeNext()`가 허용한 같은 사이트 html로만 돌아갑니다.
- `success.html`, `fail.html`은 `js/result.js` 하나를 씁니다. 장바구니 정리는 서버(`finish_payment`)가 합니다.

### 금액 규칙
- 기준은 서버입니다: SQL `sale_price()`(100원 단위 반올림)와 `create_order()`의 배송비(5만 원 이상 또는 `"무료배송"` 상품 포함 시 0원, 아니면 3,000원).
- 화면의 `salePrice()`, `calcOrder()`는 같은 규칙의 미리보기입니다. 규칙을 바꾸면 SQL과 JS를 함께 바꿉니다.
- 주문서는 결제 직전 `create-order`가 돌려준 `amount`로 `setAmount`를 다시 호출하고 그 금액으로만 결제창을 엽니다.

### 토스페이먼츠 연동 (`checkout.html`, `js/checkout.js`)
- SDK: `https://js.tosspayments.com/v2/standard`
- 키: `TOSS_CLIENT_KEY`는 문서 공개용 결제위젯 테스트 키(`test_gck_docs_...`)입니다. 시크릿 키는 프론트엔드에 넣지 않습니다.
- `customerKey`는 회원 UUID(`auth.users.id`)입니다.
- 위젯 호출 순서:
  1. `widgets.setAmount()` (미리보기 금액)
  2. `renderPaymentMethods()`와 `renderAgreement()`
  3. 약관의 `agreementStatusChange` 이벤트로 결제 버튼을 활성화하거나 막음
  4. 결제하기 → `create-order` → 서버 금액으로 `setAmount()` → `requestPayment()`
- `successUrl`, `failUrl`은 `new URL("success.html", location.href)`로 현재 경로를 기준으로 만듭니다.
- 샌드박스 결제창에서는 퀵계좌이체 테스트 비밀번호 `000000`으로 끝까지 결제해 볼 수 있습니다.

## 환경 메모

- `.mcp.json`에 토스페이먼츠 MCP 서버(`@tosspayments/integration-guide-mcp`)를 등록해 두었습니다. Windows라서 `cmd /c npx ...`로 실행하는데, Node.js가 설치되어 있지 않아 지금은 연결되지 않습니다.
- Supabase는 CLI 대신 Supabase MCP 도구로 다룹니다. 스키마 변경은 `apply_migration`, Edge Function 배포는 `deploy_edge_function`을 씁니다.
- Git은 `C:\Program Files\Git\cmd\git.exe`에 설치되어 있습니다. 원격 저장소는 `https://github.com/HyunwooSeo-ai/test_tosspayments_shop.git`의 `main` 브랜치입니다.
- push할 때 GitHub 브라우저 인증이 필요할 수 있습니다. 비대화형 셸에서는 실패하므로 Terminal 패널에서 실행합니다.
