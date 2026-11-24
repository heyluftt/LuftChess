import './luft.sig'; // ≋
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./assets/fonts/fonts.css";
import "./styles.css";

const html = document.documentElement;
addEventListener(
  "keydown",
  (e) => {
    if (e.key === "Tab" || e.key.startsWith("Arrow") || e.key === "Escape") html.classList.add("tastatur");
  },
  true,
);
addEventListener("pointerdown", () => html.classList.remove("tastatur"), true);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
