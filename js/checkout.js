/* 주문서 + 토스페이먼츠 결제위젯 v2
 * 문서: https://docs.tosspayments.com/guides/v2/payment-widget/integration
 *
 * 흐름: 화면 금액은 미리보기 → "결제하기" → 서버(create-order)가 DB 가격으로 주문을 만들고 금액을 정함
 *       → 서버 금액으로 setAmount → requestPayment → success.html에서 서버(confirm-payment)가 결제 확정
 *
 * clientKey: 토스페이먼츠 문서용 결제위젯 테스트 키입니다.
 * 운영 시 개발자센터(https://developers.tosspayments.com)의 "결제위젯 연동 키" 클라이언트 키로 교체하고,
 * 짝이 되는 시크릿 키를 Edge Function secret(TOSS_SECRET_KEY)에 넣으세요. 시크릿 키는 절대 프론트엔드에 넣지 않습니다.
 */
const TOSS_CLIENT_KEY = "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm";

document.addEventListener("DOMContentLoaded", async () => {
  await App.ready;
  if (showLoadError()) return;

  // 2-5 결제는 로그인해야 합니다. 로그인 후 이 주문서로 돌아옵니다.
  if (!Auth.user) {
    location.replace(loginUrl("checkout.html"));
    return;
  }

  const $ = (id) => document.getElementById(id);
  const checkout = readJSON(CHECKOUT_KEY, null, "sessionStorage");
  const items = checkout ? expandItems(checkout.items) : [];

  if (!items.length) {
    alert("주문할 상품이 없습니다.");
    location.replace("cart.html");
    return;
  }

  /* ---------- 3-1 주문자 정보 자동 채움 ---------- */
  $("buyerName").value = Auth.profile?.name || "";
  $("buyerPhone").value = Auth.profile?.phone || "";
  $("buyerEmail").value = Auth.user.email || "";
  $("buyerAddr").value = Auth.profile?.address || "";

  /* ---------- 주문 상품 / 금액 (미리보기) ---------- */
  function renderSummary(o) {
    $("sumOrigin").textContent = won(o.origin);
    $("sumDiscount").textContent = o.discount ? "-" + won(o.discount) : "0원";
    $("sumShip").textContent = won(o.shipping);
    $("sumTotal").textContent = won(o.total);
    $("payBtn").textContent = `${won(o.total)} 결제하기`;
  }
  const preview = calcOrder(items);
  $("itemCount").textContent = `${items.length}건`;
  $("orderItems").innerHTML = items.map((i) => `
    <div class="cart-item" style="grid-template-columns:88px 1fr auto">
      <div class="cart-item__thumb">${productImage(i.product)}</div>
      <div>
        <p class="card__brand">${esc(i.product.brand)}</p>
        <p class="card__name" style="min-height:0">${esc(i.product.name)}</p>
        <p class="cart-item__opt">사이즈 ${esc(i.size)} / ${i.qty}개 ${i.stock < i.qty ? `<b class="warn">재고 부족</b>` : ""}</p>
      </div>
      <div class="cart-item__right"><span class="cart-item__price">${won(i.total)}</span></div>
    </div>`).join("");
  renderSummary(preview);

  /* ---------- 결제위젯 초기화 ---------- */
  if (typeof TossPayments !== "function") {
    $("payLoading").textContent = "결제 SDK를 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.";
    return;
  }

  const tossPayments = TossPayments(TOSS_CLIENT_KEY);
  // 3-5 회원 고유번호(auth.users.id)를 customerKey로 씁니다.
  const widgets = tossPayments.widgets({ customerKey: Auth.user.id });

  let agreed = true;
  try {
    // 결제 금액은 렌더링 전에 반드시 먼저 설정해야 합니다. (미리보기 금액, 결제 직전 서버 금액으로 다시 설정)
    await widgets.setAmount({ currency: "KRW", value: preview.total });

    const [, agreementWidget] = await Promise.all([
      widgets.renderPaymentMethods({ selector: "#payment-method", variantKey: "DEFAULT" }),
      widgets.renderAgreement({ selector: "#agreement", variantKey: "AGREEMENT" }),
    ]);

    agreementWidget.on("agreementStatusChange", (status) => {
      agreed = status.agreedRequiredTerms;
      $("payBtn").disabled = !agreed;
      $("payHint").textContent = agreed ? "" : "필수 약관에 동의해 주세요.";
    });

    $("payLoading").remove();
    $("payBtn").disabled = false;
  } catch (err) {
    console.error(err);
    $("payLoading").textContent = `결제위젯을 불러오지 못했습니다. (${err.message || err})`;
    return;
  }

  /* ---------- 결제 요청 ---------- */
  $("payBtn").addEventListener("click", async () => {
    const buyer = {
      name: $("buyerName").value.trim(),
      phone: $("buyerPhone").value.replace(/\D/g, ""),
      email: $("buyerEmail").value.trim(),
      address: $("buyerAddr").value.trim(),
    };
    const invalid =
      (!buyer.name && "이름을 입력해 주세요.") ||
      (!/^01\d{8,9}$/.test(buyer.phone) && "휴대폰 번호를 정확히 입력해 주세요.") ||
      (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email) && "이메일을 정확히 입력해 주세요.") ||
      (!buyer.address && "배송지를 입력해 주세요.");
    if (invalid) {
      $("payHint").textContent = invalid;
      return;
    }
    if (!agreed) return;

    $("payHint").textContent = "";
    $("payBtn").disabled = true;

    // 3-2 서버가 DB 가격으로 금액을 다시 계산하고, 재고를 확인한 뒤 "결제 대기" 주문을 만듭니다.
    let order;
    try {
      order = await callFn("create-order", { items: checkout.items, source: checkout.source, receiver: buyer });
    } catch (err) {
      $("payHint").textContent = err.message;
      $("payBtn").disabled = false;
      return;
    }

    // 서버가 정한 금액으로만 결제창을 엽니다.
    if (order.amount !== preview.total) {
      renderSummary({ origin: order.origin, discount: order.discount, shipping: order.shipping, total: order.amount });
      toast("상품 정보가 바뀌어 금액을 다시 계산했어요");
    }

    try {
      await widgets.setAmount({ currency: "KRW", value: order.amount });
      await widgets.requestPayment({
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: new URL("success.html", location.href).href,
        failUrl: new URL("fail.html", location.href).href,
        customerName: buyer.name,
        customerEmail: buyer.email,
        customerMobilePhone: buyer.phone,
      });
    } catch (err) {
      // 3-4 손님이 결제창을 닫았거나 요청이 실패하면 주문을 "결제 실패"로 기록합니다.
      const code = err.code || "REQUEST_FAILED";
      const message = code === "USER_CANCEL" ? "고객이 결제를 취소했습니다." : err.message || "결제 요청 중 오류가 발생했습니다.";
      sb.rpc("mark_order_failed", { p_order: order.orderId, p_code: code, p_message: message }).then(({ error }) => error && console.error(error));
      if (code === "USER_CANCEL") toast("결제를 취소했어요");
      else $("payHint").textContent = message;
      $("payBtn").disabled = false;
    }
  });
});
