// Écran de démarrage : « Une nouvelle version de Regio est disponible ». Proposée, jamais imposée.

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { t } from "../i18n";
import { findUpdate, installUpdate, type Update } from "../shared/updates";

type Phase = { kind: "offer" } | { kind: "busy"; progress: number | null } | { kind: "error" };

export function UpdateCard() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "offer" });
  const [later, setLater] = useState(false);

  useEffect(() => {
    let alive = true;
    findUpdate().then((u) => alive && setUpdate(u));
    return () => {
      alive = false;
    };
  }, []);

  if (!update || later) return null;

  const install = async () => {
    setPhase({ kind: "busy", progress: 0 });
    try {
      await installUpdate(update, (p) => setPhase({ kind: "busy", progress: p }));
    } catch {
      setPhase({ kind: "error" });
    }
  };

  const busy = phase.kind === "busy";
  const percent = busy && phase.progress !== null ? Math.round(phase.progress * 100) : null;
  return (
    <section className="update-card card" role="status" aria-live="polite">
      <Download size={22} strokeWidth={1.8} />
      <div className="update-text">
        <strong>{t("updates.title", { version: update.version })}</strong>
        <span>
          {phase.kind === "error"
            ? t("updates.error")
            : busy
              ? percent !== null && percent < 100
                ? t("updates.downloading", { percent })
                : t("updates.installing")
              : t("updates.help")}
        </span>
        {busy && (
          <span className="update-bar" aria-hidden="true">
            <span style={{ width: `${percent ?? 100}%` }} />
          </span>
        )}
      </div>
      {!busy && (
        <div className="update-actions">
          <button type="button" className="btn btn-sm" onClick={install}>
            {phase.kind === "error" ? t("updates.retry") : t("updates.install")}
          </button>
          <button type="button" className="btn btn-sm btn-quiet" onClick={() => setLater(true)}>
            {t("updates.later")}
          </button>
        </div>
      )}
    </section>
  );
}
