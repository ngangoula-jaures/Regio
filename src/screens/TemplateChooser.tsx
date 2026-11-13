// 1er lancement : quel programme préparer ? Regio sert aux églises (son origine) et à tous ceux qui orchestrent
// un direct (streamers, associations…). Le choix ne fait que proposer des moments de départ : tout se modifie ensuite.

import { Church, LayoutList, Radio } from "lucide-react";
import { RegioLockup } from "../components/Logo";
import { t } from "../i18n";
import type { Template } from "../app/library";

export function TemplateChooser({ onChoose }: { onChoose: (tpl: Template) => void }) {
  const choices: Array<{ id: Template; icon: typeof Church; title: string; help: string }> = [
    { id: "service", icon: Church, title: t("templates.service"), help: t("templates.serviceHelp") },
    { id: "show", icon: Radio, title: t("templates.show"), help: t("templates.showHelp") },
    { id: "empty", icon: LayoutList, title: t("templates.empty"), help: t("templates.emptyHelp") },
  ];
  return (
    <div className="startup templates">
      <RegioLockup size={44} />
      <div className="startup-head">
        <h1>{t("templates.title")}</h1>
        <p>{t("templates.subtitle")}</p>
      </div>
      <div className="template-grid">
        {choices.map(({ id, icon: Icon, title, help }) => (
          <button key={id} type="button" className="template-card" onClick={() => onChoose(id)}>
            <Icon size={30} strokeWidth={1.6} />
            <strong>{title}</strong>
            <span>{help}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
