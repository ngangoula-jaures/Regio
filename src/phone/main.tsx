import React from "react";
import ReactDOM from "react-dom/client";
import "../design/fonts";
import Phone from "./Phone";
import "./phone.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Phone />
  </React.StrictMode>,
);
