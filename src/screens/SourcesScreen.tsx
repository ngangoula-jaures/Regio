// Écran 2 — Sources du jour : quelles caméras aujourd'hui ? (webcam, caméra HDMI, téléphone par QR code)

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { ArrowRight, Info, Power, Star, Video, VideoOff } from "lucide-react";
import { RegioLockup } from "../components/Logo";
import { longDate, t } from "../i18n";
import { phoneUrl } from "../shared/server";
import { usePolledImage, type Camera, type Studio } from "../app/useStudio";

function CamCard({ studio, cam, isMain, on }: { studio: Studio; cam: Camera; isMain: boolean; on: boolean }) {
  const fetcher = useCallback(() => studio.cameraShot(cam.source), [studio.cameraShot, cam.source]); // eslint-disable-line react-hooks/exhaustive-deps
  const shot = usePolledImage(on ? fetcher : null, 1000);
  const name = cam.kind === "phone" ? t("sources.phoneN", { n: cam.label }) : cam.label;
  // Caméra du PC non utilisée : éteinte, on propose seulement de l'utiliser.
  if (!on)
    return (
      <div className="cam is-off">
        <div className="cam-view">
          <VideoOff size={44} strokeWidth={1.5} />
        </div>
        <div className="cam-row">
          <div>
            <div className="cam-name">{name}</div>
            <div className="cam-detail">{t("sources.offHelp")}</div>
          </div>
          <span className="pill pill-neutral">{t("sources.notUsed")}</span>
        </div>
        <button type="button" className="btn cam-use" onClick={() => studio.setCameraUsed(cam, true)}>
          <Power size={17} strokeWidth={2} />
          {t("sources.useCamera")}
        </button>
      </div>
    );
  return (
    <div className={`cam ${isMain ? "is-main" : ""}`}>
      <button type="button" className="cam-select" aria-pressed={isMain} aria-label={`${name} : ${isMain ? t("sources.main") : t("sources.makeMain")}`} onClick={() => studio.chooseMain(isMain ? null : cam.source)}>
        <span className="cam-view">
          {shot ? <img src={shot} alt="" /> : <Video size={48} strokeWidth={1.5} />}
          {shot && <span className="cam-tag">{t("sources.live")}</span>}
        </span>
        <span className="cam-row">
          <span>
            <span className="cam-name">{name}</span>
            <span className="cam-detail">{cam.kind === "phone" ? t("sources.phoneHelp") : ""}</span>
          </span>
          <span className="pill pill-ok">{cam.kind === "phone" ? t("sources.phoneConnected") : t("sources.ready")}</span>
        </span>
        {isMain ? (
          <span className="cam-main">
            <Star size={18} fill="currentColor" strokeWidth={0} />
            {t("sources.main")}
          </span>
        ) : (
          <span className="cam-make">{t("sources.makeMain")}</span>
        )}
      </button>
      {cam.kind === "device" && (
        <button type="button" className="cam-stop" onClick={() => studio.setCameraUsed(cam, false)}>
          {t("sources.stopUsing")}
        </button>
      )}
    </div>
  );
}

function PhoneCard({ studio, id }: { studio: Studio; id: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const info = studio.server;
  const ip = info?.lanIps[0];
  const url = info && ip && info.phonePort ? phoneUrl(info, ip, id) : null;

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { width: 264, margin: 1, color: { dark: "#0e1530", light: "#f6f2e8" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  return (
    <div className="cam">
      {info && !info.phonePort ? (
        <p className="banner banner-error">{t("sources.phoneUnavailable", { message: info.phoneError ?? "?" })}</p>
      ) : info && !ip ? (
        <p className="banner banner-error">{t("sources.phoneNoWifi")}</p>
      ) : (
        <div className="qr-row">
          <div className="qr">{qr ? <img src={qr} alt={t("sources.qrAlt")} /> : <div style={{ width: 132, height: 132 }} />}</div>
          <ol className="qr-steps">
            <li>{t("sources.phoneStep1")}</li>
            <li>{t("sources.phoneStep2")}</li>
            <li>{t("sources.phoneStep3")}</li>
          </ol>
        </div>
      )}
      <div className="cam-row">
        <div>
          <div className="cam-name">{studio.phoneCams.length ? t("sources.phoneAnother", { n: id }) : t("sources.phoneN", { n: id })}</div>
          <div className="cam-detail">{t("sources.phoneHelp")}</div>
        </div>
        <span className="pill pill-neutral">{t("sources.phoneWaiting")}</span>
      </div>
      <p className="note">{t("sources.phoneFirstTime")}</p>
    </div>
  );
}

export function SourcesScreen({ studio, onBack, onStart }: { studio: Studio; onBack: () => void; onStart: () => void }) {
  // Préparer la réception du téléphone, puis surveiller : nouvelles caméras branchées, téléphone connecté.
  useEffect(() => {
    studio.preparePhones().catch(() => {});
    let alive = true;
    let n = 0;
    const tick = async () => {
      await studio.refreshServer().catch(() => {});
      if (n++ % 3 === 0) await studio.detectCameras().catch(() => {});
      if (alive) window.setTimeout(tick, 2000);
    };
    tick();
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Premier téléphone connecté sans caméra principale : il le devient tout seul.
  const firstPhone = studio.phoneCams[0]?.source;
  useEffect(() => {
    if (firstPhone && !studio.mainCamera) studio.chooseMain(firstPhone).catch(() => {});
  }, [firstPhone, studio.mainCamera]); // eslint-disable-line react-hooks/exhaustive-deps

  const all: Camera[] = [...(studio.cameras ?? []), ...studio.phoneCams];
  const main = all.find((c) => c.source === studio.mainCamera);

  return (
    <div className="sources">
      <header className="topbar">
        <RegioLockup size={34} />
        <span className="topbar-date">{t("common.serviceOf", { date: longDate() })}</span>
      </header>

      <main className="sources-main">
        <div>
          <h1>{t("sources.title")}</h1>
          <p className="sources-sub">{t("sources.subtitle")}</p>
        </div>

        <div className="cams">
          {all.map((c) => (
            <CamCard key={c.source} studio={studio} cam={c} isMain={c.source === studio.mainCamera} on={c.kind === "phone" || studio.camerasOn.includes(c.label)} />
          ))}
          {studio.freePhone && <PhoneCard key={studio.freePhone} studio={studio} id={studio.freePhone} />}
          <div className="cam is-hint">
            <div className="cam-view">
              <Video size={56} strokeWidth={1.25} />
            </div>
            <div>
              <div className="cam-name" style={{ color: "var(--regio-texte-doux)" }}>
                {t("sources.hdmiTitle")}
              </div>
              <div className="cam-detail">{t("sources.hdmiHelp")}</div>
            </div>
          </div>
        </div>

        <p className="banner banner-info">
          <Info size={20} strokeWidth={1.75} style={{ flex: "none" }} />
          {t("sources.tip")}
        </p>
      </main>

      <footer className="bottombar">
        <span className="main-label">
          {t("sources.mainLabel")} <strong>{main ? (main.kind === "phone" ? t("sources.phoneN", { n: main.label }) : main.label) : t("sources.noneMain")}</strong>
        </span>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-lg" onClick={onBack}>
            {t("common.back")}
          </button>
          <button type="button" className="btn btn-primary btn-lg" onClick={onStart}>
            {t("sources.start")}
            <ArrowRight size={20} strokeWidth={2.2} />
          </button>
        </div>
      </footer>
    </div>
  );
}
