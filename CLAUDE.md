# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 개요

토스페이먼츠 결제위젯 v2를 연동한 무신사 스타일 쇼핑몰 데모 "NINE STORE"입니다. 빌드 도구, 패키지 매니저, 프레임워크, 테스트 없이 순수 HTML/CSS/JS로만 만든 정적 퍼블리싱 결과물입니다. UI 문구와 주석은 한국어로 씁니다.

## 실행

토스 결제창은 `file://`에서 동작하지 않아 반드시 HTTP 서버로 열어야 합니다. 이 PC에는 Node.js와 Python이 없어서 PowerShell `HttpListener`로 만든 정적 서버를 씁니다.

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```

- 주소는 http://localhost:8080 입니다. 포트는 `-Port`로 바꿀 수 있습니다.
- Browser pane에서는 `.claude/launch.json`의 `shop` 설정으로 `preview_start`를 실행하면 됩니다.
- 빌드, 린트, 테스트 명령은 없습니다. 브라우저에서 직접 동작을 확인합니다.

## 구조

### 스크립트 로딩
ES 모듈 없이 전역 스코프를 공유합니다. 모든 페이지는 아래 순서로 스크립트를 불러옵니다.

1. `js/products.js`: 데이터와 이미지
2. `js/common.js`: 공통 로직
3. 페이지 전용 스크립트

순서가 바뀌면 `PRODUCTS`, `Cart` 같은 전역이 없어서 깨집니다.

- `products.js`
  - `CATEGORIES`: 카테고리 정의
  - `PRODUCTS`: 상품 데이터
  - `PHOTOS`: 상품 ID별 Unsplash 사진
  - `productImage()`: 상품 이미지 HTML 생성. 사진 로드에 실패하면 인라인 `onerror`에서 전역 `productSVG(getProduct(id))`로 SVG 일러스트를 대신 넣습니다. 그래서 두 함수는 전역이어야 합니다.
- `common.js`
  - 헤더와 푸터는 JS가 `#header`, `#footer`에 그립니다. 공통 메뉴를 바꿀 때는 HTML이 아니라 `renderHeader()`를 수정합니다.
  - 그 밖에 장바구니(`Cart`), 금액 계산(`calcOrder`), 좋아요, 토스트, 저장소 헬퍼를 둡니다.
- `<body data-category="...">`: 헤더의 활성 탭과 `list.js`가 보여 줄 카테고리를 정합니다. 상세 페이지는 상품 정보를 보고 런타임에 이 값을 설정합니다.
- `clothes.html`, `shoes.html`, `pants.html`은 `data-category`와 배너 문구만 다르고 나머지는 같습니다. 카테고리를 추가하려면 다음 세 가지를 맞춰야 합니다.
  - `CATEGORIES`에 항목 추가
  - 카테고리 HTML 파일 복제
  - 상품마다 `PHOTOS` 사진 등록. 사진이 없으면 SVG로 대체되므로, 이때는 `SHAPES`에 해당 `shape`도 있어야 합니다.

### 주문·결제 데이터 흐름
페이지 사이의 상태는 브라우저 저장소로 넘깁니다. 키는 `common.js` 상단에 정의되어 있습니다.

| 키 | 저장소 | 쓰는 곳 → 읽는 곳 |
| --- | --- | --- |
| `nine_cart` | localStorage | 상세/장바구니 ↔ `success.html`(결제한 상품 제거) |
| `nine_likes` | localStorage | 목록 페이지 |
| `nine_checkout` | sessionStorage | 상세(`source: "direct"`) 또는 장바구니(`source: "cart"`) → `checkout.js` |
| `nine_pending_order` | sessionStorage | `checkout.js`(결제 요청 직전, `orderId`·`amount` 저장) → `success.html`(금액 위변조 확인) |

장바구니에서 주문했을 때(`source: "cart"`)만 `success.html`이 결제한 상품을 장바구니에서 지웁니다.

### 금액 규칙
- `salePrice()`: 할인가를 100원 단위로 반올림합니다.
- `calcOrder()`: 상품 합계가 5만 원 이상이거나 `"무료배송"` 태그가 붙은 상품이 하나라도 있으면 배송비 0원, 그렇지 않으면 3,000원입니다.
- 장바구니, 주문서, 결제위젯 `setAmount`가 모두 `calcOrder()`의 `total`을 씁니다. 금액 규칙은 이 함수에서만 바꿉니다.

### 토스페이먼츠 연동 (`checkout.html`, `js/checkout.js`)
- SDK: `https://js.tosspayments.com/v2/standard`
- 키: `TOSS_CLIENT_KEY`는 문서 공개용 결제위젯 테스트 키(`test_gck_docs_...`)입니다. 시크릿 키는 프론트엔드에 넣지 않습니다.
- 위젯 호출 순서:
  1. `widgets.setAmount()`
  2. `renderPaymentMethods()`와 `renderAgreement()`
  3. 약관의 `agreementStatusChange` 이벤트로 결제 버튼을 활성화하거나 막음
  4. `requestPayment()`
- `successUrl`, `failUrl`은 `new URL("success.html", location.href)`로 현재 경로를 기준으로 만듭니다.
- 결제 승인 API(`POST /v1/payments/confirm`)는 구현하지 않았습니다. 승인에는 서버와 시크릿 키가 필요하고, 승인하지 않으면 결제가 10분 뒤 만료됩니다. `success.html`에 서버 연동 예시가 주석으로 들어 있습니다.
- 샌드박스 결제창에서는 퀵계좌이체 테스트 비밀번호 `000000`으로 끝까지 결제해 볼 수 있습니다.

## 환경 메모

- `.mcp.json`에 토스페이먼츠 MCP 서버(`@tosspayments/integration-guide-mcp`)를 등록해 두었습니다. Windows라서 `cmd /c npx ...`로 실행하는데, Node.js가 설치되어 있지 않아 지금은 연결되지 않습니다.
- Git은 `C:\Program Files\Git\cmd\git.exe`에 설치되어 있습니다. 원격 저장소는 `https://github.com/HyunwooSeo-ai/test_tosspayments_shop.git`의 `main` 브랜치입니다.
- push할 때 GitHub 브라우저 인증이 필요할 수 있습니다. 비대화형 셸에서는 실패하므로 Terminal 패널에서 실행합니다.
