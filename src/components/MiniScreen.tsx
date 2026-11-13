// Aperçu réduit d'un contenu (vignettes, « Ensuite ») : même mise en page que la sortie projetée,
// à l'échelle de son cadre. `camera` = dernière image de la caméra principale, si disponible.

import { Video } from "lucide-react";
import type { Content } from "../shared/content";

export function MiniScreen({ content, camera }: { content: Content; camera?: string | null }) {
  const showsCamera = content.kind === "none" || (content.kind !== "image" && content.kind !== "slides" && content.kind !== "standby" && content.layout === "lower");
  return (
    <div className="mini" aria-hidden="true">
      {showsCamera && (camera ? <img className="mini-cam" src={camera} alt="" /> : <div className="mini-nocam"><Video strokeWidth={1.5} /></div>)}
      {content.kind === "verse" && content.layout === "lower" && (
        <div className="mini-lower">
          <div className="mini-ref">{content.reference.toUpperCase()}</div>
          <div className="mini-body scripture">{content.text}</div>
        </div>
      )}
      {content.kind === "verse" && content.layout === "full" && (
        <div className="mini-full">
          <div className="mini-body scripture">{content.text}</div>
          <div className="mini-ref">{`${content.reference} · ${content.version}`.toUpperCase()}</div>
        </div>
      )}
      {content.kind === "text" && content.layout === "lower" && (
        <div className="mini-lower">
          <div className="mini-ref">{content.title.toUpperCase()}</div>
          <div className="mini-body">{content.body}</div>
        </div>
      )}
      {content.kind === "text" && content.layout === "full" && (
        <div className="mini-full">
          <div className="mini-title">{content.title}</div>
          <div className="mini-body">{content.body}</div>
        </div>
      )}
      {content.kind === "image" && (
        <div className="mini-image">
          <img src={content.src} alt="" />
        </div>
      )}
      {content.kind === "slides" && (
        <div className="mini-image">
          <img src={content.slides[content.index]} alt="" />
        </div>
      )}
      {content.kind === "standby" && (
        <div className="mini-full">
          <div className="mini-title">{content.title}</div>
          <div className="mini-body">{content.subtitle}</div>
        </div>
      )}
    </div>
  );
}
