import { api } from "../api";
import {
  IconAnalysis,
  IconArchive,
  IconBack,
  IconLearn,
  IconPlay,
  IconPuzzle,
  IconReload,
  IconSettings,
  IconStats,
  IconTraining,
  Mark,
} from "./Icons";
import type { ReactNode } from "react";

export type PanelView = "games" | "analysis" | "stats" | "training" | "settings";

/** Welcher Leisten-Knopf zu einer Ansicht gehört */
export const viewGroup = (v: PanelView): PanelView => (v === "analysis" ? "games" : v);

const sections: { label: string; path: string; match: RegExp; icon: ReactNode }[] = [
  { label: "Spielen", path: "/play/online", match: /^\/(play|game\/live|live)/, icon: <IconPlay /> },
  { label: "Puzzles", path: "/puzzles/rated", match: /^\/puzzles/, icon: <IconPuzzle /> },
  { label: "Lernen", path: "/lessons", match: /^\/(lessons|learn|courses)/, icon: <IconLearn /> },
  { label: "Archiv", path: "/games/archive", match: /^\/games/, icon: <IconArchive /> },
];

const tools: { view: PanelView; label: string; icon: ReactNode }[] = [
  { view: "games", label: "Analyse", icon: <IconAnalysis /> },
  { view: "stats", label: "Statistik", icon: <IconStats /> },
  { view: "training", label: "Training", icon: <IconTraining /> },
  { view: "settings", label: "Optionen", icon: <IconSettings /> },
];

interface Props {
  chessPath: string;
  panelOpen: boolean;
  view: PanelView;
  onToggle: (view: PanelView) => void;
}

export function Rail({ chessPath, panelOpen, view, onToggle }: Props) {
  return (
    <nav className="rail" aria-label="Navigation">
      <div className="rail-mark" title="LuftChess">
        <Mark />
      </div>

      <div className="rail-group">
        {sections.map((s) => {
          const active = s.match.test(chessPath);
          return (
            <button
              key={s.path}
              className="rail-btn"
              aria-current={active ? "page" : undefined}
              onClick={() => api.go(s.path)}
            >
              {s.icon}
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      <div className="rail-spacer" />

      <div className="rail-group rail-group--tools">
        <button className="rail-icon" title="Zurück" aria-label="Zurück" onClick={() => api.action("back")}>
          <IconBack />
        </button>
        <button className="rail-icon" title="Neu laden" aria-label="Neu laden" onClick={() => api.action("reload")}>
          <IconReload />
        </button>
      </div>

      <div className="rail-group">
        {tools.map((t) => (
          <button
            key={t.view}
            className="rail-btn"
            aria-pressed={panelOpen && viewGroup(view) === t.view}
            onClick={() => onToggle(t.view)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
