import React from "react";
import ReactDOM from "react-dom/client";
import "./design/fonts";
import "./design/base.css";
import App from "./app/App";
import { LanguageChooser } from "./screens/LanguageChooser";
import { savedLang } from "./i18n";

// 1er lancement : la langue d'abord (rien d'autre ne démarre côté interface avant ce choix).
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{savedLang() ? <App /> : <LanguageChooser />}</React.StrictMode>,
);
