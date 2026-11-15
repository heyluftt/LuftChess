import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { Game, MoveReport, Quality, Report } from "../types";
import { deSan, fmtClock, fmtPct, fmtScore, fmtSecs, moveLabel, outcomeFor, qualityLabel, qualityMark } from "../format";
import { GameStrip } from "./GameStrip";
import { Board } from "./Board";
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

const counted: Quality[] = ["patzer", "fehler", "verpasst", "ungenau"];
const keyQualities = new Set<Quality>(["patzer", "fehler", "verpasst"]);

export function AnalysisView(p: Props) {
  const { game, username, report } = p;
  const { me } = outcomeFor(game, username);
  const [selected, setSelected] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const boardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setSelected(null);
    setShowAll(false);
  }, [report]);

  const mine = (m: MoveReport) => (m.white ? "white" : "black") === me;
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    report?.moves.filter(mine).forEach((m) => (c[m.quality] = (c[m.quality] ?? 0) + 1));
    return c;
  }, [report]);
  const moments = useMemo(
    () => report?.moves.filter((m) => mine(m) && keyQualities.has(m.quality)) ?? [],
    [report],
  );
  const timing = useMemo(() => {
    const timed = report?.moves.filter((m) => m.spent !== null) ?? [];
    if (!timed.length) return null;
    const avg = (ms: MoveReport[]) => (ms.length ? ms.reduce((a, m) => a + m.spent!, 0) / ms.length : 0);
    const mineM = timed.filter(mine);
    const slowest = mineM.reduce<MoveReport | null>((a, m) => (!a || m.spent! > a.spent! ? m : a), null);
    return { mine: avg(mineM), theirs: avg(timed.filter((m) => !mine(m))), slowest };
  }, [report]);

  const sel = report && selected ? report.moves[selected - 1] : null;
  const n = report?.moves.length ?? 0;
  // Ohne Auswahl zeigt das Brett die Schlussstellung
  const shown = selected ?? n;
  const shownMove = report && shown > 0 ? report.moves[shown - 1] : null;

  // Schritt in der Engine-Variante des gewählten Zugs (null = Partiestellung)
  const [lineStep, setLineStep] = useState<number | null>(null);
  useEffect(() => setLineStep(null), [selected, report]);
  const line = shownMove?.bestLine ?? [];
  const step = lineStep !== null ? line[lineStep] : null;

  // Pfeiltasten blättern durch die Partie, solange die Oberfläche den Fokus hat
  useEffect(() => {
    if (!report) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      let step: (cur: number) => number;
      if (e.key === "ArrowRight") step = (c) => Math.min(n, c + 1);
      else if (e.key === "ArrowLeft") step = (c) => Math.max(0, c - 1);
      else if (e.key === "Home") step = () => 0;
      else if (e.key === "End") step = () => n;
      else return;
      e.preventDefault();
      // funktional, damit schnell wiederholte Tasten nicht auf altem Stand rechnen
      setSelected((s) => step(s ?? n));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [report, n]);

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
            <span className="player-name">{game[c].username}</span>
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
          <section className="block" ref={boardRef}>
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
                arrow={shownMove && shownMove.quality !== "best" && shownMove.quality !== "buch" ? shownMove.bestUci : null}
                check={!!shownMove && /[+#]$/.test(shownMove.san)}
              />
            )}
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
              <span className="board-nav-pos">
                {step
                  ? `Variante: ${deSan(step.san)}`
                  : shownMove
                    ? moveLabel(shownMove.number, shownMove.white, shownMove.san)
                    : "Start"}
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
          </section>

          <section className="block">
            <GameStrip
              start={report.moves[0]?.scoreBefore ?? { cp: 0, mate: null }}
              moves={report.moves}
              me={me}
              selected={selected}
              onSelect={setSelected}
            />
            {timing && (
              <p className="time-summary">
                Ø {fmtSecs(timing.mine)} pro Zug · Gegner {fmtSecs(timing.theirs)}
                {timing.slowest && ` · längster Zug ${moveLabel(timing.slowest.number, timing.slowest.white, timing.slowest.san)} (${fmtSecs(timing.slowest.spent!)})`}
              </p>
            )}
            <div className="strip-caption">
              {sel ? (
                <>
                  <MoveDetail m={sel} />
                  {sel.bestLine.length > 0 && (
                    <div className="line" role="group" aria-label="Engine-Variante">
                      <button
                        className="line-move"
                        aria-pressed={lineStep === null}
                        onClick={() => setLineStep(null)}
                        title="Zurück zur Partie"
                      >
                        Partie
                      </button>
                      {sel.bestLine.map((s, k) => {
                        // Halbzug k der Variante: gleiche Seite wie der gewählte Zug bei geradem k
                        const white = k % 2 === 0 ? sel.white : !sel.white;
                        const number = sel.number + Math.floor((k + (sel.white ? 0 : 1)) / 2);
                        const showNumber = k === 0 || white;
                        return (
                          <button
                            key={k}
                            className="line-move"
                            aria-pressed={lineStep === k}
                            onClick={() => setLineStep(k)}
                          >
                            {showNumber ? moveLabel(number, white, s.san) : deSan(s.san)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <p className="muted">Unten liegt dein Anteil. Klick in den Streifen oder blättere mit ← →.</p>
              )}
            </div>
          </section>

          <section className="block">
            <ul className="tally" aria-label="Deine Züge">
              {counted.map((q) => (
                <li key={q} className={`tally-item q--${q}`} data-zero={!counts[q] || undefined}>
                  <span className="tally-n">{counts[q] ?? 0}</span>
                  <span className="tally-l">{qualityLabel[q]}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="block">
            <h3>Deine Schlüsselmomente</h3>
            {moments.length === 0 ? (
              <p className="muted">Keine groben Fehler. Starke Partie.</p>
            ) : (
              <ol className="moments">
                {moments.map((m) => (
                  <li key={m.ply}>
                    <button
                      className="moment"
                      aria-pressed={selected === m.ply}
                      onClick={() => {
                        setSelected(m.ply);
                        boardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                      }}
                    >
                      <span className={`q-dot q-fill--${m.quality}`} />
                      <span className="moment-move">{moveLabel(m.number, m.white, m.san)}</span>
                      <span className={`moment-q q--${m.quality}`}>{qualityLabel[m.quality]}</span>
                      <span className="moment-best">
                        {[m.bestSan && `besser ${deSan(m.bestSan)}`, m.spent !== null && `nach ${fmtSecs(m.spent)}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <span className="moment-eval">
                        {fmtScore(m.scoreBefore)} → {fmtScore(m.score)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="block">
            <button className="btn btn--quiet" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Zugliste ausblenden" : "Alle Züge zeigen"}
            </button>
            {showAll && <MoveTable moves={report.moves} selected={selected} onSelect={setSelected} />}
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

function MoveDetail({ m }: { m: MoveReport }) {
  const mark = qualityMark[m.quality];
  return (
    <div className="detail">
      <span className="detail-move">
        {moveLabel(m.number, m.white, m.san)}
        {mark && <span className={`q--${m.quality}`}>{mark}</span>}
      </span>
      <span className={`q--${m.quality}`}>{qualityLabel[m.quality]}</span>
      {m.quality !== "best" && m.bestSan && <span className="muted">besser {deSan(m.bestSan)}</span>}
      {m.spent !== null && (
        <span className="muted" title={m.clock !== null ? `Restzeit ${fmtClock(m.clock)}` : undefined}>
          {fmtSecs(m.spent)}
        </span>
      )}
      <span className="detail-eval">{fmtScore(m.score)}</span>
    </div>
  );
}

function MoveTable({
  moves,
  selected,
  onSelect,
}: {
  moves: MoveReport[];
  selected: number | null;
  onSelect: (ply: number) => void;
}) {
  const rows: [MoveReport, MoveReport | undefined][] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push([moves[i], moves[i + 1]]);
  const cell = (m?: MoveReport) =>
    m ? (
      <button className="mt-move" aria-pressed={selected === m.ply} onClick={() => onSelect(m.ply)}>
        {deSan(m.san)}
        {qualityMark[m.quality] && m.quality !== "best" && (
          <span className={`q--${m.quality}`}>{qualityMark[m.quality]}</span>
        )}
      </button>
    ) : (
      <span />
    );
  return (
    <ol className="movetable">
      {rows.map(([w, b]) => (
        <li key={w.ply}>
          <span className="mt-n">{w.number}</span>
          {cell(w)}
          {cell(b)}
        </li>
      ))}
    </ol>
  );
}
