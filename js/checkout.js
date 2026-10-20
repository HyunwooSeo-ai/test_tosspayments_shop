/* 주문서 + 토스페이먼츠 결제위젯 v2
 * 문서: https://docs.tosspayments.com/guides/v2/payment-widget/integration
 *
 * clientKey: 토스페이먼츠 문서용 결제위젯 테스트 키입니다.
 * 운영 시 개발자센터(https://developers.tosspayments.com)의 "결제위젯 연동 키" 클라이언트 키로 교체하세요.
 * (시크릿 키는 절대 프론트엔드에 넣지 마세요. 결제 승인 API는 서버에서 호출해야 합니다.)
 */
const TOSS_CLIENT_KEY = "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm";

document.addEventListener("DOMContentLoaded", async () => {
  const $ = (id) => document.getElementById(id);
  const checkout = readJSON(CHECKOUT_KEY, null, "sessionStorage");
  const items = checkout ? expandItems(checkout.items) : [];

  if (!items.length) {
    alert("주문할 상품이 없습니다.");
    location.replace("cart.html");
    return;
  }

  /* ---------- 주문 상품 / 금액 ---------- */
  const order = calcOrder(items);
  $("itemCount").textContent = `${items.length}건`;
  $("orderItems").innerHTML = items.map((i) => `
    <div class="cart-item" style="grid-template-columns:88px 1fr auto">
      <div class="cart-item__thumb">${productImage(i.product)}</div>
      <div>
        <p class="card__brand">${i.product.brand}</p>
        <p class="card__name" style="min-height:0">${i.product.name}</p>
        <p class="cart-item__opt">사이즈 ${i.size} / ${i.qty}개</p>
      </div>
      <div class="cart-item__right"><span class="cart-item__price">${won(i.total)}</span></div>
    </div>`).join("");
  $("sumOrigin").textContent = won(order.origin);
  $("sumDiscount").textContent = order.discount ? "-" + won(order.discount) : "0원";
  $("sumShip").textContent = won(order.shipping);
  $("sumTotal").textContent = won(order.total);
  $("payBtn").textContent = `${won(order.total)} 결제하기`;

  /* ---------- 결제위젯 초기화 ---------- */
  if (typeof TossPayments !== "function") {
    $("payLoading").textContent = "결제 SDK를 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.";
    return;
  }

  const tossPayments = TossPayments(TOSS_CLIENT_KEY);
  // 회원 결제라면 회원 ID 기반의 고유값을 customerKey로 사용하세요.
  const widgets = tossPayments.widgets({ customerKey: TossPayments.ANONYMOUS });

  let agreed = true;
  try {
    // 결제 금액은 렌더링 전에 반드시 먼저 설정해야 합니다.
    await widgets.setAmount({ currency: "KRW", value: order.total });

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
      addr: $("buyerAddr").value.trim(),
    };
    const invalid =
      (!buyer.name && "이름을 입력해 주세요.") ||
      (!/^01\d{8,9}$/.test(buyer.phone) && "휴대폰 번호를 정확히 입력해 주세요.") ||
      (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email) && "이메일을 정확히 입력해 주세요.") ||
      (!buyer.addr && "배송지를 입력해 주세요.");
    if (invalid) {
      $("payHint").textContent = invalid;
      return;
    }
    if (!agreed) return;

    // orderId: 영문 대소문자, 숫자, -, _, = 로 6~64자
    const orderId = "ORD-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    const first = items[0].product.name;
    const orderName = (items.length > 1 ? `${first} 외 ${items.length - 1}건` : first).slice(0, 100);

    // 성공 페이지에서 결제 금액 위변조를 확인하기 위해 주문 정보를 저장합니다.
    // (실서비스에서는 이 값을 서버 DB에 저장하고 서버에서 비교해야 합니다.)
    writeJSON(ORDER_KEY, { orderId, orderName, amount: order.total, source: checkout.source, items: checkout.items, buyer }, "sessionStorage");

    $("payHint").textContent = "";
    try {
      await widgets.requestPayment({
        orderId,
        orderName,
        successUrl: new URL("success.html", location.href).href,
        failUrl: new URL("fail.html", location.href).href,
        customerName: buyer.name,
        customerEmail: buyer.email,
        customerMobilePhone: buyer.phone,
      });
    } catch (err) {
      // 사용자가 결제창을 닫은 경우 등
      if (err.code === "USER_CANCEL") toast("결제를 취소했어요");
      else $("payHint").textContent = err.message || "결제 요청 중 오류가 발생했습니다.";
    }
  });
});
