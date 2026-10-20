// 6-1 토스 웹훅: 결제 상태 변경(취소, 가상계좌 입금 등) 알림을 받아 DB에 반영한다.
// 웹훅 본문은 믿지 않고 orderId만 꺼내서 토스 결제 조회 API로 실제 상태를 다시 확인한다.
// 토스 개발자센터 > 웹훅에 https://<project>.supabase.co/functions/v1/toss-webhook 을 등록한다.
// (PAYMENT_STATUS_CHANGED, DEPOSIT_CALLBACK 이벤트)
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const TOSS_SECRET_KEY = Deno.env.get("TOSS_SECRET_KEY") ?? "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6";
const TOSS_AUTH = "Basic " + btoa(TOSS_SECRET_KEY + ":");

const ok = () => new Response("ok", { status: 200 });
const methodLabel = (p: any) => (p?.easyPay?.provider ? `${p.method}(${p.easyPay.provider})` : p?.method ?? null);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return ok();
  }
  const orderId = body?.data?.orderId ?? body?.orderId;
  if (typeof orderId !== "string" || !orderId) return ok();

  const { data: order } = await admin.from("orders").select("id, status, total_amount").eq("id", orderId).maybeSingle();
  if (!order) return ok();

  const res = await fetch(`https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: TOSS_AUTH },
  });
  if (!res.ok) {
    // 조회에 실패하면 500을 돌려 토스가 다시 보내게 한다.
    console.error("toss lookup", res.status, await res.text());
    return new Response("lookup failed", { status: 500 });
  }
  const p = await res.json();
  if (p.totalAmount !== order.total_amount) {
    console.error("amount mismatch", orderId, p.totalAmount, order.total_amount);
    return ok();
  }

  let rpc: { error: any } = { error: null };
  switch (p.status) {
    case "DONE":
    case "WAITING_FOR_DEPOSIT":
      rpc = await admin.rpc("finish_payment", {
        p_order: orderId,
        p_payment_key: p.paymentKey,
        p_method: methodLabel(p),
        p_status: p.status,
        p_approved: p.approvedAt ?? null,
        p_raw: p,
      });
      break;
    case "CANCELED":
    case "PARTIAL_CANCELED":
      rpc = await admin.rpc("apply_cancel", {
        p_order: orderId,
        p_reason: p.cancels?.at(-1)?.cancelReason ?? "토스 취소",
        p_raw: p,
      });
      break;
    case "ABORTED":
    case "EXPIRED":
      rpc = await admin.rpc("close_order", {
        p_order: orderId,
        p_status: p.status === "EXPIRED" ? "EXPIRED" : "FAILED",
        p_code: p.status,
        p_message: p.status === "EXPIRED" ? "결제 유효 시간이 지났습니다." : "결제 승인에 실패했습니다.",
      });
      break;
  }
  if (rpc.error) {
    console.error("webhook rpc", rpc.error);
    return new Response("db error", { status: 500 });
  }
  return ok();
});
