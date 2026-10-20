# NINE STORE — 토스페이먼츠 연동 쇼핑몰 퍼블리싱

HTML/CSS/JS로 만든 쇼핑몰 데모입니다. 토스페이먼츠 결제위젯 v2(테스트 키)로 결제까지 진행됩니다.

## 페이지
| 파일 | 내용 |
| --- | --- |
| `clothes.html` / `shoes.html` / `pants.html` | 상의 · 신발 · 바지 랭킹 목록 |
| `product.html?id=...` | 상품 상세 (사이즈/수량, 장바구니, 바로 구매) |
| `cart.html` | 장바구니 |
| `checkout.html` | 주문서 + 토스페이먼츠 결제위젯 |
| `success.html` / `fail.html` | 결제 결과 |

## 실행
결제창은 `file://`에서 동작하지 않으므로 로컬 서버로 엽니다.

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```

→ http://localhost:8080

## 참고
- 클라이언트 키는 `js/checkout.js`의 `TOSS_CLIENT_KEY` (문서용 테스트 키)입니다.
- 결제 승인(`POST /v1/payments/confirm`)은 시크릿 키가 필요하므로 서버에서 구현해야 합니다.
- 상품 사진: [Unsplash](https://unsplash.com) (Unsplash License)
