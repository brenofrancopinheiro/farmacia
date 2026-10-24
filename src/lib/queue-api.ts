import { supabase } from "./supabase";

export type QueueBoard = {
  waiting_count: number;
  eta_minutes: number;
  serving_code: string | null;
  serving_name: string | null;
  serving_topic: string | null;
  paused: boolean;
};

export type WaitingTicket = {
  ticket_code: string;
  name: string;
  topic: string;
};

export type CustomerTicket = {
  ticket_number: number;
  ticket_code: string;
  name: string;
  topic: string;
  status: "waiting" | "called" | "done" | "left";
  position: number | null;
  eta_minutes: number;
};

type CustomerTicketResponse = Omit<CustomerTicket, "position"> & {
  queue_position: number | null;
};

export type StaffTicket = {
  ticket_number: number;
  ticket_code: string;
  name: string;
  topic: string;
  request_details: string;
  customer_phone: string;
  status: "waiting" | "called";
  joined_at: string;
  paused: boolean;
};

function client() {
  if (!supabase) throw new Error("Supabase ainda não foi configurado.");
  return supabase;
}

async function rpc<T>(name: string, params: Record<string, unknown> = {}) {
  const { data, error } = await client().rpc(name, params);
  if (error) throw new Error(error.message);
  return data as T;
}

export const queueApi = {
  board: () => rpc<QueueBoard[]>("public_queue_board").then((rows) => rows[0]),
  waiting: () => rpc<WaitingTicket[]>("public_waiting_list"),
  join: (name: string, phone: string, topic: string, details: string) =>
    rpc<Array<CustomerTicket & { token: string }>>("join_queue", {
      p_name: name,
      p_phone: phone,
      p_topic: topic,
      p_details: details,
    }).then((rows) => rows[0]),
  ticket: (token: string) =>
    rpc<CustomerTicketResponse[]>("get_customer_ticket", {
      p_token: token,
    }).then((rows) => {
      const { queue_position, ...ticket } = rows[0];
      return { ...ticket, position: queue_position };
    }),
  login: (username: string, password: string) =>
    rpc<string>("staff_login", { p_username: username, p_password: password }),
  staffBoard: (session: string) =>
    rpc<StaffTicket[]>("staff_board", { p_session: session }),
  callNext: (session: string) =>
    rpc<void>("staff_call_next", { p_session: session }),
  complete: (session: string, ticketNumber: number) =>
    rpc<void>("staff_complete", {
      p_session: session,
      p_ticket_number: ticketNumber,
    }),
  togglePause: (session: string) =>
    rpc<boolean>("staff_toggle_pause", { p_session: session }),
};
