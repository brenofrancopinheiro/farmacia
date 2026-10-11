import { FormEvent, useEffect, useState } from "react";
import { queueApi, type CustomerTicket, type QueueBoard, type StaffTicket, type WaitingTicket } from "./lib/queue-api";
import { supabaseConfigured } from "./lib/supabase";
import "./login.css";
import "./ticket-shortcut.css";
import "./waiting-preview.css";
import "./brand-logo.css";
import "./phone-field.css";

type Topic = "Pedido" | "Preço" | "Entrega" | "Dúvida";
type Screen = "home" | "ticket" | "login" | "desk";
const subjects: Topic[] = ["Pedido", "Preço", "Entrega", "Dúvida"];
const fmt = (number: number) => String(number).padStart(2, "0");
const pharmacyPhone = (topic: string) => topic === "Entrega" ? "595993470245" : "5545988219778";
const customerMessage = (ticketNumber: number, topic: string, details: string) => `Olá! Vamos iniciar seu atendimento da senha ${fmt(ticketNumber)}. Assunto: ${topic}.${details ? ` Mensagem: ${details}` : ""}`;
const ticketStorageKey = "farma-last-ticket";
const ticketListStorageKey = "farma-ticket-list";
const storedTokens = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(ticketListStorageKey) ?? "[]");
    if (Array.isArray(stored) && stored.every((item) => typeof item === "string")) return stored as string[];
  } catch { /* use the older saved-ticket format below */ }
  const olderToken = localStorage.getItem(ticketStorageKey);
  return olderToken ? [olderToken] : [];
};
const initialToken = () => new URLSearchParams(window.location.search).get("t") ?? storedTokens().at(-1) ?? null;
type SavedTicket = CustomerTicket & { token: string };
function Brand() { return <img className="brand-logo" src="/farma-logo.png" alt="Farma Original" />; }

export default function App() {
  const [token, setToken] = useState<string | null>(initialToken());
  const [ticketTokens, setTicketTokens] = useState<string[]>(storedTokens);
  const [myTickets, setMyTickets] = useState<SavedTicket[]>([]);
  const [screen, setScreen] = useState<Screen>(() => new URLSearchParams(window.location.search).get("t") ? "ticket" : "home");
  const [board, setBoard] = useState<QueueBoard>();
  const [waitingTickets, setWaitingTickets] = useState<WaitingTicket[]>([]);
  const [ticket, setTicket] = useState<CustomerTicket>();
  const [session, setSession] = useState<string | null>(() => sessionStorage.getItem("farma-staff-session"));
  const [staffTickets, setStaffTickets] = useState<StaffTicket[]>([]);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [topic, setTopic] = useState<Topic | null>(null); const [details, setDetails] = useState("");
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const report = (cause: unknown, fallback: string) => setError(cause instanceof Error ? cause.message : fallback);
  const refreshBoard = async () => { if (!supabaseConfigured) return; try { const [nextBoard, nextWaiting] = await Promise.all([queueApi.board(), queueApi.waiting()]); setBoard(nextBoard); setWaitingTickets(nextWaiting); } catch (cause) { report(cause, "Não foi possível atualizar a fila."); } };
  const refreshTicket = async (value = token) => { if (!value || !supabaseConfigured) return; try { setTicket(await queueApi.ticket(value)); } catch (cause) { report(cause, "Senha não encontrada."); } };
  const refreshStaff = async (value = session) => { if (!value || !supabaseConfigured) return; try { setStaffTickets(await queueApi.staffBoard(value)); } catch (cause) { report(cause, "Sessão expirada."); } };
  const refreshMyTickets = async () => {
    if (!supabaseConfigured || ticketTokens.length === 0) { setMyTickets([]); return; }
    const loaded = await Promise.all(ticketTokens.map(async (savedToken) => {
      try { return { token: savedToken, ...(await queueApi.ticket(savedToken)) }; } catch { return null; }
    }));
    setMyTickets(loaded.filter((item): item is SavedTicket => item !== null && (item.status === "waiting" || item.status === "called")));
  };
  useEffect(() => { void refreshBoard(); const id = window.setInterval(() => void refreshBoard(), 5000); return () => window.clearInterval(id); }, []);
  useEffect(() => { if (!token) return; void refreshTicket(); const id = window.setInterval(() => void refreshTicket(), 5000); return () => window.clearInterval(id); }, [token]);
  useEffect(() => { void refreshMyTickets(); const id = window.setInterval(() => void refreshMyTickets(), 5000); return () => window.clearInterval(id); }, [ticketTokens]);
  useEffect(() => {
    const linkToken = new URLSearchParams(window.location.search).get("t");
    if (linkToken && !ticketTokens.includes(linkToken)) {
      const updated = [...ticketTokens, linkToken];
      setTicketTokens(updated); localStorage.setItem(ticketListStorageKey, JSON.stringify(updated));
    }
  }, []);
  useEffect(() => { if (screen !== "desk") return; void refreshStaff(); const id = window.setInterval(() => void refreshStaff(), 4000); return () => window.clearInterval(id); }, [screen, session]);
  useEffect(() => { if (screen !== "home") return; const nameInput = document.querySelector<HTMLInputElement>('input[placeholder="Ex.: Ana"]'); if (!nameInput || document.querySelector(".phone-field")) return; const label = document.createElement("label"); label.className = "phone-field"; label.textContent = "Seu WhatsApp"; const input = document.createElement("input"); input.type = "tel"; input.inputMode = "tel"; input.placeholder = "Ex.: (45) 98888-8888"; input.maxLength = 20; input.required = true; input.value = phone; input.addEventListener("input", () => setPhone(input.value)); label.append(input); nameInput.closest("label")?.after(label); }, [screen, name, phone]);
  function home() { window.history.replaceState({}, "", window.location.pathname); setError(""); setScreen("home"); }
  async function join(event: FormEvent) { event.preventDefault(); if (!name.trim() || !phone.trim() || !topic) return; setBusy(true); setError(""); try { const result = await queueApi.join(name.trim(), phone.trim(), topic, details.trim()); const updated = [...ticketTokens, result.token]; setToken(result.token); setTicketTokens(updated); localStorage.setItem(ticketListStorageKey, JSON.stringify(updated)); localStorage.setItem(ticketStorageKey, result.token); setTicket(result); window.history.replaceState({}, "", `${window.location.pathname}?t=${result.token}`); setName(""); setPhone(""); setDetails(""); setScreen("ticket"); await refreshBoard(); } catch (cause) { report(cause, "Não foi possível entrar na fila."); } finally { setBusy(false); } }
  async function login(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { const value = await queueApi.login(username, password); sessionStorage.setItem("farma-staff-session", value); setSession(value); setPassword(""); setScreen("desk"); } catch { setError("Usuário ou senha incorretos."); } finally { setBusy(false); } }
  async function next() { if (!session) return; const nextTicket = staffTickets.find((item) => item.status === "waiting"); if (!nextTicket) return; setBusy(true); setError(""); try { await queueApi.callNext(session); window.open(`https://wa.me/${nextTicket.customer_phone}?text=${encodeURIComponent(customerMessage(nextTicket.ticket_number, nextTicket.topic, nextTicket.request_details))}`, "_blank", "noopener,noreferrer"); await Promise.all([refreshBoard(), refreshStaff()]); } catch (cause) { report(cause, "Não foi possível chamar a próxima senha."); } finally { setBusy(false); } }
  async function complete(ticketNumber: number) { if (!session) return; setBusy(true); setError(""); try { await queueApi.complete(session, ticketNumber); await Promise.all([refreshBoard(), refreshStaff()]); } catch (cause) { report(cause, "Não foi possível finalizar o atendimento."); } finally { setBusy(false); } }
  async function pause() { if (!session) return; setBusy(true); setError(""); try { await queueApi.togglePause(session); await Promise.all([refreshBoard(), refreshStaff()]); } catch (cause) { report(cause, "Não foi possível alterar a fila."); } finally { setBusy(false); } }
  const waiting = board?.waiting_count ?? 0; const paused = board?.paused ?? false;
  return <main className="app-shell">
    <header className="topbar"><button className="logo-button" onClick={home} aria-label="Voltar ao início"><Brand /></button><div className="topbar-actions"><span className="unit">Fila WhatsApp</span><button className="outline-button" onClick={() => screen === "desk" ? home() : setScreen(session ? "desk" : "login")}>{screen === "desk" ? "Ver fila" : "Atendimento"}</button></div></header>
    {!supabaseConfigured && <p className="setup-warning">Configure o arquivo <code>.env.local</code> para ativar a fila.</p>}{error && <p className="app-error">{error}</p>}
    {screen === "home" && <section className="content intro"><div className="hero-heading"><div className="eyebrow"><i />{paused ? "Atendimento pausado" : "WhatsApp aberto"}</div><p className="queue-caption">{waiting ? `${waiting} na espera · cerca de ${board?.eta_minutes ?? 0} min` : "Nenhuma pessoa aguardando"}</p><h1>Fila do<br /><em>WhatsApp</em></h1><p className="tagline">CUIDAR DE VOCÊ, SEMPRE.</p><p className="intro-copy">Entre na fila, acompanhe sua posição e receba o chamado para continuar o atendimento pelo WhatsApp.</p>{myTickets.length > 0 && <div className="my-tickets"><p>Minhas senhas</p>{myTickets.map((item) => <button className="my-ticket-button" key={item.token} onClick={() => { setToken(item.token); setTicket(item); window.history.replaceState({}, "", `${window.location.pathname}?t=${item.token}`); setScreen("ticket"); }}>Senha {fmt(item.ticket_number)} <span>{item.status === "called" ? "Sua vez" : `posição ${item.position}`}</span></button>)}</div>}</div><section className="now-card glow-card"><p className="section-label">Atendendo agora</p>{board?.serving_number ? <><strong>{fmt(board.serving_number)}</strong><p>{board.serving_name} <span>· {board.serving_topic}</span></p></> : <><strong className="empty-ticket">—</strong><p>Nenhum atendimento em andamento</p></>}{waitingTickets.length > 0 && <div className="waiting-preview"><p>Na espera</p>{waitingTickets.map((item, index) => <div key={item.ticket_number}><span>{index + 1}. {item.name}</span><small>Senha {fmt(item.ticket_number)} · {item.topic}</small></div>)}</div>}<div className="orb orb-one" /><div className="orb orb-two" /></section><form className="join-card" onSubmit={join}><h2>Entrar no WhatsApp</h2><p>Você receberá um link exclusivo para acompanhar a sua senha.</p><label>Seu nome<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Ana" maxLength={24} required /></label><fieldset><legend>Assunto</legend><div className="subject-grid">{subjects.map((item) => <button type="button" key={item} className={topic === item ? "selected" : ""} onClick={() => setTopic(item)}>{item}</button>)}</div></fieldset>{topic && <label className="request-details">Sobre {topic.toLowerCase()}<textarea value={details} onChange={(event) => setDetails(event.target.value)} placeholder={topic === "Pedido" ? "Ex.: 1 caixa de dipirona 500 mg" : topic === "Preço" ? "Ex.: Qual o valor do medicamento?" : topic === "Entrega" ? "Ex.: Gostaria de saber o prazo de entrega" : "Escreva sua dúvida"} maxLength={400} rows={4} /><small>{details.length}/400</small></label>}<button className="primary-button" disabled={paused || busy || !supabaseConfigured || !topic}>{busy ? "Entrando…" : paused ? "Fila pausada" : "Entrar na fila"}<span>→</span></button></form><p className="privacy-note">Sua posição é privada — somente você vê os dados da sua senha.</p></section>}
    {screen === "ticket" && <section className="content ticket-screen"><p className="section-label">Farma Original</p><h1>Sua senha</h1>{ticket ? <><article className={ticket.status === "called" ? "ticket-card called-ticket" : "ticket-card"}><div className="ticket-brand"><Brand /><span>{ticket.status === "called" ? "Sua vez" : ticket.status === "done" ? "Atendido" : "Na fila"}</span></div><strong>{fmt(ticket.ticket_number)}</strong><p>{ticket.name} <span>· {ticket.topic}</span></p><div className="perforation" /><dl><div><dt>Posição</dt><dd>{ticket.position ?? "—"}</dd></div><div><dt>Espera</dt><dd>{ticket.status === "waiting" ? `~${ticket.eta_minutes} min` : ticket.status === "called" ? "Agora" : "Encerrada"}</dd></div></dl></article><p className="ticket-message">{ticket.status === "called" ? "É a sua vez. Abra o WhatsApp para continuar." : ticket.status === "waiting" ? ticket.position === 1 ? "Você é o próximo. Deixe o WhatsApp por perto." : `${(ticket.position ?? 1) - 1} pessoas à sua frente.` : "Atendimento concluído. Estamos à disposição."}</p>{ticket.status === "called" && <a className="primary-button whatsapp" href={`https://wa.me/?text=${encodeURIComponent(`Olá! Sou ${ticket.name}, senha ${fmt(ticket.ticket_number)}.`)}`} target="_blank" rel="noreferrer">◔ Abrir WhatsApp</a>}</> : <p className="ticket-message">Carregando sua senha…</p>}<button className="back-link" onClick={home}>← Voltar ao painel</button></section>}
    {screen === "login" && <section className="content login-screen"><p className="section-label">Área restrita</p><h1>Acesso da<br />equipe</h1><p className="desk-copy">Entre com as credenciais fornecidas pela responsável da farmácia.</p><form className="join-card login-card" onSubmit={login}><label>Usuário<input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Seu usuário" required /></label><label>Senha<span className="password-field"><input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} placeholder="Sua senha" required /><button type="button" className="password-toggle" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "◉" : "◌"}</button></span></label><button className="primary-button" disabled={busy || !supabaseConfigured}>{busy ? "Entrando…" : "Entrar no atendimento"}<span>→</span></button></form><button className="back-link" onClick={home}>← Voltar à fila</button></section>}
    {screen === "desk" && <section className="content desk-screen"><div className="desk-heading"><div><p className="section-label">Área da equipe</p><h1>Atendimento</h1></div><button className="logout-button" onClick={() => { sessionStorage.removeItem("farma-staff-session"); setSession(null); home(); }}>Sair</button></div><p className="desk-copy">Painel sincronizado com a fila dos clientes.</p><div className="desk-actions"><button className="outline-button" onClick={pause} disabled={busy}>{paused ? "Reabrir fila" : "Pausar fila"}</button>{staffTickets.some((item) => item.status === "waiting") ? <button className="primary-button" onClick={next} disabled={busy}>{busy ? "Atualizando…" : "Chamar próximo"}<span>→</span></button> : <p className="queue-empty-message">A lista de espera está vazia.</p>}</div><div className="stats"><div><span>Esperando</span><strong>{staffTickets.filter((item) => item.status === "waiting").length}</strong></div><div><span>Em conversa</span><strong>{staffTickets.filter((item) => item.status === "called").length}</strong></div><div><span>Espera média</span><strong>{board?.eta_minutes ?? "—"}<small>{board ? " min" : ""}</small></strong></div></div><section className="desk-list"><h2>Fila atual</h2>{staffTickets.length ? staffTickets.map((item) => <article key={item.ticket_number}><b>{fmt(item.ticket_number)}</b><span><strong>{item.name}</strong><small>{item.topic} · {item.status === "called" ? "em conversa" : "aguardando"}</small>{item.request_details && <small className="request-preview">“{item.request_details}”</small>}</span>{item.status === "called" && <button className="complete-button" onClick={() => complete(item.ticket_number)} disabled={busy}>Finalizar atendimento</button>}</article>) : <p>Ninguém aguardando no momento.</p>}</section></section>}
  </main>;
}
