// 5-3 / 7-6 주문 취소: 본인 또는 관리자만. 토스에 취소를 요청하고 재고를 되돌린다.
// 요청: { orderId, reason }
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (status: number, code: string, message: string) => json({ code, message }, status);

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const TOSS_SECRET_KEY = Deno.env.get("TOSS_SECRET_KEY") ?? "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6";
const TOSS_AUTH = "Basic " + btoa(TOSS_SECRET_KEY + ":");

// 손님은 결제 완료(또는 입금 대기) 상태만, 관리자는 배송 단계까지 취소할 수 있다.
const USER_CANCELABLE = ["PAID", "WAITING_DEPOSIT"];
const ADMIN_CANCELABLE = ["PAID", "WAITING_DEPOSIT", "PREPARING", "SHIPPING", "DELIVERED"];

async function getUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "POST만 허용합니다.");

  const user = await getUser(req);
  if (!user) return fail(401, "UNAUTHORIZED", "로그인이 필요합니다.");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail(400, "INVALID_REQUEST", "요청 형식이 올바르지 않습니다.");
  }
  const orderId = String(body?.orderId ?? "");
  const reason = String(body?.reason ?? "").trim().slice(0, 200) || "고객 요청";

  const [{ data: profile }, { data: order }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", user.id).single(),
    admin.from("orders").select("id, user_id, status, payments(payment_key)").eq("id", orderId).maybeSingle(),
  ]);
  const isAdmin = profile?.role === "admin";
  if (!order || (!isAdmin && order.user_id !== user.id)) return fail(404, "NOT_FOUND", "주문을 찾을 수 없습니다.");
  if (order.status === "CANCELED") return json({ alreadyDone: true });
  if (!(isAdmin ? ADMIN_CANCELABLE : USER_CANCELABLE).includes(order.status)) {
    return fail(409, "NOT_CANCELABLE", "취소할 수 없는 주문 상태입니다.");
  }

  const paymentKey = (order as any).payments?.payment_key;
  if (!paymentKey) return fail(409, "NO_PAYMENT", "결제 정보가 없는 주문입니다.");

  const res = await fetch(`https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}/cancel`, {
    method: "POST",
    headers: { Authorization: TOSS_AUTH, "Content-Type": "application/json", "Idempotency-Key": `cancel-${orderId}` },
    body: JSON.stringify({ cancelReason: reason }),
  });
  const payment = await res.json();
  if (!res.ok && payment?.code !== "ALREADY_CANCELED_PAYMENT") {
    return fail(400, payment?.code ?? "CANCEL_FAILED", payment?.message ?? "결제 취소에 실패했습니다.");
  }

  const { data: state, error } = await admin.rpc("apply_cancel", {
    p_order: orderId,
    p_reason: reason,
    p_raw: res.ok ? payment : null,
  });
  if (error) {
    console.error("apply_cancel", error);
    return fail(500, "SERVER_ERROR", "결제는 취소되었지만 주문 반영 중 오류가 발생했습니다.");
  }
  return json({ ok: true, state });
});
