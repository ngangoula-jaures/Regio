// 1er lancement : choisir la langue de Regio AVANT tout le reste (le programme de départ est créé dans cette langue).
// La langue de Windows n'est qu'une suggestion : elle est proposée en premier, jamais imposée.

import { Check, Languages } from "lucide-react";
import { RegioLockup } from "../components/Logo";
import { chooseLang, systemLang, tIn, type Lang } from "../i18n";
import "../app/app.css";

export function LanguageChooser() {
  const order: Lang[] = systemLang === "en" ? ["en", "fr"] : ["fr", "en"];
  const other: Lang = order[1];
  return (
    <div className="startup templates languages">
      <RegioLockup size={44} />
      <div className="startup-head">
        <Languages size={30} strokeWidth={1.6} className="languages-icon" />
        <h1>
          {tIn(systemLang, "language.title")}
          <span lang={other}>{tIn(other, "language.title")}</span>
        </h1>
      </div>
      <div className="template-grid language-grid">
        {order.map((l, i) => (
          <button key={l} type="button" lang={l} className="template-card" autoFocus={i === 0} onClick={() => chooseLang(l)}>
            <strong>{tIn(l, "language.name")}</strong>
            <span>{tIn(l, "language.use")}</span>
            <span className="language-help">{tIn(l, "language.help")}</span>
            {l === systemLang && (
              <span className="language-suggested">
                <Check size={14} strokeWidth={2.4} />
                {tIn(l, "language.suggested")}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
