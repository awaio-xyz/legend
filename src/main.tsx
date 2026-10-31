import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import App from "./App";
import { Widget } from "./ui/Widget";
import { isWidget } from "./ui/desktop";

// Dev only: echo the webview's errors to the dev server's terminal (see vite.config.ts).
if (import.meta.hot) {
  const send = (message: string) => import.meta.hot!.send("legend:log", { message: message.slice(0, 4000) });
  window.addEventListener("error", (e) => send(`${e.message} at ${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => send(`unhandled: ${e.reason instanceof Error ? e.reason.stack : String(e.reason)}`));
  const error = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    send(args.map((a) => (a instanceof Error ? a.stack : String(a))).join(" "));
    error(...args);
  };
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isWidget() ? <Widget /> : <App />}
  </React.StrictMode>,
);
