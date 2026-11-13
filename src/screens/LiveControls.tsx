// Le direct sur Facebook (maquette validée le 2026-11-13) : boutons de l'en-tête, assistant de réglage,
// confirmation (avec le choix d'enregistrer), santé, fin, alertes et vumètre.
// Rouge = UNIQUEMENT « en direct » ; l'or reste au bouton Suivant de la régie.

import { useEffect, useRef, useState } from "react";
import { Modal } from "../components/Modal";
import { ChevronDown, Mic, Radio, X } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { t } from "../i18n";
import { inTauri } from "../shared/server";
import type { Studio } from "../app/useStudio";
import {
  NEEDED,
  formatDuration,
  gbPerHour,
  recommendedQuality,
  recordingsInfo,
  uploadTest,
  type Live,
  type LiveSettings,
  type Quality,
  type Target,
} from "../app/useLive";

const fmt = (n: number, digits = 1) => n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });

// ---------------------------------------------------------------- En-tête

export function LiveHeader(props: { live: Live; blocked?: boolean; onSetup: () => void; onConfirm: () => void; onStop: () => void; healthOpen: boolean; toggleHealth: () => void }) {
  const { live } = props;
  if (!live.loaded) return null;
  if (live.phase === "unset")
    return (
      <button type="button" className="btn live-setup-btn" onClick={props.onSetup}>
        <Radio size={19} strokeWidth={1.9} />
        {t("live.setup")}
      </button>
    );
  if (live.phase === "ready")
    return (
      <div className="live-head">
        <button type="button" className="btn live-target" onClick={props.onSetup} title={t("live.settingsTitle")}>
          <strong>Facebook</strong> · {t(`live.q${live.settings!.quality}`)}
        </button>
        <button type="button" className="btn live-go" onClick={props.onConfirm} disabled={live.restarting || props.blocked} title={props.blocked ? t("regie.rehearsalNoLive") : undefined}>
          <span className="live-dot-static" />
          {t("live.goLive")}
        </button>
      </div>
    );
  const health = live.health;
  return (
    <div className="live-head">
      <span className="live-pill" role="status">
        <span className="live-dot" />
        {live.phase === "starting" ? t("live.starting") : t("live.onAir")}
        {live.phase !== "starting" && <span className="live-time">{formatDuration(live.durationMs)}</span>}
      </span>
      {live.phase === "live" && (
        <button type="button" className={`btn live-health is-${health}`} onClick={props.toggleHealth} aria-expanded={props.healthOpen}>
          <span className="health-dot" />
          {t(health === "good" ? "live.healthGood" : health === "weak" ? "live.healthWeak" : "live.healthCut")}
        </button>
      )}
      <button type="button" className="btn live-end" onClick={props.onStop} disabled={live.phase === "stopping"}>
        {live.phase === "stopping" ? t("live.stopping") : t("live.end")}
      </button>
    </div>
  );
}

export function HealthPanel({ live, onClose }: { live: Live; onClose: () => void }) {
  const h = live.health;
  return (
    <div className="health-panel" role="dialog" aria-label={t("live.healthTitle")}>
      <div className="health-head">
        <strong>{t("live.healthTitle")}</strong>
        <button type="button" className="icon-btn" aria-label={t("live.close")} onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <dl className="health-grid">
        <dt>{t("live.connection")}</dt>
        <dd className={`is-${h}`}>{t(h === "good" ? "live.healthLongGood" : h === "weak" ? "live.healthLongWeak" : "live.healthLongCut")}</dd>
        <dt>{t("live.sent")}</dt>
        <dd>{fmt(live.kbps / 1000)} Mb/s</dd>
        <dt>{t("live.quality")}</dt>
        <dd>{live.settings ? t(`live.q${live.settings.quality}`) : "—"}</dd>
        <dt>{t("live.dropped")}</dt>
        <dd>{live.dropped < 0.05 ? t("live.droppedNone") : `${fmt(live.dropped)} %`}</dd>
        <dt>{t("live.recording")}</dt>
        <dd>{live.recording ? t("live.recordingOn") : t("live.recordingOff")}</dd>
      </dl>
      <p className="note">{t("live.healthHelp")}</p>
    </div>
  );
}

// ---------------------------------------------------------------- Assistant de réglage

export function LiveSetupDialog(props: { initial: LiveSettings | null; onClose: () => void; onDone: (s: LiveSettings) => void }) {
  const [step, setStep] = useState(1);
  const [target, setTarget] = useState<Target>(props.initial?.target ?? "page");
  const [key, setKey] = useState(props.initial?.key ?? "");
  const [showKey, setShowKey] = useState(false);
  const [quality, setQuality] = useState<Quality>(props.initial?.quality ?? "720");
  const [test, setTest] = useState<{ state: "idle" | "running" | "done" | "failed"; mbps?: number; message?: string }>({ state: "idle" });

  const runTest = async () => {
    setTest({ state: "running" });
    try {
      const mbps = await uploadTest();
      setTest({ state: "done", mbps });
      setQuality(recommendedQuality(mbps));
    } catch (e) {
      setTest({ state: "failed", message: String(e instanceof Error ? e.message : e) });
    }
  };
  const canNext = step === 1 || (step === 2 && key.trim().length > 8) || (step === 3 && (test.state === "done" || test.state === "failed"));
  const steps = [t("live.stepWhere"), t("live.stepKey"), t("live.stepTest")];
  const targets: Array<[Target, string, string]> = [
    ["page", t("live.targetPage"), t("live.targetPageHelp")],
    ["profile", t("live.targetProfile"), t("live.targetProfileHelp")],
    ["group", t("live.targetGroup"), t("live.targetGroupHelp")],
  ];
  const qualities: Quality[] = ["480", "720", "1080"];

  return (
    <Modal label={t("live.setup")} width={660} onClose={props.onClose}>
      <div className="modal-head">
        <h2>{t("live.setup")}</h2>
        <button type="button" className="icon-btn" aria-label={t("live.close")} onClick={props.onClose}>
          <X size={18} />
        </button>
      </div>
      <ol className="wizard-steps">
        {steps.map((label, i) => (
          <li key={label} className={step === i + 1 ? "is-current" : step > i + 1 ? "is-done" : ""}>
            <span>{step > i + 1 ? "✓" : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="wizard-body">
          <p className="lead">{t("live.whereQuestion")}</p>
          <div className="choice-grid">
            {targets.map(([id, name, help]) => (
              <button key={id} type="button" className="choice" aria-pressed={target === id} onClick={() => setTarget(id)}>
                <strong>{name}</strong>
                <span>{help}</span>
              </button>
            ))}
          </div>
          <p className="note">{t("live.whereHelp")}</p>
        </div>
      )}

      {step === 2 && (
        <div className="wizard-body">
          <p className="lead">{t("live.keyIntro")}</p>
          <div className="field">
            <label htmlFor="fb-key">{t("live.keyLabel")}</label>
            <div className="key-row">
              <input id="fb-key" className="input mono" type={showKey ? "text" : "password"} value={key} autoComplete="off" spellCheck={false} onChange={(e) => setKey(e.target.value)} />
              <button type="button" className="btn" onClick={() => setShowKey(!showKey)}>
                {showKey ? t("live.hide") : t("live.show")}
              </button>
            </div>
          </div>
          <div className="help-box">
            <strong>{t("live.keyWhere")}</strong>
            <ol>
              <li>{t("live.keyStep1")}</li>
              <li>{t("live.keyStep2")}</li>
              <li>{t("live.keyStep3")}</li>
              <li>{t("live.keyStep4")}</li>
            </ol>
          </div>
          <p className="note">{t("live.keyPrivate")}</p>
        </div>
      )}

      {step === 3 && (
        <div className="wizard-body">
          <p className="lead">{t("live.testIntro")}</p>
          {test.state === "idle" && (
            <button type="button" className="btn btn-lg live-test-btn" onClick={runTest}>
              {t("live.testRun")}
            </button>
          )}
          {test.state === "running" && (
            <div className="import-progress" role="status">
              <span>{t("live.testRunning")}</span>
              <span className="bar indeterminate">
                <span />
              </span>
            </div>
          )}
          {test.state === "done" && test.mbps !== undefined && (
            <p className={`banner ${test.mbps >= NEEDED["480"] ? "banner-ok" : "banner-warn"}`}>
              {test.mbps >= NEEDED["480"]
                ? t("live.testResult", { mbps: fmt(test.mbps), q: t(`live.q${recommendedQuality(test.mbps)}`) })
                : t("live.testTooSlow", { mbps: fmt(test.mbps) })}
            </p>
          )}
          {test.state === "failed" && <p className="banner banner-warn">{t("live.testFailed", { message: test.message ?? "" })}</p>}
          {(test.state === "done" || test.state === "failed") && (
            <div className="choice-grid" role="radiogroup" aria-label={t("live.quality")}>
              {qualities.map((q) => {
                const tooFast = test.state === "done" && test.mbps !== undefined && test.mbps < NEEDED[q] && q !== "480";
                return (
                  <button key={q} type="button" role="radio" className="choice" aria-checked={quality === q} aria-pressed={quality === q} disabled={tooFast} onClick={() => setQuality(q)}>
                    <strong>{t(`live.q${q}`)}</strong>
                    <span>{tooFast ? t("live.qNeeds", { mbps: fmt(NEEDED[q]) }) : t(`live.q${q}Help`)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="modal-actions spread">
        <button type="button" className="btn btn-lg" onClick={() => (step === 1 ? props.onClose() : setStep(step - 1))}>
          {step === 1 ? t("live.cancel") : t("live.back")}
        </button>
        <button
          type="button"
          className="btn btn-lg btn-ivory"
          disabled={!canNext}
          onClick={() => (step < 3 ? setStep(step + 1) : props.onDone({ target, key: key.trim(), quality, record: props.initial?.record ?? false }))}
        >
          {step < 3 ? t("live.next") : t("live.finish")}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Passer en direct / terminer / fin

export function LiveConfirmDialog({ live, onClose, onGo }: { live: Live; onClose: () => void; onGo: () => void }) {
  const s = live.settings!;
  const [free, setFree] = useState<number | null>(null);
  useEffect(() => {
    recordingsInfo().then((r) => setFree(r.freeBytes)).catch(() => {});
  }, []);
  const gb = gbPerHour(s.quality);
  const freeGb = free === null ? null : free / 1e9;
  return (
    <Modal label={t("live.confirmTitle")} width={540} onClose={onClose}>
      <h2>{t("live.confirmTitle")}</h2>
      <ul className="confirm-list">
        <li>{t("live.confirmScreen")}</li>
        <li>{t("live.confirmQuality", { q: t(`live.q${s.quality}`) })}</li>
      </ul>
      <label className="record-choice">
        <input type="checkbox" checked={s.record} onChange={(e) => live.setRecord(e.target.checked)} />
        <span>
          <strong>{t("live.recordAsk")}</strong>
          <small>{freeGb === null ? t("live.recordSizeNoFree", { gb: fmt(gb) }) : t("live.recordSize", { gb: fmt(gb), free: fmt(freeGb, 0) })}</small>
        </span>
      </label>
      {s.record && freeGb !== null && freeGb < gb * 3 && <p className="banner banner-warn">{t("live.recordLow", { free: fmt(freeGb), hours: fmt(freeGb / gb) })}</p>}
      <div className="modal-actions">
        <button type="button" className="btn btn-lg" onClick={onClose}>
          {t("live.cancel")}
        </button>
        <button type="button" className="btn btn-lg btn-live" onClick={onGo}>
          <span className="live-dot-static dark" />
          {t("live.goLive")}
        </button>
      </div>
    </Modal>
  );
}

export function LiveStopDialog({ live, onClose, onStop }: { live: Live; onClose: () => void; onStop: () => void }) {
  return (
    <Modal label={t("live.stopTitle")} width={500} onClose={onClose}>
      <h2>{t("live.stopTitle")}</h2>
      <p className="lead">{live.recording ? t("live.stopTextRec") : t("live.stopText")}</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-lg" onClick={onClose}>
          {t("live.keepGoing")}
        </button>
        <button type="button" className="btn btn-lg btn-ivory" onClick={onStop}>
          {t("live.confirmStop")}
        </button>
      </div>
    </Modal>
  );
}

export function LiveEndedDialog({ live, onClose }: { live: Live; onClose: () => void }) {
  const e = live.ended!;
  return (
    <Modal label={t("live.endedTitle")} width={540} onClose={onClose}>
      <h2>{t("live.endedTitle")}</h2>
      <dl className="health-grid big">
        <dt>{t("live.duration")}</dt>
        <dd>{formatDuration(e.durationMs)}</dd>
        {e.recording && (
          <>
            <dt>{t("live.recording")}</dt>
            <dd className="path">{e.recording}</dd>
          </>
        )}
      </dl>
      <p className="note">{t("live.endedHelp")}</p>
      <div className="modal-actions">
        {e.recording && inTauri && (
          <button type="button" className="btn btn-lg" onClick={() => revealItemInDir(e.recording!).catch(() => {})}>
            {t("live.openFolder")}
          </button>
        )}
        <button type="button" className="btn btn-lg btn-ivory" onClick={onClose}>
          {t("live.close")}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Colonne de droite : alertes + son

export function LiveBanners({ live, fbStep, onFbDone }: { live: Live; fbStep: boolean; onFbDone: () => void }) {
  return (
    <>
      {live.error && (
        <p className="banner banner-error" role="alert">
          <span style={{ flex: 1 }}>{live.error === "refused" ? t("live.errorRefused") : t("live.errorOther", { message: live.error })}</span>
          <button type="button" className="icon-btn" aria-label={t("live.close")} onClick={live.clearError}>
            <X size={15} />
          </button>
        </p>
      )}
      {live.restarting && <p className="banner banner-info">{t("live.restarting")}</p>}
      {fbStep && live.phase === "live" && (
        <div className="fb-step">
          <strong>{t("live.fbStepTitle")}</strong>
          <span>{t("live.fbStepText")}</span>
          <button type="button" className="btn btn-sm" onClick={onFbDone}>
            {t("live.fbStepDone")}
          </button>
        </div>
      )}
      {live.phase === "live" && live.health === "weak" && <p className="banner banner-warn">{t("live.weak")}</p>}
      {live.phase === "live" && live.health === "cut" && (
        <p className="banner banner-warn">
          {t("live.cut")} {live.recording && t("live.cutRec")}
        </p>
      )}
    </>
  );
}

/** Choix de l'entrée son : table de mixage (interface audio USB), micro du PC… — retenu d'un culte à l'autre. */
function SoundInput({ studio }: { studio: Studio }) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<Array<{ id: string; name: string }> | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    studio.controller.listSoundDevices().then(setDevices).catch(() => setDevices([]));
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, studio.controller]);
  const current = studio.sound.id === "default" ? t("live.soundDefault") : (studio.sound.name ?? t("live.soundDefault"));
  return (
    <div className="menu-wrap sound-input" ref={wrap}>
      <button type="button" className="sound-input-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} title={t("live.soundInputHelp")}>
        <Mic size={15} strokeWidth={1.9} />
        <span>
          {t("live.soundInput")} <strong>{current}</strong>
        </span>
        <ChevronDown size={15} strokeWidth={2} />
      </button>
      {open && (
        <div className="menu sound-menu" role="menu" data-own-keys>
          <div className="menu-title">{t("live.soundInputHelp")}</div>
          {devices === null && <div className="menu-title">…</div>}
          {devices?.map((d) => (
            <button
              key={d.id}
              type="button"
              role="menuitemradio"
              aria-checked={studio.sound.id === d.id}
              onClick={() => {
                studio.chooseSound(d.id, d.id === "default" ? t("live.soundDefault") : d.name).catch(() => {});
                setOpen(false);
              }}
            >
              <Mic size={15} strokeWidth={1.75} />
              {d.id === "default" ? t("live.soundDefault") : d.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Vumètre : niveaux envoyés par le moteur vidéo (~20 fois/s), affichés sans faire redessiner la régie. */
export function SoundMeter({ studio }: { studio: Studio }) {
  const left = useRef<HTMLSpanElement>(null);
  const right = useRef<HTMLSpanElement>(null);
  const [silent, setSilent] = useState(false);
  useEffect(() => {
    const ws = studio.controller.ws;
    let lastSound = Date.now();
    let frame = 0;
    let levels: [number, number] = [0, 0];
    // Valeur linéaire → largeur : -60 dB = vide, 0 dB = plein.
    const width = (mul: number) => `${Math.max(0, Math.min(100, ((20 * Math.log10(Math.max(mul, 1e-6)) + 60) / 60) * 100))}%`;
    const draw = () => {
      frame = 0;
      if (left.current) left.current.style.width = width(levels[0]);
      if (right.current) right.current.style.width = width(levels[1]);
    };
    const onMeters = (data: { inputs: Array<{ inputLevelsMul: number[][] }> }) => {
      let l = 0;
      let r = 0;
      for (const input of data.inputs) {
        const ch = input.inputLevelsMul;
        if (!ch?.length) continue;
        l = Math.max(l, ch[0]?.[1] ?? 0); // [magnitude, crête, crête d'entrée] : la crête
        r = Math.max(r, (ch[1] ?? ch[0])?.[1] ?? 0);
      }
      levels = [l, r];
      const now = Date.now();
      if (Math.max(l, r) > 0.003) lastSound = now; // au-dessus de -50 dB : il y a du son
      setSilent(now - lastSound > 5000);
      if (!frame) frame = window.requestAnimationFrame(draw);
    };
    ws.on("InputVolumeMeters", onMeters as never);
    return () => {
      ws.off("InputVolumeMeters", onMeters as never);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [studio.controller]);
  return (
    <div className="sound">
      <div className="screen-cap">
        <strong className="muted">{t("live.sound")}</strong>
        <span className={silent ? "sound-none" : ""}>{silent ? t("live.soundNone") : t("live.soundOk")}</span>
      </div>
      <SoundInput studio={studio} />
      <div className="vu" aria-hidden="true">
        <span>
          <span ref={left} />
        </span>
        <span>
          <span ref={right} />
        </span>
      </div>
    </div>
  );
}
