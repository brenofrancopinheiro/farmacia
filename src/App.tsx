import { FormEvent, useEffect, useState } from "react";
import {
  queueApi,
  type CustomerTicket,
  type QueueBoard,
  type StaffTicket,
  type WaitingTicket,
} from "./lib/queue-api";
import { supabase, supabaseConfigured } from "./lib/supabase";
import "./login.css";
import "./ticket-shortcut.css";
import "./waiting-preview.css";
import "./brand-logo.css";
import "./phone-field.css";
import "./desk-ux.css";
import { detailPlaceholder, displayTopic, topics, type Language, type Topic } from "./features/queue/content";
import { staffSessionKey } from "./features/attendance/session";

type Screen = "home" | "ticket" | "login" | "desk";
type Lang = Language;
type SavedTicket = CustomerTicket & { token: string };
const listKey = "farma-ticket-list";
const langKey = "farma-language";
const tokens = (): string[] => {
  try {
    const value = JSON.parse(localStorage.getItem(listKey) ?? "[]");
    return Array.isArray(value)
      ? value.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
};
const firstToken = () =>
  new URLSearchParams(location.search).get("t") ?? tokens().at(-1) ?? null;
const storedLang = (): Lang =>
  localStorage.getItem(langKey) === "es" ? "es" : "pt";
function Brand() {
  return (
    <img className="brand-logo" src="/farma-logo.png" alt="Farma Original" />
  );
}

export default function App() {
  const [language, setLanguage] = useState<Lang>(storedLang);
  const es = language === "es";
  const tx = (pt: string, spanish: string) => (es ? spanish : pt);
  const shownTopic = (topic: string) => displayTopic(topic, language);
  const detailExample = (value: Topic) => detailPlaceholder(value, language);
  const [screen, setScreen] = useState<Screen>(() =>
    new URLSearchParams(location.search).get("t") ? "ticket" : "home"
  );
  const [token, setToken] = useState<string | null>(firstToken());
  const [saved, setSaved] = useState(tokens);
  const [board, setBoard] = useState<QueueBoard>();
  const [waiting, setWaiting] = useState<WaitingTicket[]>([]);
  const [ticket, setTicket] = useState<CustomerTicket>();
  const [mine, setMine] = useState<SavedTicket[]>([]);
  const [session, setSession] = useState<string | null>(() =>
    sessionStorage.getItem(staffSessionKey)
  );
  const [staff, setStaff] = useState<StaffTicket[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState<Topic | null>(null);
  const [details, setDetails] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [callTicket, setCallTicket] = useState<StaffTicket | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translatingCode, setTranslatingCode] = useState<string | null>(null);
  const report = (e: unknown, fallback: string) =>
    setError(e instanceof Error ? e.message : fallback);
  const refreshBoard = async () => {
    if (!supabaseConfigured) return;
    try {
      const [b, w] = await Promise.all([queueApi.board(), queueApi.waiting()]);
      setBoard(b);
      setWaiting(w);
    } catch (e) {
      report(
        e,
        tx(
          "Não foi possível atualizar a fila.",
          "No fue posible actualizar la fila."
        )
      );
    }
  };
  const refreshTicket = async (value = token) => {
    if (!value) return;
    try {
      setTicket(await queueApi.ticket(value));
    } catch (e) {
      report(e, tx("Senha não encontrada.", "Código no encontrado."));
    }
  };
  const refreshStaff = async () => {
    if (!session) return;
    try {
      setStaff(await queueApi.staffBoard(session));
    } catch (e) {
      report(e, tx("Sessão expirada.", "La sesión expiró."));
    }
  };
  const refreshMine = async () => {
    const items = await Promise.all(
      saved.map(async (t) => {
        try {
          return { token: t, ...(await queueApi.ticket(t)) };
        } catch {
          return null;
        }
      })
    );
    setMine(
      items.filter(
        (x): x is SavedTicket =>
          x !== null && (x.status === "waiting" || x.status === "called")
      )
    );
  };
  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem(langKey, language);
  }, [language]);
  useEffect(() => {
    const queueButton = document.querySelector<HTMLElement>(".unit");
    queueButton?.setAttribute("role", "button");
    queueButton?.setAttribute("tabindex", "0");
    queueButton?.setAttribute(
      "aria-label",
      tx("Voltar para a fila do WhatsApp", "Volver a la fila de WhatsApp")
    );
    const returnToQueue = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest(".unit")) home();
    };
    const returnWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        if ((event.target as HTMLElement).closest(".unit")) {
          event.preventDefault();
          home();
        }
      }
    };
    document.addEventListener("click", returnToQueue);
    document.addEventListener("keydown", returnWithKeyboard);
    return () => {
      document.removeEventListener("click", returnToQueue);
      document.removeEventListener("keydown", returnWithKeyboard);
    };
  }, [language]);
  useEffect(() => {
    void refreshBoard();
    const i = setInterval(() => void refreshBoard(), 5000);
    return () => clearInterval(i);
  }, [language]);
  useEffect(() => {
    if (!token) return;
    void refreshTicket();
    const i = setInterval(() => void refreshTicket(), 5000);
    return () => clearInterval(i);
  }, [token, language]);
  useEffect(() => {
    void refreshMine();
    const i = setInterval(() => void refreshMine(), 5000);
    return () => clearInterval(i);
  }, [saved, language]);
  useEffect(() => {
    if (screen !== "desk") return;
    void refreshStaff();
    const i = setInterval(() => void refreshStaff(), 4000);
    return () => clearInterval(i);
  }, [screen, session, language]);
  const home = () => {
    history.replaceState({}, "", location.pathname);
    setError("");
    setScreen("home");
  };
  async function join(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !topic || !details.trim()) return;
    setBusy(true);
    try {
      const result = await queueApi.join(name, phone, topic, details);
      const all = [...saved, result.token];
      setSaved(all);
      localStorage.setItem(listKey, JSON.stringify(all));
      setToken(result.token);
      setTicket(result);
      history.replaceState({}, "", `${location.pathname}?t=${result.token}`);
      setScreen("ticket");
      setName("");
      setPhone("");
      setDetails("");
      await refreshBoard();
    } catch (x) {
      report(
        x,
        tx(
          "Não foi possível entrar na fila.",
          "No fue posible entrar a la fila."
        )
      );
    } finally {
      setBusy(false);
    }
  }
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const value = await queueApi.login(user, password);
    sessionStorage.setItem(staffSessionKey, value);
      setSession(value);
      setScreen("desk");
      setPassword("");
    } catch {
      setError(
        tx("Usuário ou senha incorretos.", "Usuario o contraseña incorrectos.")
      );
    } finally {
      setBusy(false);
    }
  }
  function next() {
    const item = staff.find((x) => x.status === "waiting");
    if (item) setCallTicket(item);
  }
  const translate = async (item: StaffTicket, target: Lang) => {
    if (!session || !supabase || !item.request_details) return;
    const key = `${item.ticket_code}-${target}`;
    if (translations[key]) return;
    setTranslatingCode(key);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "translate",
        {
          body: { session, text: item.request_details, targetLanguage: target },
        }
      );
      if (invokeError || !data?.translatedText)
        throw new Error(data?.error ?? "Não foi possível traduzir agora.");
      setTranslations((current) => ({
        ...current,
        [key]: data.translatedText,
      }));
    } catch (cause) {
      report(cause, "Não foi possível traduzir agora.");
    } finally {
      setTranslatingCode(null);
    }
  };
  async function confirmCall(messageLanguage: Lang) {
    const item = callTicket;
    if (!session || !item) return;
    setBusy(true);
    try {
      await queueApi.callNext(session);
      const greeting =
        messageLanguage === "es"
          ? `Hola, vamos a iniciar tu atención del código ${item.ticket_code}. Tema: ${displayTopic(item.topic, "es")}.${item.request_details ? ` Mensaje: ${item.request_details}` : ""}`
          : `Olá! Vamos iniciar seu atendimento da senha ${item.ticket_code}. Assunto: ${item.topic}.${item.request_details ? ` Mensagem: ${item.request_details}` : ""}`;
      window.open(
        `https://wa.me/${item.customer_phone}?text=${encodeURIComponent(greeting)}`,
        "_blank",
        "noopener,noreferrer"
      );
      setCallTicket(null);
      await Promise.all([refreshBoard(), refreshStaff()]);
    } catch (e) {
      report(
        e,
        tx(
          "Não foi possível chamar a próxima senha.",
          "No fue posible llamar al próximo código."
        )
      );
    } finally {
      setBusy(false);
    }
  }
  async function complete(id: number) {
    if (!session) return;
    setBusy(true);
    try {
      await queueApi.complete(session, id);
      await Promise.all([refreshBoard(), refreshStaff()]);
    } catch (e) {
      report(
        e,
        tx(
          "Não foi possível finalizar o atendimento.",
          "No fue posible finalizar la atención."
        )
      );
    } finally {
      setBusy(false);
    }
  }
  async function pause() {
    if (!session) return;
    setBusy(true);
    try {
      await queueApi.togglePause(session);
      await Promise.all([refreshBoard(), refreshStaff()]);
    } catch (e) {
      report(
        e,
        tx(
          "Não foi possível alterar a fila.",
          "No fue posible modificar la fila."
        )
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const subjectGrid = document.querySelector<HTMLElement>(".subject-grid");
    if (!subjectGrid || topic !== "Entrega") return;

    const tracker = document.createElement("div");
    tracker.className = "delivery-tracker";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "track-delivery-button";
    button.textContent = tx("Rastrear código", "Rastrear código");
    tracker.append(button);
    subjectGrid.insertAdjacentElement("afterend", tracker);

    const openTracker = () => {
      const modal = document.createElement("div");
      modal.className = "modal-backdrop delivery-modal-backdrop";
      modal.innerHTML = `<section class="call-modal delivery-modal" role="dialog" aria-modal="true" aria-labelledby="tracking-title"><button class="modal-close" aria-label="${tx("Fechar", "Cerrar")}">×</button><p class="section-label">J&T Express</p><h2 id="tracking-title">${tx("Rastrear entrega", "Rastrear entrega")}</h2><p>${tx("Informe o código de rastreio e o CPF/CNPJ usado no pedido.", "Ingresa el código de rastreo y el CPF/CNPJ usado en el pedido.")}</p><label>${tx("Código de rastreio", "Código de rastreo")}<input class="tracking-code-input" autocomplete="off" placeholder="${tx("Digite o código", "Ingresa el código")}" /></label><label>${tx("CPF ou CNPJ", "CPF o CNPJ")}<input class="tracking-document-input" inputmode="numeric" autocomplete="off" placeholder="${tx("Somente números", "Solo números")}" /></label><p class="tracking-api-note">${tx("Acompanhe o status da sua entrega aqui.", "Consulta el estado de tu entrega aquí.")}</p><div class="tracking-result" aria-live="polite"></div><button class="primary-button tracking-submit" type="button">${tx("Rastrear", "Rastrear")}</button></section>`;
      const close = () => modal.remove();
      const input = modal.querySelector<HTMLInputElement>(".tracking-code-input");
      const documentInput = modal.querySelector<HTMLInputElement>(".tracking-document-input");
      const result = modal.querySelector<HTMLElement>(".tracking-result");
      modal.querySelector(".modal-close")?.addEventListener("click", close);
      modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
      modal.querySelector(".tracking-submit")?.addEventListener("click", async () => {
        const code = input?.value.trim();
        const document = documentInput?.value.replace(/\D/g, "") ?? "";
        if (!code || !input) { input?.focus(); return; }
        if (!/^\d{11}(?:\d{3})?$/.test(document)) { documentInput?.focus(); return; }
        if (!supabase) { if (result) result.textContent = tx("Rastreamento indisponível no momento.", "Rastreo no disponible ahora."); return; }
        if (result) result.textContent = tx("Consultando rastreio…", "Consultando rastreo…");
        const { data, error: trackingError } = await supabase.functions.invoke("track-jt", { body: { trackingCode: code, document } });
        if (trackingError || data?.error) { if (result) result.textContent = data?.error ?? tx("Não foi possível consultar o rastreio.", "No fue posible consultar el rastreo."); return; }
        if (result) result.textContent = typeof data?.tracking?.message === "string" ? data.tracking.message : tx("Consulta concluída. Os detalhes estão disponíveis no rastreio da transportadora.", "Consulta completada. Los detalles están disponibles en el rastreo de la transportadora.");
      });
      document.body.append(modal);
      input?.focus();
    };
    button.addEventListener("click", openTracker);
    return () => { button.removeEventListener("click", openTracker); tracker.remove(); };
  }, [topic, language]);
  const selectLanguage = (value: Lang) => setLanguage(value);
  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="logo-button" onClick={home}>
          <Brand />
        </button>
        <div className="topbar-actions">
          <div className="language-switch" aria-label={tx("Idioma", "Idioma")}>
            <button
              className={language === "pt" ? "selected" : ""}
              onClick={() => selectLanguage("pt")}
            >
              PT
            </button>
            <button
              className={language === "es" ? "selected" : ""}
              onClick={() => selectLanguage("es")}
            >
              ES
            </button>
          </div>
          <span className="unit">{tx("Fila WhatsApp", "Fila WhatsApp")}</span>
          <button
            className="outline-button"
            onClick={() => setScreen(session ? "desk" : "login")}
          >
            {tx("Atendimento", "Atención")}
          </button>
        </div>
      </header>
      {error && <p className="app-error">{error}</p>}
      {screen === "home" && (
        <section className="content intro">
          <div className="hero-heading">
            <div className="eyebrow">
              <i />
              {board?.paused
                ? tx("Atendimento pausado", "Atención pausada")
                : tx("WhatsApp aberto", "WhatsApp abierto")}
            </div>
            <p className="queue-caption">
              {board?.waiting_count
                ? tx(
                    `${board.waiting_count} na espera · cerca de ${board.eta_minutes} min`,
                    `${board.waiting_count} en espera · cerca de ${board.eta_minutes} min`
                  )
                : tx("Nenhuma pessoa aguardando", "Nadie está esperando")}
            </p>
            <h1>
              {tx("Fila do", "Fila de")}
              <br />
              <em>WhatsApp</em>
            </h1>
            <p className="intro-copy">
              {tx(
                "Entre na fila, acompanhe sua posição e receba o chamado para continuar o atendimento pelo WhatsApp.",
                "Entra a la fila, sigue tu posición y recibe el aviso para continuar la atención por WhatsApp."
              )}
            </p>
            {mine.length > 0 && (
              <div className="my-tickets">
                <p>{tx("Minhas senhas", "Mis códigos")}</p>
                {mine.map((x) => (
                  <button
                    className="my-ticket-button"
                    key={x.token}
                    onClick={() => {
                      setToken(x.token);
                      setTicket(x);
                      history.replaceState(
                        {},
                        "",
                        `${location.pathname}?t=${x.token}`
                      );
                      setScreen("ticket");
                    }}
                  >
                    {tx("Senha", "Código")} {x.ticket_code}
                    <span>
                      {x.status === "called"
                        ? tx("Sua vez", "Tu turno")
                        : tx(`posição ${x.position}`, `posición ${x.position}`)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <section className="now-card glow-card">
            <p className="section-label">
              {tx("Atendendo agora", "Atendiendo ahora")}
            </p>
            {board?.serving_code ? (
              <>
                <strong>{board.serving_code}</strong>
                <p>
                  {board.serving_name}{" "}
                  <span>· {shownTopic(board.serving_topic ?? "")}</span>
                </p>
              </>
            ) : (
              <>
                <strong className="empty-ticket">—</strong>
                <p>
                  {tx(
                    "Nenhum atendimento em andamento",
                    "No hay atención en curso"
                  )}
                </p>
              </>
            )}
            {waiting.length > 0 && (
              <div className="waiting-preview">
                <p>{tx("Na espera", "En espera")}</p>
                {waiting.map((x, i) => (
                  <div key={x.ticket_code}>
                    <span>
                      {i + 1}. {x.name}
                    </span>
                    <small>
                      {tx("Senha", "Código")} {x.ticket_code} ·{" "}
                      {shownTopic(x.topic)}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </section>
          <form className="join-card" onSubmit={join}>
            <h2>{tx("Entrar no WhatsApp", "Entrar a WhatsApp")}</h2>
            <p>
              {tx(
                "Você receberá um link exclusivo para acompanhar a sua senha.",
                "Recibirás un enlace exclusivo para seguir tu código."
              )}
            </p>
            <label>
              {tx("Seu nome", "Tu nombre")}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={tx("Ex.: Ana", "Ej.: Ana")}
                required
              />
            </label>
            <label className="phone-field">
              {tx("Seu WhatsApp", "Tu WhatsApp")}
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ex.: (45) 98888-8888"
                required
              />
            </label>
            <fieldset>
              <legend>{tx("Assunto", "Tema")}</legend>
              <div className="subject-grid">
                {topics.map((x) => (
                  <button
                    type="button"
                    key={x}
                    className={topic === x ? "selected" : ""}
                    onClick={() => setTopic(x)}
                  >
                    {shownTopic(x)}
                  </button>
                ))}
              </div>
              {(topic === "Pedido" || topic === "Preço") && (
                <p className="site-suggestion">
                  {topic === "Pedido"
                    ? tx(
                        "Se preferir comprar pelo site:",
                        "Si prefieres comprar por el sitio:"
                      )
                    : tx(
                        "Se preferir, pode conferir o preço no site:",
                        "Si prefieres, puedes consultar el precio en el sitio:"
                      )}{" "}
                  <a
                    href="https://www.farmaoriginal.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    www.farmaoriginal.com
                  </a>
                </p>
              )}
            </fieldset>
            {topic && (
              <label className="request-details">
                {tx("Sobre", "Sobre")} {shownTopic(topic).toLowerCase()}
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder={detailExample(topic)}
                  maxLength={400}
                  rows={4}
                  required
                />
              </label>
            )}
            <button
              className="primary-button"
              disabled={busy || board?.paused || !topic || !details.trim()}
            >
              {busy
                ? tx("Entrando…", "Ingresando…")
                : board?.paused
                  ? tx("Fila pausada", "Fila pausada")
                  : tx("Entrar na fila", "Entrar a la fila")}
              <span>→</span>
            </button>
          </form>
        </section>
      )}
      {screen === "ticket" && (
        <section className="content ticket-screen">
          <p className="section-label">Farma Original</p>
          <h1>{tx("Sua senha", "Tu código")}</h1>
          {ticket && (
            <>
              <article className="ticket-card">
                <div className="ticket-brand">
                  <Brand />
                  <span>
                    {ticket.status === "called"
                      ? tx("Sua vez", "Tu turno")
                      : ticket.status === "done"
                        ? tx("Atendido", "Atendido")
                        : tx("Na fila", "En fila")}
                  </span>
                </div>
                <strong>{ticket.ticket_code}</strong>
                <p>
                  {ticket.name} <span>· {shownTopic(ticket.topic)}</span>
                </p>
                <div className="perforation" />
                <dl>
                  <div>
                    <dt>{tx("Posição", "Posición")}</dt>
                    <dd>{ticket.position ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{tx("Espera", "Espera")}</dt>
                    <dd>
                      {ticket.status === "waiting"
                        ? `~${ticket.eta_minutes} min`
                        : ticket.status === "called"
                          ? tx("Agora", "Ahora")
                          : tx("Encerrada", "Finalizada")}
                    </dd>
                  </div>
                </dl>
              </article>
              <p className="ticket-message">
                {ticket.status === "waiting"
                  ? ticket.position === 1
                    ? tx(
                        "Você é o próximo. Deixe o WhatsApp por perto.",
                        "Eres el próximo. Mantén WhatsApp cerca."
                      )
                    : tx(
                        `${(ticket.position ?? 1) - 1} pessoas à sua frente.`,
                        `${(ticket.position ?? 1) - 1} personas delante de ti.`
                      )
                  : ticket.status === "called"
                    ? tx(
                        "É a sua vez. Abra o WhatsApp para continuar.",
                        "Es tu turno. Abre WhatsApp para continuar."
                      )
                    : tx("Atendimento concluído.", "Atención finalizada.")}
              </p>
            </>
          )}
          <button className="back-link" onClick={home}>
            ← {tx("Voltar ao painel", "Volver al panel")}
          </button>
        </section>
      )}
      {screen === "login" && (
        <section className="content login-screen">
          <p className="section-label">
            {tx("Área restrita", "Área restringida")}
          </p>
          <h1>
            {tx("Acesso da", "Acceso del")}
            <br />
            {tx("equipe", "equipo")}
          </h1>
          <form className="join-card login-card" onSubmit={login}>
            <label>
              {tx("Usuário", "Usuario")}
              <input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                required
              />
            </label>
            <label>
              {tx("Senha", "Contraseña")}
              <span className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "◉" : "◌"}
                </button>
              </span>
            </label>
            <button className="primary-button" disabled={busy}>
              {tx("Entrar no atendimento", "Ingresar a atención")}
            </button>
          </form>
          <button className="back-link" onClick={home}>
            ← {tx("Voltar à fila", "Volver a la fila")}
          </button>
        </section>
      )}
      {screen === "desk" && (
        <section className="content desk-screen">
          <div className="desk-heading">
            <div>
              <p className="section-label">
                {tx("Área da equipe", "Área del equipo")}
              </p>
              <h1>{tx("Atendimento", "Atención")}</h1>
            </div>
            <button
              className="logout-button"
              onClick={() => {
                sessionStorage.removeItem(staffSessionKey);
                setSession(null);
                home();
              }}
            >
              {tx("Sair", "Salir")}
            </button>
          </div>
          <div className="desk-actions">
            <button className="outline-button" onClick={pause} disabled={busy}>
              {board?.paused
                ? tx("Reabrir fila", "Reabrir fila")
                : tx("Pausar fila", "Pausar fila")}
            </button>
            {staff.some((x) => x.status === "waiting") ? (
              <button className="primary-button" onClick={next} disabled={busy}>
                {tx("Chamar próximo", "Llamar próximo")} <span>→</span>
              </button>
            ) : (
              <p className="queue-empty-message">
                {tx(
                  "A lista de espera está vazia.",
                  "La lista de espera está vacía."
                )}
              </p>
            )}
          </div>
          <section className="desk-list">
            <h2>{tx("Fila atual", "Fila actual")}</h2>
            {staff.map((x) => {
              const target = language === "pt" ? "es" : "pt";
              const translationKey = `${x.ticket_code}-${target}`;
              return (
                <article key={x.ticket_number}>
                  <b>{x.ticket_code}</b>
                  <span>
                    <strong>{x.name}</strong>
                    <small>
                      {shownTopic(x.topic)} ·{" "}
                      {x.status === "called"
                        ? tx("em conversa", "en conversación")
                        : tx("aguardando", "esperando")}
                    </small>
                    {x.request_details && (
                      <>
                        <small className="request-preview">
                          “{x.request_details}”
                        </small>
                        <button
                          className="translate-button"
                          onClick={() => translate(x, target)}
                          disabled={translatingCode === translationKey}
                        >
                          {translatingCode === translationKey
                            ? tx("Traduzindo…", "Traduciendo…")
                            : translations[translationKey]
                              ? tx("Tradução pronta", "Traducción lista")
                              : tx(
                                  "Traduzir para espanhol",
                                  "Traducir al portugués"
                                )}
                        </button>
                        {translations[translationKey] && (
                          <small className="translation-result">
                            {tx("Tradução", "Traducción")}: “
                            {translations[translationKey]}”
                          </small>
                        )}
                      </>
                    )}
                  </span>
                  {x.status === "called" && (
                    <button
                      className="complete-button"
                      onClick={() => complete(x.ticket_number)}
                    >
                      {tx("Finalizar atendimento", "Finalizar atención")}
                    </button>
                  )}
                </article>
              );
            })}
          </section>
        </section>
      )}
      {callTicket && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="call-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="call-title"
          >
            <button
              className="modal-close"
              aria-label={tx("Fechar", "Cerrar")}
              onClick={() => setCallTicket(null)}
            >
              ×
            </button>
            <p className="section-label">
              {tx("Chamar cliente", "Llamar al cliente")}
            </p>
            <h2 id="call-title">
              {tx("Em qual idioma enviar?", "¿En qué idioma enviar?")}
            </h2>
            <p>
              {tx(
                `Escolha o idioma da mensagem de WhatsApp para ${callTicket.name}.`,
                `Elige el idioma del mensaje de WhatsApp para ${callTicket.name}.`
              )}
            </p>
            <div className="modal-actions">
              <button
                className="outline-button"
                onClick={() => confirmCall("pt")}
                disabled={busy}
              >
                🇧🇷 Português
              </button>
              <button
                className="primary-button"
                onClick={() => confirmCall("es")}
                disabled={busy}
              >
                🇪🇸 Español
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
