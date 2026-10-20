/* 마이페이지: 주문 내역(5-1), 좋아요(5-4), 내 정보 수정(5-5) */
document.addEventListener("DOMContentLoaded", async () => {
  await App.ready;
  if (showLoadError()) return;
  if (!requireLogin()) return;

  const $ = (id) => document.getElementById(id);
  const tab = ["orders", "likes", "profile"].includes(new URLSearchParams(location.search).get("tab"))
    ? new URLSearchParams(location.search).get("tab")
    : "orders";
  document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("is-active", a.dataset.tab === tab));
  $(`tab-${tab}`).hidden = false;

  /* ---------- 주문 내역 ---------- */
  if (tab === "orders") {
    const { data, error } = await sb.from("orders")
      .select("id, order_name, total_amount, status, created_at, order_items(product_id, size, qty)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      $("orderList").innerHTML = `<p class="empty">주문 내역을 불러오지 못했습니다.</p>`;
      return;
    }
    // 결제창을 열기만 하고 끝내지 않은 "결제 대기" 주문은 목록에서 뺍니다.
    const orders = data.filter((o) => o.status !== "PENDING");
    $("orderList").innerHTML = orders.length
      ? orders.map((o) => {
        const first = o.order_items[0];
        const p = first && getProduct(first.product_id);
        return `
        <a class="order-row" href="order.html?id=${encodeURIComponent(o.id)}">
          <div class="order-row__thumb">${p ? productImage(p, 200) : ""}</div>
          <div class="order-row__body">
            <p class="order-row__date">${fmtDate(o.created_at)} · ${esc(o.id)}</p>
            <p class="order-row__name">${esc(o.order_name)}</p>
            <p class="order-row__amount">${won(o.total_amount)}</p>
          </div>
          <div>${statusBadge(o.status)}</div>
        </a>`;
      }).join("")
      : `<p class="empty">주문 내역이 없습니다.<br><br><a href="clothes.html" class="link-btn">쇼핑하러 가기</a></p>`;
  }

  /* ---------- 좋아요 ---------- */
  if (tab === "likes") {
    const grid = $("likeGrid");
    const render = () => {
      const list = [...Likes.ids].map(getProduct).filter(Boolean);
      grid.innerHTML = list.length ? list.map((p) => cardHTML(p)).join("") : `<p class="empty">좋아요한 상품이 없습니다.</p>`;
    };
    bindLikeButtons(grid, render);
    render();
  }

  /* ---------- 내 정보 ---------- */
  if (tab === "profile") {
    $("pEmail").value = Auth.user.email;
    $("pName").value = Auth.profile?.name || "";
    $("pPhone").value = Auth.profile?.phone || "";
    $("pAddr").value = Auth.profile?.address || "";

    $("profileForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("pName").value.trim();
      const phone = $("pPhone").value.replace(/\D/g, "");
      const address = $("pAddr").value.trim();
      const invalid = (!name && "이름을 입력해 주세요.") || (phone && !/^01\d{8,9}$/.test(phone) && "휴대폰 번호를 정확히 입력해 주세요.");
      if (invalid) {
        $("profileHint").textContent = invalid;
        return;
      }
      const { error } = await sb.from("profiles").update({ name, phone, address }).eq("id", Auth.user.id);
      if (error) {
        console.error(error);
        $("profileHint").textContent = "저장하지 못했습니다.";
        return;
      }
      $("profileHint").textContent = "";
      $("pPhone").value = phone;
      toast("내 정보를 저장했어요");
    });

    $("passwordForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const pw = $("newPw").value;
      const invalid = (pw.length < 8 && "비밀번호는 8자 이상으로 입력해 주세요.") || (pw !== $("newPw2").value && "비밀번호가 서로 다릅니다.");
      if (invalid) {
        $("pwHint").textContent = invalid;
        return;
      }
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) {
        $("pwHint").textContent = error.code === "same_password" ? "지금과 다른 비밀번호를 입력해 주세요." : "비밀번호를 바꾸지 못했습니다.";
        return;
      }
      $("pwHint").textContent = "";
      e.target.reset();
      toast("비밀번호를 변경했어요");
    });
  }
});
