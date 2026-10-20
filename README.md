# NINE STORE — 토스페이먼츠 + Supabase 쇼핑몰

HTML/CSS/JS로 만든 쇼핑몰 데모입니다. 상품·회원·장바구니·주문은 Supabase에 저장하고, 결제는 토스페이먼츠 결제위젯 v2(테스트 키)로 진행합니다. 결제 금액 계산과 결제 승인·취소는 Supabase Edge Function(서버)이 처리합니다.

## 페이지
| 파일 | 내용 |
| --- | --- |
| `clothes.html` / `shoes.html` / `pants.html` / `list.html?cat=...` | 카테고리 목록 (세부 분류 필터, 정렬, 품절 표시) |
| `search.html?q=...` | 검색 결과 (브랜드·상품명·세부 분류) |
| `product.html?id=...` | 상품 상세 (사이즈별 재고, 장바구니, 바로 구매, 후기) |
| `cart.html` | 장바구니 (로그인하면 계정에 저장) |
| `checkout.html` | 주문서 + 결제위젯 (로그인 필요, 회원 정보 자동 채움) |
| `success.html` / `fail.html` | 결제 확정 / 실패 기록 |
| `login.html` / `signup.html` / `reset.html` | 로그인, 회원가입, 비밀번호 재설정 |
| `mypage.html` / `order.html?id=...` | 주문 내역·좋아요·내 정보, 주문 상세·취소 |
| `admin.html` | 관리자: 상품·재고·사진, 주문 상태·취소, 카테고리 |

## 실행
결제창은 `file://`에서 동작하지 않으므로 로컬 서버로 엽니다.

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```

→ http://localhost:8080

## 서버(Supabase)
- DB 스키마와 데이터: `supabase/migrations/`
- Edge Function: `supabase/functions/` (`signup`, `create-order`, `confirm-payment`, `cancel-payment`, `toss-webhook`)
- 토스 시크릿 키는 Edge Function secret `TOSS_SECRET_KEY`에 넣습니다. 설정하지 않으면 문서 공개 테스트 키를 씁니다.
- 관리자 지정: Supabase SQL Editor에서 `update profiles set role = 'admin' where id = (select id from auth.users where email = '이메일');`

## 참고
- 클라이언트 키는 `js/checkout.js`의 `TOSS_CLIENT_KEY` (문서용 테스트 키)입니다.
- 상품 사진: [Unsplash](https://unsplash.com) (Unsplash License)
