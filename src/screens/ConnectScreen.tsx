// Mode navigateur (développement) uniquement : connexion manuelle à un OBS déjà ouvert.
// L'application de bureau, elle, démarre et connecte son moteur vidéo toute seule.

import { useState } from "react";
import { RegioLockup } from "../components/Logo";
import { t } from "../i18n";
import { loadBrowserSettings, type Studio } from "../app/useStudio";

export function ConnectScreen({ studio }: { studio: Studio }) {
  const [s, setS] = useState(loadBrowserSettings);
  const busy = studio.link.kind === "connecting";
  return (
    <div className="connect">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          studio.connect(s);
        }}
      >
        <RegioLockup />
        <h1 style={{ fontSize: 22 }}>{t("connect.title")}</h1>
        <p className="muted">{t("connect.help")}</p>
        <div className="connect-grid">
          <div className="field">
            <label htmlFor="host">{t("connect.host")}</label>
            <input id="host" className="input" value={s.host} onChange={(e) => setS({ ...s, host: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="port">{t("connect.port")}</label>
            <input id="port" className="input" type="number" value={s.port} onChange={(e) => setS({ ...s, port: Number(e.target.value) })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="password">{t("connect.password")}</label>
          <input id="password" className="input" type="password" value={s.password} onChange={(e) => setS({ ...s, password: e.target.value })} />
        </div>
        {studio.link.kind === "error" && <p className="banner banner-error">{t("connect.failed", { message: studio.link.message })}</p>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? t("connect.connecting") : t("connect.submit")}
        </button>
      </form>
    </div>
  );
}
