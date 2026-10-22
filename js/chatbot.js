/* 쇼핑 챗봇: 오른쪽 아래 버튼으로 여는 대화창. 답변은 Edge Function `chat`이 만듭니다.
 * common.js 다음에 불러옵니다. 대화 기록은 탭을 닫을 때까지 sessionStorage에 둡니다.
 */
const CHAT_KEY = "nine_chat";
const CHAT_HELLO = "안녕하세요! NINE STORE 쇼핑 도우미예요. 찾는 옷이나 배송·결제 궁금한 점을 물어보세요.";
const CHAT_SUGGEST = ["5만 원 이하 후드티 추천해 줘", "할인 많이 하는 신발 있어?", "배송비는 얼마야?"];

const Chatbot = {
  messages: readJSON(CHAT_KEY, [], "sessionStorage"), // [{ role, content, productIds? }]
  busy: false,
  el: null,

  mount() {
    const root = document.createElement("div");
    root.className = "chatbot";
    root.innerHTML = `
      <button type="button" class="chatbot__fab" aria-label="쇼핑 도우미 열기" aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
      </button>
      <section class="chatbot__panel" role="dialog" aria-label="쇼핑 도우미" hidden>
        <header class="chatbot__head">
          <strong>쇼핑 도우미</strong>
          <button type="button" class="chatbot__reset" title="대화 지우기">새 대화</button>
          <button type="button" class="chatbot__close" aria-label="닫기">✕</button>
        </header>
        <div class="chatbot__log" aria-live="polite"></div>
        <form class="chatbot__form">
          <input type="text" maxlength="500" placeholder="무엇을 찾으세요?" aria-label="질문" autocomplete="off">
          <button type="submit" class="btn btn--primary">보내기</button>
        </form>
      </section>`;
    document.body.appendChild(root);
    Chatbot.el = root;

    const fab = root.querySelector(".chatbot__fab");
    const panel = root.querySelector(".chatbot__panel");
    const toggle = (open) => {
      panel.hidden = !open;
      fab.setAttribute("aria-expanded", String(open));
      root.classList.toggle("is-open", open);
      if (open) {
        Chatbot.render();
        root.querySelector("input").focus();
      }
    };
    fab.addEventListener("click", () => toggle(panel.hidden));
    root.querySelector(".chatbot__close").addEventListener("click", () => toggle(false));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) toggle(false); });
    root.querySelector(".chatbot__reset").addEventListener("click", () => {
      if (Chatbot.busy) return;
      Chatbot.messages = [];
      Chatbot.save();
      Chatbot.render();
    });
    root.querySelector(".chatbot__form").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = e.target.querySelector("input");
      Chatbot.send(input.value);
      input.value = "";
    });
    root.querySelector(".chatbot__log").addEventListener("click", (e) => {
      const chip = e.target.closest(".chatbot__chip");
      if (chip) Chatbot.send(chip.textContent);
    });
  },

  save() {
    writeJSON(CHAT_KEY, Chatbot.messages.slice(-20), "sessionStorage");
  },

  productsHTML(ids = []) {
    const items = ids.map(getProduct).filter(Boolean);
    if (!items.length) return "";
    return `<div class="chatbot__products">${items.map((p) => `
      <a class="chatbot__product" href="product.html?id=${encodeURIComponent(p.id)}">
        <div class="chatbot__thumb">${productImage(p, 160)}</div>
        <div>
          <p class="card__brand">${esc(p.brand)}</p>
          <p class="chatbot__pname">${esc(p.name)}</p>
          ${priceHTML(p)}
        </div>
      </a>`).join("")}</div>`;
  },

  render() {
    const log = Chatbot.el.querySelector(".chatbot__log");
    const bubble = (role, text) => `<p class="chatbot__msg chatbot__msg--${role}">${esc(text)}</p>`;
    log.innerHTML = bubble("assistant", CHAT_HELLO)
      + (Chatbot.messages.length ? "" : `<div class="chatbot__chips">${CHAT_SUGGEST.map((s) => `<button type="button" class="chatbot__chip">${esc(s)}</button>`).join("")}</div>`)
      + Chatbot.messages.map((m) => bubble(m.role, m.content) + Chatbot.productsHTML(m.productIds)).join("")
      + (Chatbot.busy ? `<p class="chatbot__msg chatbot__msg--assistant chatbot__typing"><span></span><span></span><span></span></p>` : "");
    log.scrollTop = log.scrollHeight;
    Chatbot.el.querySelector(".chatbot__form button").disabled = Chatbot.busy;
  },

  async send(text) {
    text = text.trim();
    if (!text || Chatbot.busy) return;
    Chatbot.messages.push({ role: "user", content: text });
    Chatbot.busy = true;
    Chatbot.render();
    try {
      const history = Chatbot.messages.slice(-10).map(({ role, content }) => ({ role, content }));
      const { answer, productIds } = await callFn("chat", { messages: history });
      Chatbot.messages.push({ role: "assistant", content: answer, productIds });
    } catch (e) {
      console.error(e);
      Chatbot.messages.push({ role: "assistant", content: e.message || "답변을 만들지 못했어요." });
    }
    Chatbot.busy = false;
    Chatbot.save();
    Chatbot.render();
  },
};

document.addEventListener("DOMContentLoaded", async () => {
  // 추천 상품 카드를 그리려면 카탈로그가 있어야 합니다.
  await App.ready;
  if (!App.error) Chatbot.mount();
});
