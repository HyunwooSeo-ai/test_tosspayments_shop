/* Supabase 연결 (1-1)
 * 화면에는 공개해도 되는 프로젝트 URL과 publishable 키만 둡니다.
 * 데이터 보호는 DB의 출입 규칙(RLS)이, 결제·주문 처리는 Edge Function이 맡습니다.
 */
const SUPABASE_URL = "https://dyfieegfgskszpyldhzs.supabase.co";
const SUPABASE_KEY = "sb_publishable_6CYWcAoFrPU3LZ3MmoKgPA_uOfs8_MP";

// 비밀번호 재설정 메일 링크로 들어왔는지: 클라이언트가 주소의 #토큰을 지우기 전에 읽어 둔다.
const AUTH_REDIRECT = new URLSearchParams(location.hash.slice(1));

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* Edge Function 호출. 실패하면 서버가 보낸 message로 Error를 던집니다. */
async function callFn(name, body) {
  const { data: { session } } = await sb.auth.getSession();
  const headers = { "Content-Type": "application/json", apikey: SUPABASE_KEY };
  if (session) headers.Authorization = `Bearer ${session.access_token}`;

  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (e) {
    throw Object.assign(new Error("서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요."), { code: "NETWORK" });
  }
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    throw Object.assign(new Error(data.message || "요청을 처리하지 못했습니다."), { code: data.code, status: res.status });
  }
  return data;
}
