export function formatMoney(amount) {
  return `$${Math.round(amount).toLocaleString("es-MX")}`;
}

export function formatDateLong(iso) {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long" }).format(new Date(iso));
}

export function formatDateShort(iso) {
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short" }).format(new Date(iso));
}

export function formatDateTime(iso) {
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

export const CATEGORY_ICONS = {
  CFE: "⚡",
  Agua: "💧",
  Gas: "🔥",
  Farmacia: "💊",
  Supermercado: "🛒",
  Vivienda: "🏠",
  Transporte: "🚕",
  Restaurante: "🍽️",
  Transferencia: "↔️",
  Retiro: "🏧",
};

export const STATUS_LABEL_ES = {
  APPROVED: "Aprobado",
  REVIEW: "Revisar",
  BLOCKED: "Bloqueado",
  SCHEDULED: "Programado",
};
