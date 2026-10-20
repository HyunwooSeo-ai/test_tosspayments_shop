/* 결제 결과: success.html(3-3 서버 결제 확정) / fail.html(3-4 실패 기록) */
document.addEventListener("DOMContentLoaded", async () => {
  await App.ready;
  const q = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);
  const table = (rows) => {
    $("table").innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("");
  };

  if (document.body.dataset.page === "fail") {
    if (q.get("message")) $("desc").textContent = q.get("message");
    table([["에러 코드", q.get("code") || "-"], ["주문번호", q.get("orderId") || "-"]]);
    // 손님이 결제창을 닫았거나 결제가 실패한 주문을 "결제 실패"로 남깁니다. (본인 주문, 결제 대기 상태만 바뀜)
    if (Auth.user && q.get("orderId")) {
      const { error } = await sb.rpc("mark_order_failed", {
        p_order: q.get("orderId"),
        p_code: q.get("code") || "UNKNOWN",
        p_message: q.get("message") || "",
      });
      if (error) console.error(error);
    }
    return;
  }

  /* ---------- success ---------- */
  const fail = (msg, retry) => {
    $("icon").className = "result__icon result__icon--fail";
    $("icon").textContent = "!";
    $("title").textContent = "결제를 확정하지 못했습니다";
    $("desc").textContent = msg;
    $("retry").hidden = !retry;
  };

  const paymentKey = q.get("paymentKey");
  const orderId = q.get("orderId");
  const amount = Number(q.get("amount"));
  if (!paymentKey || !orderId) return fail("결제 정보가 없습니다.");
  if (!Auth.user) return fail("로그인이 풀렸습니다. 다시 로그인한 뒤 이 페이지를 새로고침해 주세요.");

  $("retry").addEventListener("click", () => location.reload());

  try {
    // 서버가 ① DB 주문 금액 = 결제 금액 확인 ② 토스 결제 승인 ③ 재고 차감·장바구니 정리를 합니다.
    // 새로고침해도 이미 확정된 주문은 다시 승인하지 않고 그대로 결과만 돌려줍니다. (6-3)
    const { order } = await callFn("confirm-payment", { paymentKey, orderId, amount });
    const waiting = order.status === "WAITING_DEPOSIT";
    $("icon").className = "result__icon";
    $("icon").textContent = "✓";
    $("title").textContent = waiting ? "주문이 접수되었습니다" : "결제가 완료되었습니다";
    $("desc").textContent = waiting ? "가상계좌로 입금하시면 결제가 완료됩니다." : "주문해 주셔서 감사합니다.";
    table([
      ["주문번호", order.id],
      ["주문명", order.order_name],
      ["결제 금액", won(order.total_amount)],
      ["결제 수단", order.payment_method || "-"],
      ["주문 상태", ORDER_STATUS[order.status] || order.status],
      ["배송지", `${order.receiver_name} / ${order.receiver_address}`],
    ]);
    $("orderLink").href = `order.html?id=${encodeURIComponent(order.id)}`;
    $("orderLink").hidden = false;
    removeKey(CHECKOUT_KEY, "sessionStorage");
    await Cart.load(); // 서버가 장바구니에서 결제한 상품을 지웠으므로 다시 불러옵니다.
  } catch (err) {
    fail(err.message, ["IN_PROGRESS", "TOSS_UNREACHABLE", "NETWORK"].includes(err.code));
  }
});
