// Une ligne d'état : icône (prêt / en cours / attention / erreur / à venir), titre, détail.

import { AlertTriangle, Check, Circle, Loader2, X } from "lucide-react";

export type RowState = "ok" | "busy" | "warn" | "error" | "idle";

const ICON = {
  ok: <Check size={16} strokeWidth={2.4} />,
  busy: <Loader2 size={16} strokeWidth={2.2} className="spin" />,
  warn: <AlertTriangle size={15} strokeWidth={2.2} />,
  error: <X size={16} strokeWidth={2.4} />,
  idle: <Circle size={14} strokeWidth={1.75} />,
};

export function StatusRow({ state, title, detail }: { state: RowState; title: string; detail: string }) {
  return (
    <li className={`status-row status-${state}`}>
      <span className="status-icon">{ICON[state]}</span>
      <span className="status-text">
        <span className="status-title">{title}</span>
        <span className="status-detail">{detail}</span>
      </span>
    </li>
  );
}
