// Fenêtre (modale) de Regio, et confirmation avant une action qu'on ne peut pas annuler (supprimer…).
// Pendant qu'elle est ouverte, les raccourcis de la régie sont coupés (attribut data-own-keys).

import { useEffect, useRef, type ReactNode } from "react";
import { t } from "../i18n";

export function Modal(props: { label: string; width?: number; children: ReactNode; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("input, button.btn-default, button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="modal-back">
      <div className="modal" role="dialog" aria-modal="true" aria-label={props.label} ref={box} style={{ width: `min(${props.width ?? 560}px, 100%)` }} data-own-keys>
        {props.children}
      </div>
    </div>
  );
}


/**
 * Confirmation : le bouton prêt à l'emploi (focus) est « Annuler » — un appui sur Entrée ou espace par réflexe
 * ne supprime rien.
 */
export function ConfirmDialog(props: { title: string; text: string; confirm: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal label={props.title} width={480} onClose={props.onCancel}>
      <h2>{props.title}</h2>
      <p className="lead">{props.text}</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-lg" onClick={props.onCancel}>
          {t("regie.cancel")}
        </button>
        <button type="button" className="btn btn-lg btn-danger" onClick={props.onConfirm}>
          {props.confirm}
        </button>
      </div>
    </Modal>
  );
}
