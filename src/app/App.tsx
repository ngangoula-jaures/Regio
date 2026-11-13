// Regio — application de régie : Démarrage → Sources du jour → Régie.

import { useEffect, useRef, useState } from "react";
import { inTauri } from "../shared/server";
import { useStudio } from "./useStudio";
import { standby } from "./library";
import { ConnectScreen } from "../screens/ConnectScreen";
import { StartupScreen } from "../screens/StartupScreen";
import { SourcesScreen } from "../screens/SourcesScreen";
import { RegieScreen } from "../screens/RegieScreen";
import "./app.css";

type Screen = "startup" | "sources" | "regie";

export default function App() {
  const studio = useStudio();
  const [screen, setScreen] = useState<Screen>("startup");
  const everConnected = useRef(false);
  const regieOpen = useRef(false);

  // Première connexion au moteur : écran d'attente dans la salle, recherche des écrans et des caméras.
  useEffect(() => {
    if (studio.link.kind !== "on" || everConnected.current) return;
    everConnected.current = true;
    studio.show(standby());
    studio.refreshMonitors().catch(() => {});
    studio.detectCameras().catch(() => {});
  }, [studio.link.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mode navigateur (développement) : connexion manuelle tant qu'on n'a jamais été connecté.
  if (!inTauri && !everConnected.current && studio.link.kind !== "on") return <ConnectScreen studio={studio} />;

  // Une fois le culte commencé, la régie reste ouverte (le déroulé garde sa position) ;
  // l'écran des caméras s'affiche alors par-dessus.
  if (!regieOpen.current) {
    if (screen === "startup") return <StartupScreen studio={studio} onNext={() => setScreen("sources")} />;
    if (screen === "sources")
      return (
        <SourcesScreen
          studio={studio}
          onBack={() => setScreen("startup")}
          onStart={() => {
            regieOpen.current = true;
            setScreen("regie");
          }}
        />
      );
  }
  return (
    <>
      <RegieScreen studio={studio} active={screen === "regie"} onSources={() => setScreen("sources")} />
      {screen === "sources" && (
        <div className="overlay">
          <SourcesScreen studio={studio} onBack={() => setScreen("regie")} onStart={() => setScreen("regie")} />
        </div>
      )}
    </>
  );
}
