/* 주문 상세(5-2)와 주문 취소(5-3) */
document.addEventListener("DOMContentLoaded", async () => {
  await App.ready;
  if (showLoadError()) return;
  if (!requireLogin()) return;

  const box = document.getElementById("orderDetail");
  const id = new URLSearchParams(location.search).get("id");
  const PURCHASED = ["PAID", "PREPARING", "SHIPPING", "DELIVERED"];

  async function render() {
    // RLS 덕분에 본인 주문(관리자는 전체)만 조회됩니다.
    const { data: o, error } = await sb.from("orders")
      .select("*, order_items(product_id, size, qty, unit_price, origin_price, brand, product_name)")
      .eq("id", id).maybeSingle();
    if (error || !o) {
      box.innerHTML = `<p class="empty">주문을 찾을 수 없습니다.</p>`;
      return;
    }

    const canCancel = ["PAID", "WAITING_DEPOSIT"].includes(o.status);
    const rows = (list) => list.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");

    box.innerHTML = `
      <div class="order-detail__head">
        <div>
          <p class="order-row__date">${fmtDate(o.created_at)} 주문</p>
          <p class="order-detail__id">${esc(o.id)}</p>
        </div>
        ${statusBadge(o.status)}
      </div>

      <h2 class="section-title">주문 상품</h2>
      ${o.order_items.map((i) => {
        const p = getProduct(i.product_id);
        return `
        <div class="cart-item" style="grid-template-columns:72px 1fr auto">
          <a href="product.html?id=${encodeURIComponent(i.product_id)}" class="cart-item__thumb">${p ? productImage(p, 200) : ""}</a>
          <div>
            <p class="card__brand">${esc(i.brand)}</p>
            <p class="card__name" style="min-height:0">${esc(i.product_name)}</p>
            <p class="cart-item__opt">사이즈 ${esc(i.size)} / ${i.qty}개 · ${won(i.unit_price)}</p>
            ${PURCHASED.includes(o.status) && p ? `<a class="link-btn" href="product.html?id=${encodeURIComponent(i.product_id)}#reviews">후기 쓰기</a>` : ""}
          </div>
          <div class="cart-item__right"><span class="cart-item__price">${won(i.unit_price * i.qty)}</span></div>
        </div>`;
      }).join("")}

      <div class="order-detail__grid">
        <section>
          <h2 class="section-title">배송지</h2>
          <dl class="result__table">${rows([
            ["받는 분", esc(o.receiver_name)],
            ["연락처", esc(o.receiver_phone)],
            ["이메일", esc(o.receiver_email)],
            ["주소", esc(o.receiver_address)],
          ])}</dl>
        </section>
        <section>
          <h2 class="section-title">결제 정보</h2>
          <dl class="result__table">${rows([
            ["상품 금액", won(o.origin_amount)],
            ["할인 금액", o.discount_amount ? "-" + won(o.discount_amount) : "0원"],
            ["배송비", won(o.shipping_fee)],
            ["최종 결제 금액", `<b>${won(o.total_amount)}</b>`],
            ["결제 수단", esc(o.payment_method || "-")],
            ...(o.paid_at ? [["결제 시각", fmtDate(o.paid_at)]] : []),
            ...(o.canceled_at ? [["취소 시각", fmtDate(o.canceled_at)]] : []),
            ...(o.fail_message ? [["사유", esc(o.fail_message)]] : []),
          ])}</dl>
        </section>
      </div>

      <div class="order-detail__btns">
        <a href="mypage.html" class="btn btn--line">주문 목록</a>
        ${canCancel ? `<button type="button" class="btn btn--primary" id="cancelBtn">주문 취소</button>` : ""}
      </div>`;

    document.getElementById("cancelBtn")?.addEventListener("click", async (e) => {
      const reason = prompt("취소 사유를 입력해 주세요.", "단순 변심");
      if (reason === null) return;
      e.target.disabled = true;
      try {
        // 서버가 토스에 취소를 요청하고, 재고를 되돌리고, 주문을 "취소됨"으로 바꿉니다.
        await callFn("cancel-payment", { orderId: o.id, reason });
        toast("주문을 취소했어요");
        render();
      } catch (err) {
        alert(err.message);
        e.target.disabled = false;
      }
    });
  }

  render();
});
