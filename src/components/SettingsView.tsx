import { useState } from "react";
import { api } from "../api";
import type { Settings } from "../types";

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
}

const speed = (d: number) => (d <= 12 ? "schnell, grob" : d <= 16 ? "ausgewogen" : d <= 19 ? "gründlich" : "sehr langsam");

export function SettingsView({ settings, onChange }: Props) {
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<string | null>(null);

  const autoFind = async () => {
    setSearching(true);
    const p = await api.findEngine();
    setSearching(false);
    if (p) onChange({ ...settings, engine: p });
    setFound(p ? "Gefunden." : "Keine stockfish.exe gefunden.");
  };

  return (
    <div className="view">
      <header className="view-head">
        <h2>Optionen</h2>
      </header>

      <label className="field">
        <span className="field-label">Chess.com-Benutzername</span>
        <input
          value={settings.username}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => onChange({ ...settings, username: e.target.value.trim() })}
        />
      </label>

      <label className="field">
        <span className="field-label">Stockfish</span>
        <input
          value={settings.engine}
          placeholder="Pfad zu stockfish.exe"
          spellCheck={false}
          onChange={(e) => onChange({ ...settings, engine: e.target.value })}
        />
        <span className="field-row">
          <button className="btn" type="button" onClick={autoFind} disabled={searching}>
            {searching ? "Sucht …" : "Automatisch suchen"}
          </button>
          {found && <span className="muted">{found}</span>}
        </span>
      </label>

      <label className="field">
        <span className="field-label">
          Rechentiefe <strong>{settings.depth}</strong>
          <span className="muted">{speed(settings.depth)}</span>
        </span>
        <input
          type="range"
          min={10}
          max={22}
          value={settings.depth}
          onChange={(e) => onChange({ ...settings, depth: Number(e.target.value) })}
        />
      </label>

      <label className="toggle">
        <input
          type="checkbox"
          checked={settings.autoAnalyze}
          onChange={(e) => onChange({ ...settings, autoAnalyze: e.target.checked })}
        />
        <span>
          <span className="toggle-label">Neue Partien automatisch analysieren</span>
          <span className="muted small">Pausiert, solange Chess.com eine Spielseite zeigt.</span>
        </span>
      </label>

      <p className="footnote">
        Die Anmeldung bei Chess.com bleibt in der App gespeichert. LuftChess liest deine Partien nur über die
        öffentliche Chess.com-Schnittstelle und analysiert ausschließlich beendete Partien.
      </p>
      <p className="footnote">
        Enthält Stockfish 19 (GPLv3), Quelltext: github.com/official-stockfish/Stockfish
      </p>
    </div>
  );
}
