// 2-1 회원가입: 이메일 인증 없이 바로 쓸 수 있는 계정을 만든다. 화면은 성공하면 곧바로 로그인한다.
// 요청: { email, password, name }
// 회원 정보(profiles)는 auth.users 트리거(handle_new_user)가 만든다.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "POST만 허용합니다.");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail(400, "INVALID_REQUEST", "요청 형식이 올바르지 않습니다.");
  }
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const name = String(body?.name ?? "").trim();

  const invalid =
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && "이메일을 정확히 입력해 주세요.") ||
    ((password.length < 8 || password.length > 72) && "비밀번호는 8~72자로 입력해 주세요.") ||
    ((!name || name.length > 30) && "이름을 입력해 주세요(30자 이내).");
  if (invalid) return fail(400, "INVALID_INPUT", invalid);

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) {
    if ((error as any).code === "email_exists" || /already/i.test(error.message)) {
      return fail(409, "EMAIL_EXISTS", "이미 가입된 이메일입니다.");
    }
    if ((error as any).code === "weak_password") return fail(400, "WEAK_PASSWORD", "더 안전한 비밀번호를 입력해 주세요.");
    console.error("createUser", error);
    return fail(500, "SERVER_ERROR", "가입하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  return json({ ok: true });
});
