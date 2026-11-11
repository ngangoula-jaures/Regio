import React from "react";
import ReactDOM from "react-dom/client";
import Render from "./Render";
import "./render.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Render />
  </React.StrictMode>,
);
