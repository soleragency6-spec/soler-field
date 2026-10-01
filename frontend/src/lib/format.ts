export const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  in_progress: "En cours",
  report_review: "Rapport à vérifier",
  report_validated: "Rapport validé",
  invoice_review: "Facture à valider",
  invoiced: "Facturée",
  completed: "Terminée",
  final: "Finalisée",
  validated: "Validé",
  pending: "En attente",
  sent: "Envoyé",
  failed: "Échec",
  accepted: "Accepté",
  refused: "Refusé",
  active: "Actif",
  suspended: "Suspendu",
};

export const STATUS_TONE: Record<string, "success" | "warning" | "info" | "error" | "muted"> = {
  draft: "muted",
  in_progress: "info",
  report_review: "warning",
  report_validated: "success",
  invoice_review: "warning",
  invoiced: "success",
  completed: "success",
  final: "success",
  validated: "success",
  pending: "warning",
  sent: "success",
  failed: "error",
  active: "success",
  suspended: "error",
};

export function statusLabel(s?: string) {
  return (s && STATUS_LABELS[s]) || s || "";
}

export function clientName(c: any): string {
  if (!c) return "Client inconnu";
  const who = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return c.company || who || c.client_company || "Client";
}

export function joinName(company?: string, first?: string, last?: string) {
  const who = [first, last].filter(Boolean).join(" ");
  return company || who || "Client";
}

export function formatMoney(v: any, currency = "EUR") {
  if (v === null || v === undefined) return "À renseigner";
  const n = typeof v === "string" ? parseFloat(v) : v;
  const sym = currency === "EUR" ? "€" : currency;
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sym}`;
}

export function formatDate(d?: string) {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatTime(d?: string) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function formatBytes(b?: number) {
  if (!b) return "0 Mo";
  const go = b / 1024 / 1024 / 1024;
  if (go >= 1) return `${go.toFixed(1)} Go`;
  return `${(b / 1024 / 1024).toFixed(1)} Mo`;
}
