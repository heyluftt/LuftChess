import { useEffect, useState } from "react";
import { inTauri } from "../api";
import { Mark } from "./Icons";

type Win = import("@tauri-apps/api/window").Window;

export function TitleBar() {
  const [win, setWin] = useState<Win | null>(null);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!inTauri) return;
    let off: (() => void) | undefined;
    import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const w = getCurrentWindow();
      setWin(w);
      const check = async () => setMaximized(await w.isMaximized());
      off = await w.onResized(check);
      check();
    });
    const blur = () => document.documentElement.classList.add("inaktiv");
    const focus = () => document.documentElement.classList.remove("inaktiv");
    addEventListener("blur", blur);
    addEventListener("focus", focus);
    return () => {
      off?.();
      removeEventListener("blur", blur);
      removeEventListener("focus", focus);
    };
  }, []);

  return (
    <header className="titlebar">
      <div className="tb-drag" data-tauri-drag-region onDoubleClick={() => win?.toggleMaximize()}>
        <span className="tb-mark" data-tauri-drag-region>
          <Mark />
        </span>
        <span className="tb-name" data-tauri-drag-region>
          LuftChess
        </span>
      </div>
      <div className="tb-buttons">
        <button
          aria-label="Minimieren"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            win?.minimize();
          }}
        >
          <svg viewBox="0 0 10 10">
            <path d="M1 5h8" />
          </svg>
        </button>
        <button aria-label={maximized ? "Wiederherstellen" : "Maximieren"} tabIndex={-1} onClick={() => win?.toggleMaximize()}>
          {maximized ? (
            <svg viewBox="0 0 10 10">
              <rect x="1.5" y="3" width="5.5" height="5.5" />
              <path d="M3 3V1.5h5.5V7H7" />
            </svg>
          ) : (
            <svg viewBox="0 0 10 10">
              <rect x="1.5" y="1.5" width="7" height="7" />
            </svg>
          )}
        </button>
        <button className="tb-close" aria-label="Schließen" tabIndex={-1} onClick={() => win?.close()}>
          <svg viewBox="0 0 10 10">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
          </svg>
        </button>
      </div>
    </header>
  );
}
