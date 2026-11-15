import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { Game, MoveReport, Quality, Report, Score } from "../types";
import { deSan, fmtClock, fmtPct, fmtScore, fmtSecs, moveLabel, outcomeFor, qualityLabel, winPct } from "../format";
import { GameStrip } from "./GameStrip";
import { Board } from "./Board";
import { QualityBadge } from "./QualityBadge";
import { IconBack, IconExternal } from "./Icons";

interface Props {
  game: Game;
  username: string;
  report: Report | null;
  progress: { done: number; total: number } | null;
  error: string | null;
  engineMissing: boolean;
  engineFolder: string | null;
  onBack: () => void;
  onRetry: () => void;
  onSettings: () => void;
}

/** Reihenfolge in der Übersicht, gut nach schlecht */
const order: Quality[] = ["grossartig", "best", "exzellent", "gut", "buch", "ungenau", "fehler", "verpasst", "patzer"];
/** Züge, bei denen es keinen besseren gab */
const top = new Set<Quality>(["grossartig", "best", "buch"]);
const bad = new Set<Quality>(["ungenau", "fehler", "verpasst", "patzer"]);

/** "ist ein Fehler", "ist der beste Zug" … */
const verdict: Record<Quality, string> = {
  grossartig: "ist großartig, der einzige gute Zug",
  best: "ist der beste Zug",
  exzellent: "ist exzellent",
  gut: "ist gut",
  buch: "ist Eröffnungstheorie",
  ungenau: "ist ungenau",
  fehler: "ist ein Fehler",
  verpasst: "verpasst eine Chance",
  patzer: "ist ein Patzer",
};

export function AnalysisView(p: Props) {
  const { game, username, report } = p;
  const { me } = outcomeFor(game, username);
  const opp = me === "white" ? "black" : "white";
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => setSelected(null), [report]);

  const isMine = (m: MoveReport) => (m.white ? "white" : "black") === me;
  const counts = useMemo(() => {
    const c = { white: {} as Record<string, number>, black: {} as Record<string, number> };
    report?.moves.forEach((m) => {
      const side = m.white ? c.white : c.black;
      side[m.quality] = (side[m.quality] ?? 0) + 1;
    });
    return c;
  }, [report]);
  const timing = useMemo(() => {
    const timed = report?.moves.filter((m) => m.spent !== null) ?? [];
    if (!timed.length) return null;
    const avg = (ms: MoveReport[]) => (ms.length ? ms.reduce((a, m) => a + m.spent!, 0) / ms.length : 0);
    return { mine: avg(timed.filter(isMine)), theirs: avg(timed.filter((m) => !isMine(m))) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  const n = report?.moves.length ?? 0;
  // Ohne Auswahl zeigt das Brett die Schlussstellung
  const shown = selected ?? n;
  const shownMove = report && shown > 0 ? report.moves[shown - 1] : null;

  // Schritt in der Engine-Variante des gezeigten Zugs (null = Partiestellung)
  const [lineStep, setLineStep] = useState<number | null>(null);
  useEffect(() => setLineStep(null), [selected, report]);
  const step = lineStep !== null ? shownMove?.bestLine[lineStep] ?? null : null;

  // Pfeiltasten blättern durch die Partie, solange die Oberfläche den Fokus hat
  useEffect(() => {
    if (!report) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      let next: (cur: number) => number;
      if (e.key === "ArrowRight") next = (c) => Math.min(n, c + 1);
      else if (e.key === "ArrowLeft") next = (c) => Math.max(0, c - 1);
      else if (e.key === "Home") next = () => 0;
      else if (e.key === "End") next = () => n;
      else return;
      e.preventDefault();
      // funktional, damit schnell wiederholte Tasten nicht auf altem Stand rechnen
      setSelected((s) => next(s ?? n));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [report, n]);

  /** Zum nächsten eigenen Zug dieser Kategorie springen, am Ende wieder von vorn */
  const jump = (q: Quality, side: "white" | "black") => {
    const list = report?.moves.filter((m) => m.quality === q && m.white === (side === "white")) ?? [];
    if (!list.length) return;
    const next = list.find((m) => m.ply > shown) ?? list[0];
    setSelected(next.ply);
  };

  const evalNow: Score = step
    ? shownMove!.scoreBefore
    : shownMove?.score ?? report?.moves[0]?.scoreBefore ?? { cp: 0, mate: null };

  return (
    <div className="view">
      <header className="view-head">
        <button className="btn btn--quiet btn--icon-left" onClick={p.onBack}>
          <IconBack width={16} height={16} />
          Partien
        </button>
        <button className="btn btn--quiet btn--icon-right" onClick={() => api.go(game.url)}>
          Auf Chess.com
          <IconExternal />
        </button>
      </header>

      <div className="players">
        {(["white", "black"] as const).map((c) => (
          <div key={c} className="player" data-me={c === me || undefined}>
            <span className={`piece piece--${c}`} />
            <span className="player-name">
              {game[c].username}
              {game[c].rating !== null && <span className="rating"> {game[c].rating}</span>}
            </span>
            <span className="player-acc" title="Genauigkeit">
              {report ? fmtPct(c === "white" ? report.accuracyWhite : report.accuracyBlack) : "–"}
            </span>
          </div>
        ))}
      </div>

      {report?.opening && (
        <p className="opening">
          <strong>{report.opening.eco}</strong>
          {report.opening.name}
        </p>
      )}

      {p.engineMissing && (
        <div className="notice">
          <h3>Stockfish fehlt</h3>
          <p>
            Lade Stockfish für Windows von stockfishchess.org herunter, entpacke es und speichere die Datei als{" "}
            <code>stockfish.exe</code> in diesem Ordner:
          </p>
          {p.engineFolder && <code className="path">{p.engineFolder}</code>}
          <div className="row">
            <button className="btn" onClick={p.onRetry}>
              Erneut suchen
            </button>
            <button className="btn btn--quiet" onClick={p.onSettings}>
              Pfad selbst eintragen
            </button>
          </div>
        </div>
      )}

      {p.error && !p.engineMissing && (
        <div className="notice notice--error" role="alert">
          <p>{p.error}</p>
          <button className="btn" onClick={p.onRetry}>
            Erneut analysieren
          </button>
        </div>
      )}

      {!report && p.progress && (
        <div className="computing" aria-live="polite">
          <div className="computing-bar">
            <span style={{ width: `${(p.progress.done / Math.max(1, p.progress.total)) * 100}%` }} />
          </div>
          <p className="muted">
            Stockfish rechnet: {p.progress.done} von {p.progress.total} Stellungen
          </p>
        </div>
      )}

      {report && (
        <>
          <section className="board-area">
            <EvalBar score={evalNow} flipped={me === "black"} />
            {step ? (
              <Board
                fen={step.fen}
                flipped={me === "black"}
                last={{ uci: step.uci, quality: "best" }}
                check={/[+#]$/.test(step.san)}
              />
            ) : (
              <Board
                fen={shownMove?.fen ?? report.startFen}
                flipped={me === "black"}
                last={shownMove ? { uci: shownMove.uci, quality: shownMove.quality } : null}
                arrow={shownMove && !top.has(shownMove.quality) ? shownMove.bestUci : null}
                check={!!shownMove && /[+#]$/.test(shownMove.san)}
                badge
              />
            )}
          </section>

          <MoveCard
            m={shownMove}
            mine={!!shownMove && isMine(shownMove)}
            lineStep={lineStep}
            onLineStep={setLineStep}
          />

          <div className="board-nav" role="group" aria-label="Durch die Partie blättern">
            <button className="btn btn--quiet" onClick={() => setSelected(0)} disabled={shown === 0} title="Anfang (Pos1)">
              ⏮
            </button>
            <button
              className="btn btn--quiet"
              onClick={() => setSelected(Math.max(0, shown - 1))}
              disabled={shown === 0}
              title="Zurück (←)"
            >
              ◀
            </button>
            <span className="board-nav-pos muted">
              {shown} / {n}
            </span>
            <button
              className="btn btn--quiet"
              onClick={() => setSelected(Math.min(n, shown + 1))}
              disabled={shown === n}
              title="Vor (→)"
            >
              ▶
            </button>
            <button className="btn btn--quiet" onClick={() => setSelected(n)} disabled={shown === n} title="Ende (Ende)">
              ⏭
            </button>
          </div>

          <section className="block">
            <table className="summary">
              <thead>
                <tr>
                  <th />
                  <th className="summary-who" data-me={me === "white" || undefined}>
                    <span className="piece piece--white" /> {me === "white" ? "Du" : "Gegner"}
                  </th>
                  <th className="summary-who" data-me={me === "black" || undefined}>
                    <span className="piece piece--black" /> {me === "black" ? "Du" : "Gegner"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.map((q) => (
                  <tr key={q} data-bad={bad.has(q) || undefined}>
                    <th scope="row">
                      <QualityBadge q={q} />
                      {qualityLabel[q]}
                    </th>
                    {(["white", "black"] as const).map((side) => {
                      const v = counts[side][q] ?? 0;
                      return (
                        <td key={side}>
                          <button
                            className={`summary-n${v && bad.has(q) ? ` q--${q}` : ""}`}
                            data-zero={!v || undefined}
                            data-me={side === me || undefined}
                            disabled={!v}
                            onClick={() => jump(q, side)}
                            title={v ? "Zum nächsten Zug dieser Art springen" : undefined}
                          >
                            {v}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="block">
            <h3>Verlauf</h3>
            <GameStrip
              start={report.moves[0]?.scoreBefore ?? { cp: 0, mate: null }}
              moves={report.moves}
              me={me}
              selected={selected}
              onSelect={setSelected}
            />
            {timing && (
              <p className="time-summary">
                Zeit pro Zug: du Ø {fmtSecs(timing.mine)} · {game[opp].username} Ø {fmtSecs(timing.theirs)}
              </p>
            )}
          </section>

          <section className="block">
            <h3>Züge</h3>
            <MoveList moves={report.moves} shown={shown} onSelect={setSelected} />
          </section>

          <div className="row">
            <p className="footnote">
              Stockfish, Tiefe {report.depth}. Genauigkeit nach Lichess-Formel, weicht leicht von Chess.com ab.
            </p>
            <button className="btn btn--quiet" onClick={p.onRetry} title="Mit der Tiefe aus den Optionen neu rechnen">
              Neu analysieren
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Senkrechte Bewertungsleiste neben dem Brett */
function EvalBar({ score, flipped }: { score: Score; flipped: boolean }) {
  const white = winPct(score);
  const label = fmtScore(score).replace(/^[+−]/, "");
  const whiteAhead = score.mate !== null ? score.mate > 0 || (score.mate === 0 && score.cp > 0) : score.cp >= 0;
  return (
    <div className="evalbar" data-flipped={flipped || undefined} title={`Bewertung ${fmtScore(score)}`}>
      <span className="evalbar-white" style={{ height: `${white}%` }} />
      <span className="evalbar-label" data-side={whiteAhead ? "white" : "black"}>
        {label}
      </span>
    </div>
  );
}

function MoveCard({
  m,
  mine,
  lineStep,
  onLineStep,
}: {
  m: MoveReport | null;
  mine: boolean;
  lineStep: number | null;
  onLineStep: (k: number | null) => void;
}) {
  if (!m) {
    return (
      <div className="movecard">
        <p className="muted">Ausgangsstellung. Blättere mit ← → oder klick einen Zug an.</p>
      </div>
    );
  }
  const better = !top.has(m.quality) && m.bestSan;
  return (
    <div className={`movecard mc--${m.quality}`} data-mine={mine || undefined}>
      <div className="movecard-head">
        <QualityBadge q={m.quality} size={22} />
        <p>
          <strong>{moveLabel(m.number, m.white, m.san)}</strong> {verdict[m.quality]}
        </p>
        <span className="movecard-eval">{fmtScore(m.score)}</span>
      </div>
      <p className="movecard-sub muted">
        {better && (
          <>
            Besser war <strong className="q--best">{deSan(m.bestSan!)}</strong> ·{" "}
          </>
        )}
        {fmtScore(m.scoreBefore)} → {fmtScore(m.score)}
        {m.spent !== null && (
          <span title={m.clock !== null ? `Restzeit ${fmtClock(m.clock)}` : undefined}> · {fmtSecs(m.spent)}</span>
        )}
      </p>
      {m.bestLine.length > 0 && (
        <div className="line" role="group" aria-label="Engine-Variante">
          <button className="line-move" aria-pressed={lineStep === null} onClick={() => onLineStep(null)} title="Zurück zur Partie">
            Partie
          </button>
          {m.bestLine.map((s, k) => {
            // Halbzug k der Variante: gleiche Seite wie der gewählte Zug bei geradem k
            const white = k % 2 === 0 ? m.white : !m.white;
            const number = m.number + Math.floor((k + (m.white ? 0 : 1)) / 2);
            return (
              <button key={k} className="line-move" aria-pressed={lineStep === k} onClick={() => onLineStep(k)}>
                {k === 0 || white ? moveLabel(number, white, s.san) : deSan(s.san)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MoveList({
  moves,
  shown,
  onSelect,
}: {
  moves: MoveReport[];
  shown: number;
  onSelect: (ply: number) => void;
}) {
  const ref = useRef<HTMLOListElement>(null);
  // Gewählten Zug in der Liste sichtbar halten, ohne das ganze Panel zu verschieben
  useEffect(() => {
    const list = ref.current;
    const el = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!list || !el) return;
    const top = el.offsetTop - list.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top - 4;
    else if (top + el.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = top + el.offsetHeight - list.clientHeight + 4;
  }, [shown]);

  const rows: [MoveReport | undefined, MoveReport | undefined, number][] = [];
  const first = moves[0];
  let i = 0;
  // Partie aus FEN mit Schwarz am Zug: erste Zeile ohne weißen Zug
  if (first && !first.white) {
    rows.push([undefined, first, first.number]);
    i = 1;
  }
  for (; i < moves.length; i += 2) rows.push([moves[i], moves[i + 1], moves[i].number]);

  const cell = (m?: MoveReport) =>
    m ? (
      <button className="ml-move" aria-pressed={shown === m.ply} onClick={() => onSelect(m.ply)}>
        <QualityBadge q={m.quality} size={14} />
        <span>{deSan(m.san)}</span>
      </button>
    ) : (
      <span />
    );

  return (
    <ol className="movelist" ref={ref}>
      {rows.map(([w, b, num]) => (
        <li key={num}>
          <span className="ml-n">{num}.</span>
          {cell(w)}
          {cell(b)}
        </li>
      ))}
    </ol>
  );
}
