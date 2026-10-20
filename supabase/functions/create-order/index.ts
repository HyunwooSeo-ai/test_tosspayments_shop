// 3-2 주문 만들기: 화면이 보낸 상품 목록을 DB 가격으로 다시 계산하고 재고를 확인한 뒤 "결제 대기" 주문을 만든다.
// 요청: { items: [{ id, size, qty }], source: "cart" | "direct", receiver: { name, phone, email, address } }
// 응답: { orderId, orderName, amount, origin, discount, shipping }
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

  const items = Array.isArray(body?.items)
    ? body.items.slice(0, 30).map((i: any) => ({ id: String(i?.id ?? ""), size: String(i?.size ?? ""), qty: Number(i?.qty) }))
    : [];
  if (!items.length || items.some((i: any) => !i.id || !i.size || !Number.isInteger(i.qty) || i.qty < 1 || i.qty > 10)) {
    return fail(400, "INVALID_ITEMS", "주문할 상품 정보가 올바르지 않습니다.");
  }

  const r = body?.receiver ?? {};
  const receiver = {
    name: String(r.name ?? "").trim().slice(0, 30),
    phone: String(r.phone ?? "").replace(/\D/g, ""),
    email: String(r.email ?? "").trim().slice(0, 100),
    address: String(r.address ?? "").trim().slice(0, 200),
  };
  const invalid =
    (!receiver.name && "이름을 입력해 주세요.") ||
    (!/^01\d{8,9}$/.test(receiver.phone) && "휴대폰 번호를 정확히 입력해 주세요.") ||
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiver.email) && "이메일을 정확히 입력해 주세요.") ||
    (!receiver.address && "배송지를 입력해 주세요.");
  if (invalid) return fail(400, "INVALID_RECEIVER", invalid);

  const { data, error } = await admin.rpc("create_order", {
    p_user: user.id,
    p_items: items,
    p_source: body?.source === "cart" ? "cart" : "direct",
    p_receiver: receiver,
  });

  if (error) {
    const msg = error.message || "";
    if (msg.startsWith("OUT_OF_STOCK:")) return fail(409, "OUT_OF_STOCK", `재고가 부족합니다: ${msg.slice(13)}`);
    if (msg === "PRODUCT_NOT_FOUND") return fail(409, "PRODUCT_NOT_FOUND", "판매하지 않는 상품이 포함되어 있습니다.");
    if (msg === "INVALID_SIZE") return fail(409, "INVALID_SIZE", "선택할 수 없는 사이즈가 포함되어 있습니다.");
    if (msg === "INVALID_QTY" || msg === "INVALID_ITEMS") return fail(400, msg, "주문 수량이 올바르지 않습니다.");
    console.error("create_order", error);
    return fail(500, "SERVER_ERROR", "주문을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  return json(data);
});
