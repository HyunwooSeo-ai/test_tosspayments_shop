/* 로그인 / 회원가입 / 비밀번호 재설정 (2단계) */
document.addEventListener("DOMContentLoaded", async () => {
  await App.ready;
  const page = document.body.dataset.page;
  const $ = (id) => document.getElementById(id);
  const next = safeNext(new URLSearchParams(location.search).get("next"));
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // 로그인·회원가입 화면을 오갈 때 돌아갈 페이지를 유지합니다.
  if ($("altLink")) $("altLink").href = `${$("altLink").getAttribute("href")}?next=${encodeURIComponent(next)}`;

  // 로그인 직후: 비로그인 장바구니를 계정에 합치고 원래 보던 페이지로 돌아갑니다. (2-5, 4-2)
  async function afterLogin() {
    await Auth.init();
    await Cart.mergeLocal();
    location.replace(next);
  }

  function busy(form, on) {
    form.querySelector("button[type=submit]").disabled = on;
  }

  if (page === "login" || page === "signup") {
    if (Auth.user) {
      location.replace(next);
      return;
    }
    const form = $("authForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("email").value.trim();
      const password = $("password").value;
      let invalid = (!EMAIL_RE.test(email) && "이메일을 정확히 입력해 주세요.") || (!password && "비밀번호를 입력해 주세요.");
      if (!invalid && page === "signup") {
        invalid =
          (!$("name").value.trim() && "이름을 입력해 주세요.") ||
          (password.length < 8 && "비밀번호는 8자 이상으로 입력해 주세요.") ||
          (password !== $("password2").value && "비밀번호가 서로 다릅니다.");
      }
      if (invalid) {
        $("hint").textContent = invalid;
        return;
      }

      $("hint").textContent = "";
      busy(form, true);
      try {
        if (page === "signup") {
          await callFn("signup", { email, password, name: $("name").value.trim() });
        }
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "이메일 또는 비밀번호가 올바르지 않습니다." : error.message);
        await afterLogin();
      } catch (err) {
        $("hint").textContent = err.message;
        busy(form, false);
      }
    });
    return;
  }

  /* ---------- 비밀번호 재설정 ---------- */
  if (page === "reset") {
    const recovering = AUTH_REDIRECT.get("type") === "recovery" && Auth.user;
    if (AUTH_REDIRECT.get("error_description")) {
      $("hint").textContent = "링크가 만료되었거나 올바르지 않습니다. 다시 요청해 주세요.";
    }
    $("requestForm").hidden = recovering;
    $("updateForm").hidden = !recovering;

    $("requestForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("email").value.trim();
      if (!EMAIL_RE.test(email)) {
        $("hint").textContent = "이메일을 정확히 입력해 주세요.";
        return;
      }
      busy(e.target, true);
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: new URL("reset.html", location.href).href });
      busy(e.target, false);
      $("hint").textContent = error
        ? "메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요."
        : "재설정 메일을 보냈습니다. 메일함을 확인해 주세요.";
    });

    $("updateForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const password = $("password").value;
      const invalid = (password.length < 8 && "비밀번호는 8자 이상으로 입력해 주세요.") ||
        (password !== $("password2").value && "비밀번호가 서로 다릅니다.");
      if (invalid) {
        $("hint2").textContent = invalid;
        return;
      }
      busy(e.target, true);
      const { error } = await sb.auth.updateUser({ password });
      busy(e.target, false);
      if (error) {
        $("hint2").textContent = "비밀번호를 바꾸지 못했습니다. 다른 비밀번호를 입력해 주세요.";
        return;
      }
      toast("비밀번호를 변경했어요");
      setTimeout(() => location.replace("mypage.html"), 800);
    });
  }
});
