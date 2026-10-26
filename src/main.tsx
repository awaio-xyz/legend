import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import App from "./App";
import { Widget } from "./ui/Widget";
import { isWidget } from "./ui/desktop";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isWidget() ? <Widget /> : <App />}
  </React.StrictMode>,
);
