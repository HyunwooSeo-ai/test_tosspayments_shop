// 3-3 결제 확정: DB 주문 금액과 결제 금액을 대조하고 토스에 결제 승인을 요청한다.
// 요청: { paymentKey, orderId, amount }
// 같은 주문을 두 번 확정하지 않는다(6-3). 이미 확정된 주문이면 그대로 성공을 돌려준다.
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

// 시크릿 키는 Edge Function secret(TOSS_SECRET_KEY)에서 읽는다.
// 설정하지 않았으면 checkout.js의 문서용 클라이언트 키와 짝인 토스 문서 공개 테스트 시크릿 키를 쓴다.
const TOSS_SECRET_KEY = Deno.env.get("TOSS_SECRET_KEY") ?? "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6";
const TOSS_AUTH = "Basic " + btoa(TOSS_SECRET_KEY + ":");

async function getUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

const methodLabel = (p: any) => (p?.easyPay?.provider ? `${p.method}(${p.easyPay.provider})` : p?.method ?? null);

async function finish(orderId: string, p: any) {
  const { error } = await admin.rpc("finish_payment", {
    p_order: orderId,
    p_payment_key: p.paymentKey,
    p_method: methodLabel(p),
    p_status: p.status,
    p_approved: p.approvedAt ?? null,
    p_raw: p,
  });
  if (error) throw error;
}

async function orderSummary(orderId: string) {
  const { data } = await admin
    .from("orders")
    .select("id, order_name, total_amount, status, payment_method, receiver_name, receiver_address, paid_at")
    .eq("id", orderId)
    .single();
  return data;
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
  const paymentKey = String(body?.paymentKey ?? "");
  const orderId = String(body?.orderId ?? "");
  const amount = Number(body?.amount);
  if (!paymentKey || !orderId || !Number.isInteger(amount)) {
    return fail(400, "INVALID_REQUEST", "결제 정보가 올바르지 않습니다.");
  }

  // 1단계: 금액 대조 + 재고 차감 + 확정 중 표시 (한 트랜잭션)
  const { data: state, error: beginError } = await admin.rpc("begin_confirm", {
    p_order: orderId,
    p_amount: amount,
    p_user: user.id,
  });
  if (beginError) {
    console.error("begin_confirm", beginError);
    return fail(500, "SERVER_ERROR", "결제 확인 중 오류가 발생했습니다.");
  }

  switch (state) {
    case "ALREADY_DONE":
      return json({ alreadyDone: true, order: await orderSummary(orderId) });
    case "IN_PROGRESS":
      return fail(409, "IN_PROGRESS", "결제를 확인하는 중입니다. 잠시 후 새로고침해 주세요.");
    case "NOT_FOUND":
      return fail(404, "NOT_FOUND", "주문을 찾을 수 없습니다.");
    case "INVALID_STATUS":
      return fail(409, "INVALID_STATUS", "이미 만료되었거나 취소된 주문입니다. 다시 주문해 주세요.");
    case "AMOUNT_MISMATCH":
      return fail(400, "AMOUNT_MISMATCH", "결제 금액이 주문 금액과 일치하지 않습니다.");
    case "OUT_OF_STOCK":
      return fail(409, "OUT_OF_STOCK", "결제하는 사이 재고가 소진되었습니다. 결제는 확정되지 않았습니다.");
  }

  // 2단계: 토스 결제 승인. Idempotency-Key로 같은 주문의 중복 승인을 막는다.
  let res: Response;
  let payment: any;
  try {
    res = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: { Authorization: TOSS_AUTH, "Content-Type": "application/json", "Idempotency-Key": orderId },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });
    payment = await res.json();
  } catch (err) {
    // 토스 응답을 받지 못함: 주문은 "확정 중"으로 남고, 1분 뒤 새로고침하면 다시 시도한다.
    console.error("toss confirm network", err);
    return fail(502, "TOSS_UNREACHABLE", "결제사와 통신하지 못했습니다. 잠시 후 새로고침해 주세요.");
  }

  try {
    if (!res.ok && payment?.code === "ALREADY_PROCESSED_PAYMENT") {
      // 이미 승인된 결제: 토스에서 조회해 DB에 반영
      const look = await fetch(`https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}`, {
        headers: { Authorization: TOSS_AUTH },
      });
      const p = await look.json();
      if (look.ok && p.orderId === orderId && p.totalAmount === amount && ["DONE", "WAITING_FOR_DEPOSIT"].includes(p.status)) {
        await finish(orderId, p);
        return json({ order: await orderSummary(orderId) });
      }
    }

    if (!res.ok) {
      await admin.rpc("close_order", {
        p_order: orderId,
        p_status: "FAILED",
        p_code: payment?.code ?? "CONFIRM_FAILED",
        p_message: payment?.message ?? "결제 승인에 실패했습니다.",
      });
      return fail(400, payment?.code ?? "CONFIRM_FAILED", payment?.message ?? "결제 승인에 실패했습니다.");
    }

    await finish(orderId, payment);
    return json({ order: await orderSummary(orderId) });
  } catch (err) {
    console.error("finish_payment", err);
    return fail(500, "SERVER_ERROR", "결제는 승인되었지만 주문 반영 중 오류가 발생했습니다. 고객센터에 문의해 주세요.");
  }
});
