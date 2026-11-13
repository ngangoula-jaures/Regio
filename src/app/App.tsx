// Regio — application de régie : Démarrage → Sources du jour → Régie.

import { useEffect, useRef, useState } from "react";
import { inTauri } from "../shared/server";
import { useStudio } from "./useStudio";
import { standby } from "./plan";
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

  if (screen === "startup") return <StartupScreen studio={studio} onNext={() => setScreen("sources")} />;
  if (screen === "sources") return <SourcesScreen studio={studio} onBack={() => setScreen("startup")} onStart={() => setScreen("regie")} />;
  return <RegieScreen studio={studio} />;
}
