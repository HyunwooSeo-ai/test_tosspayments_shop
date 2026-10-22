// 챗봇 상품 학습: 상품 설명을 Upstage 임베딩으로 바꿔 product_embeddings에 저장한다. 관리자만.
// 설명이 바뀐 상품만 다시 임베딩한다. 요청: { force?: boolean }
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

const UPSTAGE_API_KEY = Deno.env.get("UPSTAGE_API_KEY");
const BATCH = 100; // Upstage 한 번에 최대 100개

const SHAPES: Record<string, string> = {
  tee: "티셔츠", hoodie: "후드", pants: "긴바지", cargo: "카고 팬츠", shorts: "반바지",
  sneaker: "스니커즈", hightop: "하이탑", runner: "러닝화",
};

async function getUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 가격·재고는 자주 바뀌므로 넣지 않는다. 답할 때 chat 함수가 DB에서 새로 읽는다.
function describe(p: any) {
  return [
    `브랜드: ${p.brand}`,
    `상품명: ${p.name}`,
    `카테고리: ${p.categories?.name ?? p.category}${p.sub ? ` > ${p.sub}` : ""}`,
    SHAPES[p.shape] ? `종류: ${SHAPES[p.shape]}` : "",
    p.tags?.length ? `태그: ${p.tags.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

async function embed(texts: string[]) {
  const res = await fetch("https://api.upstage.ai/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTAGE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "solar-embedding-2-passage", input: texts }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Upstage ${res.status}`);
  return (data.data as { index: number; embedding: number[] }[])
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "POST만 허용합니다.");
  if (!UPSTAGE_API_KEY) return fail(500, "NO_API_KEY", "UPSTAGE_API_KEY가 설정되지 않았습니다.");

  const user = await getUser(req);
  if (!user) return fail(401, "UNAUTHORIZED", "로그인이 필요합니다.");
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return fail(403, "FORBIDDEN", "관리자만 실행할 수 있습니다.");

  let body: any = {};
  try { body = await req.json(); } catch { /* 본문 없음 */ }

  const [{ data: products, error }, { data: saved }] = await Promise.all([
    admin.from("products").select("id, category, sub, shape, brand, name, tags, categories(name)"),
    admin.from("product_embeddings").select("product_id, content_hash"),
  ]);
  if (error) return fail(500, "SERVER_ERROR", "상품을 불러오지 못했습니다.");
  const hashes = new Map((saved ?? []).map((r) => [r.product_id, r.content_hash]));

  const todo = [];
  for (const p of products ?? []) {
    const content = describe(p);
    const hash = await sha256(content);
    if (body?.force || hashes.get(p.id) !== hash) todo.push({ product_id: p.id, content, content_hash: hash });
  }

  try {
    for (let i = 0; i < todo.length; i += BATCH) {
      const chunk = todo.slice(i, i + BATCH);
      const vectors = await embed(chunk.map((r) => r.content));
      const rows = chunk.map((r, j) => ({
        ...r, embedding: JSON.stringify(vectors[j]), updated_at: new Date().toISOString(),
      }));
      const { error: upErr } = await admin.from("product_embeddings").upsert(rows);
      if (upErr) throw upErr;
    }
  } catch (e) {
    console.error("embed", e);
    return fail(502, "EMBED_FAILED", "임베딩을 만들지 못했습니다.");
  }
  return json({ ok: true, total: products?.length ?? 0, updated: todo.length });
});
