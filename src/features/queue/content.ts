export type Topic = "Pedido" | "Preço" | "Entrega" | "Dúvida";
export type Language = "pt" | "es";

export const topics: Topic[] = ["Pedido", "Preço", "Entrega", "Dúvida"];

const spanishTopics: Record<Topic, string> = {
  Pedido: "Pedido",
  Preço: "Precio",
  Entrega: "Entrega",
  Dúvida: "Consulta",
};

export function displayTopic(topic: string, language: Language) {
  return language === "es" ? (spanishTopics[topic as Topic] ?? topic) : topic;
}

export function detailPlaceholder(topic: Topic, language: Language) {
  const examples: Record<Topic, [string, string]> = {
    Pedido: ["Ex.: Dipirona 2,5 mg, preciso de uma caixa.", "Ej.: Dipirona 2,5 mg, necesito una caja."],
    Preço: ["Ex.: Qual é o preço da dipirona 2,5 mg?", "Ej.: ¿Cuál es el precio de la dipirona 2,5 mg?"],
    Entrega: ["Ex.: Meu pedido ainda não chegou.", "Ej.: Mi pedido aún no ha llegado."],
    Dúvida: ["Ex.: Vocês têm atendimento aos domingos?", "Ej.: ¿Atienden los domingos?"],
  };
  return examples[topic][language === "es" ? 1 : 0];
}
