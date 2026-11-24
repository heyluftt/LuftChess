import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { SavedEntry } from "../types";
import { fmtPct, fmtSecs } from "../format";
import { gameStats, mean, openingRows, phaseLabel, type GameStat, type Phase } from "../stats";

interface Props {
  username: string;
  onOpen: (entry: SavedEntry) => void;
}

const classLabel: Record<string, string> = { bullet: "Bullet", blitz: "Blitz", rapid: "Schnell", daily: "Täglich" };
const phases: Phase[] = ["eroeffnung", "mittelspiel", "endspiel"];

export function StatsView({ username, onOpen }: Props) {
  const [entries, setEntries] = useState<SavedEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api.savedAll().then(setEntries, (e) => setError(String(e)));
  }, []);

  const all = useMemo(() => (entries ? gameStats(entries, username) : []), [entries, username]);
  const classes = [...new Set(all.map((s) => s.timeClass).filter((c): c is string => !!c))];
  const stats = filter ? all.filter((s) => s.timeClass === filter) : all;

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h2>Statistik</h2>
          <p className="muted">
            {entries ? `${stats.length} analysierte Partien` : "Lädt …"}
          </p>
        </div>
      </header>

      {error && (
        <div className="notice notice--error" role="alert">
          <p>{error}</p>
        </div>
      )}

      {entries && all.length === 0 && (
        <div className="notice">
          <p>Noch keine Analysen von {username}.</p>
        </div>
      )}

      {classes.length > 1 && (
        <div className="chips" role="group" aria-label="Bedenkzeit">
          {["", ...classes].map((c) => (
            <button key={c} className="chip" aria-pressed={filter === c} onClick={() => setFilter(c)}>
              {c ? classLabel[c] ?? c : "Alle"}
            </button>
          ))}
        </div>
      )}

      {stats.length > 0 && (
        <>
          <Figures stats={stats} />
          <section className="block">
            <h3>Genauigkeit im Verlauf</h3>
            <Trend
              stats={stats}
              onOpen={(url) => {
                const e = entries?.find((x) => x.url === url);
                if (e) onOpen(e);
              }}
            />
          </section>
          <section className="block">
            <h3>Fehler pro Partie nach Phase</h3>
            <Phases stats={stats} />
          </section>
          <section className="block">
            <h3>Eröffnungen</h3>
            <Openings stats={stats} />
          </section>
        </>
      )}
    </div>
  );
}

function Figures({ stats }: { stats: GameStat[] }) {
  const errors = stats.reduce((a, s) => a + s.errorCount, 0);
  const trouble = stats.reduce((a, s) => a + s.timeTrouble, 0);
  const spent = stats.map((s) => s.avgSpent).filter((x): x is number => x !== null);
  const items = [
    ["Genauigkeit", `${fmtPct(mean(stats.map((s) => s.accuracy)))} %`],
    ["Punkte", `${Math.round(mean(stats.map((s) => s.score)) * 100)} %`],
    ["Fehler/Partie", fmtPct(errors / stats.length)],
    spent.length
      ? ["Ø Zeit/Zug", fmtSecs(mean(spent))]
      : ["Partien", String(stats.length)],
  ];
  return (
    <section className="block">
      <dl className="figures">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {errors > 0 && trouble > 0 && (
        <p className="muted small">
          {trouble} von {errors} Fehlern in Zeitnot (unter 10 % der Grundzeit).
        </p>
      )}
    </section>
  );
}

function Trend({ stats, onOpen }: { stats: GameStat[]; onOpen: (url: string) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = stats.slice(0, 40).reverse();
  const W = 340;
  const H = 120;
  const pad = 8;
  const lo = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.accuracy)) / 10) * 10);
  const hi = 100;
  const x = (i: number) => (pts.length === 1 ? W / 2 : pad + (i / (pts.length - 1)) * (W - 2 * pad));
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (H - 2 * pad);
  const avg = mean(pts.map((p) => p.accuracy));
  const h = hover !== null ? pts[hover] : null;

  return (
    <div className="trend">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Genauigkeit der letzten ${pts.length} Partien, Mittel ${fmtPct(avg)} %`}
        onPointerLeave={() => setHover(null)}
      >
        {[lo, (lo + hi) / 2, hi].map((v) => (
          <g key={v}>
            <line x1={pad} x2={W - pad} y1={y(v)} y2={y(v)} className="trend-grid" />
            <text x={W - pad} y={y(v) - 3} textAnchor="end" className="trend-tick">
              {v}
            </text>
          </g>
        ))}
        <line x1={pad} x2={W - pad} y1={y(avg)} y2={y(avg)} className="trend-avg" />
        <polyline points={pts.map((p, i) => `${x(i)},${y(p.accuracy)}`).join(" ")} className="trend-line" />
        {pts.map((p, i) => (
          <g key={p.url}>
            <circle cx={x(i)} cy={y(p.accuracy)} r={hover === i ? 4.5 : 3} className={`trend-dot trend-dot--${p.score === 1 ? "win" : p.score === 0 ? "loss" : "draw"}`} />
            <rect
              x={x(i) - W / pts.length / 2}
              y={0}
              width={W / pts.length}
              height={H}
              fill="transparent"
              onPointerEnter={() => setHover(i)}
              onClick={() => onOpen(p.url)}
              style={{ cursor: "pointer" }}
            />
          </g>
        ))}
        {h && hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad} y2={H - pad} className="trend-cross" />}
      </svg>
      <p className="trend-caption muted small">
        {h
          ? `${new Date(h.when * 1000).toLocaleDateString("de-DE", { day: "numeric", month: "short" })} · ${fmtPct(h.accuracy)} % · ${h.score === 1 ? "Sieg" : h.score === 0 ? "Niederlage" : "Remis"}${h.opening ? ` · ${h.opening.split(":")[0]}` : ""}`
          : `Linie: Mittel ${fmtPct(avg)} %. Punkt hell = Sieg, dunkel = Niederlage. Klick öffnet die Partie.`}
      </p>
    </div>
  );
}

function Phases({ stats }: { stats: GameStat[] }) {
  const per = phases.map((p) => ({ p, v: stats.reduce((a, s) => a + s.errors[p], 0) / stats.length }));
  const max = Math.max(0.5, ...per.map((x) => x.v));
  return (
    <ul className="hbars">
      {per.map(({ p, v }) => (
        <li key={p} title={`${phaseLabel[p]}: ${fmtPct(v)} Fehler pro Partie`}>
          <span className="hbar-label">{phaseLabel[p]}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${(v / max) * 100}%` }} />
          </span>
          <span className="hbar-value">{fmtPct(v)}</span>
        </li>
      ))}
    </ul>
  );
}

function Openings({ stats }: { stats: GameStat[] }) {
  const rows = openingRows(stats).slice(0, 8);
  if (!rows.length) return <p className="muted">Keine Eröffnungsdaten.</p>;
  return (
    <table className="otable">
      <thead>
        <tr>
          <th>Eröffnung</th>
          <th>Partien</th>
          <th>Punkte</th>
          <th>Genau.</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.me}${r.name}`}>
            <td>
              <span className={`piece piece--${r.me}`} title={r.me === "white" ? "mit Weiß" : "mit Schwarz"} />
              <span className="otable-name" title={`${r.eco} ${r.name}`}>{r.name}</span>
            </td>
            <td>{r.games}</td>
            <td>{Math.round(r.score)} %</td>
            <td>{fmtPct(r.accuracy)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
