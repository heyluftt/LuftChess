import { useEffect, useMemo, useState } from "react";
import { Chess, type Move } from "chess.js";
import { api } from "../api";
import type { LineStep, Quality, SavedEntry } from "../types";
import { deSan, moveLabel, qualityLabel } from "../format";
import {
  buildPuzzles,
  loadProgress,
  loadStreak,
  order,
  ownPiece,
  saveProgress,
  saveStreak,
  taskPlies,
  type Progress,
  type Puzzle,
} from "../training";
import { Board } from "./Board";

interface Props {
  username: string;
  onOpen: (entry: SavedEntry) => void;
}

type State = "solving" | "reply" | "wrong" | "solved" | "revealed";
type Filter = "alle" | "patzer" | "fehler" | "verpasst";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "alle", label: "Alle" },
  { id: "patzer", label: "Patzer" },
  { id: "fehler", label: "Fehler" },
  { id: "verpasst", label: "Verpasst" },
];

const REPLY_MS = 450;

function stepsOf(p: Puzzle): LineStep[] {
  if (p.line.length > 0) return p.line;
  try {
    const c = new Chess(p.fen);
    c.move({ from: p.bestUci.slice(0, 2), to: p.bestUci.slice(2, 4), promotion: p.bestUci[4] ?? "q" });
    return [{ san: p.bestSan, uci: p.bestUci, fen: c.fen() }];
  } catch {
    return [{ san: p.bestSan, uci: p.bestUci, fen: p.fen }];
  }
}

export function TrainingView({ username, onOpen }: Props) {
  const [entries, setEntries] = useState<SavedEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, Progress>>(loadProgress);
  const [streak, setStreak] = useState(loadStreak);
  const [filter, setFilter] = useState<Filter>("alle");
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [state, setState] = useState<State>("solving");
  const [ply, setPly] = useState(0);
  const [tries, setTries] = useState(0);
  const [hint, setHint] = useState(0);
  const [lastTry, setLastTry] = useState<string | null>(null);
  const [view, setView] = useState(0);
  const [usedHint, setUsedHint] = useState(false);

  useEffect(() => {
    api.savedAll().then(setEntries, (e) => setError(String(e)));
  }, []);

  const all = useMemo(() => (entries ? buildPuzzles(entries, username) : []), [entries, username]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { alle: all.length, patzer: 0, fehler: 0, verpasst: 0 };
    for (const p of all) if (p.quality in c) c[p.quality as Filter]++;
    return c;
  }, [all]);
  const queue = useMemo(
    () => order(filter === "alle" ? all : all.filter((p) => p.quality === filter), loadProgress()),
    [all, filter],
  );
  const puzzle = queue.length > 0 ? queue[index % queue.length] : undefined;
  const solvedCount = all.filter((p) => progress[p.id]?.solved).length;

  const steps = useMemo(() => (puzzle ? stepsOf(puzzle) : []), [puzzle]);
  const plies = taskPlies(steps.length);
  const done = state === "solved" || state === "revealed";
  const fenAt = (i: number) => (i === 0 || !puzzle ? (puzzle?.fen ?? "") : steps[i - 1].fen);
  const fenNow = fenAt(ply);
  const expected = steps[ply]?.uci ?? "";

  const legal = useMemo<Move[]>(() => {
    if (!fenNow) return [];
    try {
      return new Chess(fenNow).moves({ verbose: true });
    } catch {
      return [];
    }
  }, [fenNow]);
  const targets =
    picked && !done
      ? legal
          .filter((m) => m.from === picked)
          .filter((m, k, list) => list.findIndex((o) => o.to === m.to) === k)
          .map((m) => ({ square: m.to, capture: Boolean(m.captured) }))
      : [];

  const reset = () => {
    setPicked(null);
    setState("solving");
    setPly(0);
    setTries(0);
    setHint(0);
    setLastTry(null);
    setView(0);
    setUsedHint(false);
  };

  const finish = (clean: boolean) => {
    if (!puzzle) return;
    const next = { ...progress, [puzzle.id]: { solved: clean, seen: Date.now() } };
    setProgress(next);
    saveProgress(next);
    const s = clean ? { current: streak.current + 1, best: Math.max(streak.best, streak.current + 1) } : { ...streak, current: 0 };
    setStreak(s);
    saveStreak(s);
  };

  const next = () => {
    setIndex((i) => i + 1);
    reset();
  };

  const changeFilter = (f: Filter) => {
    setFilter(f);
    setIndex(0);
    reset();
  };

  useEffect(() => {
    if (state !== "reply") return;
    const t = setTimeout(() => {
      setPly((p) => p + 1);
      setState("solving");
    }, REPLY_MS);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    if (!done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setView((v) => Math.max(0, v - 1));
      if (e.key === "ArrowRight") setView((v) => Math.min(steps.length, v + 1));
      if (e.key === "Home") setView(0);
      if (e.key === "End") setView(steps.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, steps.length]);

  const onSquare = (sq: string) => {
    if (!puzzle || done || state === "reply") return;
    if (ownPiece(fenNow, sq)) {
      const hinted = hint > 0 && sq === expected.slice(0, 2);
      setPicked(sq === picked && !hinted ? null : sq);
      return;
    }
    if (!picked) return;
    if (legal.length > 0 && !targets.some((t) => t.square === sq)) {
      setPicked(null);
      return;
    }
    const tryUci = picked + sq;
    setPicked(null);
    setLastTry(tryUci);
    if (tryUci !== expected.slice(0, 4)) {
      setTries((t) => t + 1);
      setState("wrong");
      return;
    }
    setHint(0);
    if (ply + 1 >= plies) {
      setPly(ply + 1);
      setView(ply + 1);
      setState("solved");
      finish(tries === 0 && !usedHint);
    } else {
      setPly(ply + 1);
      setState("reply");
    }
  };

  const giveHint = () => {
    if (!expected) return;
    setUsedHint(true);
    setState("solving");
    if (hint === 0) {
      setHint(1);
      setPicked(expected.slice(0, 2));
    } else {
      setHint(2);
    }
  };

  const reveal = () => {
    setState("revealed");
    setPicked(null);
    setView(Math.max(ply + 1, plies));
    finish(false);
  };

  const entryOf = (url: string) => entries?.find((e) => e.url === url);

  let boardFen = fenNow;
  let last: { uci: string; quality: Quality } | null = null;
  let arrow: string | null = null;
  if (done) {
    boardFen = fenAt(view);
    if (view > 0) last = { uci: steps[view - 1].uci, quality: (view - 1) % 2 === 0 ? "best" : "gut" };
  } else if (state === "wrong" && lastTry) {
    last = { uci: lastTry, quality: "patzer" };
  } else if (ply > 0) {
    last = { uci: steps[ply - 1].uci, quality: (ply - 1) % 2 === 0 ? "best" : "gut" };
  }
  if (!done && hint === 2) arrow = expected;

  const ownMovesTotal = Math.ceil(plies / 2);
  const ownMovesDone = Math.ceil(ply / 2);
  const moveNumberAt = (k: number) => puzzle!.number + Math.floor((k + (puzzle!.white ? 0 : 1)) / 2);
  const whiteAt = (k: number) => (k % 2 === 0 ? puzzle!.white : !puzzle!.white);

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h2>Training</h2>
          <p className="muted">
            {entries ? `${all.length} Stellungen aus deinen Fehlern · ${solvedCount} gelöst` : "Lädt …"}
          </p>
        </div>
        {entries && all.length > 0 && (
          <p className="training-streak" title="Aufgaben in Folge beim ersten Versuch ohne Tipp gelöst">
            <span>Serie</span> <strong>{streak.current}</strong>
            <span className="muted"> · Rekord {streak.best}</span>
          </p>
        )}
      </header>

      {error && (
        <div className="notice notice--error" role="alert">
          <p>{error}</p>
        </div>
      )}

      {entries && all.length === 0 && (
        <div className="notice">
          <p>Noch keine Stellungen. Sie entstehen aus Patzern und Fehlern in analysierten Partien.</p>
        </div>
      )}

      {all.length > 0 && (
        <div className="chips" role="group" aria-label="Nach Fehlerart filtern">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className="chip"
              aria-pressed={filter === f.id}
              disabled={counts[f.id] === 0}
              onClick={() => changeFilter(f.id)}
            >
              {f.label} {counts[f.id]}
            </button>
          ))}
        </div>
      )}

      {puzzle && (
        <>
          <p className="training-task">
            <span className={`piece piece--${puzzle.me}`} />
            {puzzle.me === "white" ? "Weiß" : "Schwarz"} am Zug. Finde den besten Zug
            {ownMovesTotal > 1 && !done && (
              <span className="muted training-count">
                {" "}
                · Zug {Math.min(ownMovesDone + 1, ownMovesTotal)} von {ownMovesTotal}
              </span>
            )}
          </p>

          <div key={tries} className={state === "wrong" ? "shake" : undefined}>
          <Board
            fen={boardFen}
            flipped={puzzle.me === "black"}
            last={last}
            arrow={arrow}
            onSquare={onSquare}
            picked={done ? null : picked}
            targets={targets}
          />
          </div>

          <div className="training-status" aria-live="polite">
            {state === "solving" && ply === 0 && hint === 0 && <p className="muted">Figur anklicken, dann Zielfeld.</p>}
            {state === "solving" && ply > 0 && hint === 0 && (
              <p>
                <span className="q--best">Richtig.</span> Gegner spielt {deSan(steps[ply - 1].san)}. Wie geht es weiter?
              </p>
            )}
            {state === "solving" && hint === 1 && <p className="muted">Tipp: Diese Figur zieht.</p>}
            {state === "solving" && hint === 2 && <p className="muted">Tipp: Der Pfeil zeigt den Zug.</p>}
            {state === "reply" && (
              <p>
                <span className="q--best">Richtig: {deSan(steps[ply - 1].san)}</span> <span className="muted">· Gegner antwortet …</span>
              </p>
            )}
            {state === "wrong" && (
              <p>
                <span className="q--patzer">Nicht der Engine-Zug.</span> Noch einmal.
              </p>
            )}
            {state === "solved" && (
              <p>
                <span className="q--best">Gelöst!</span>
                {(tries > 0 || usedHint) && (
                  <span className="muted">
                    {" "}
                    · {tries > 0 ? `${tries} Fehlversuch${tries > 1 ? "e" : ""}` : ""}
                    {tries > 0 && usedHint ? ", " : ""}
                    {usedHint ? "mit Tipp" : ""}
                  </span>
                )}
              </p>
            )}
            {state === "revealed" && (
              <p>
                Lösung: <strong>{deSan(steps[ply]?.san ?? puzzle.bestSan)}</strong>
              </p>
            )}
          </div>

          {done && (
            <>
              <div className="board-nav" role="group" aria-label="Durch die Variante blättern">
                <button className="btn btn--quiet" onClick={() => setView(0)} disabled={view === 0} title="Ausgangsstellung (Pos1)">
                  ⏮
                </button>
                <button className="btn btn--quiet" onClick={() => setView(view - 1)} disabled={view === 0} title="Zurück (←)">
                  ◀
                </button>
                <span className="board-nav-pos muted">
                  {view} / {steps.length}
                </span>
                <button
                  className="btn btn--quiet"
                  onClick={() => setView(view + 1)}
                  disabled={view === steps.length}
                  title="Vor (→)"
                >
                  ▶
                </button>
                <button
                  className="btn btn--quiet"
                  onClick={() => setView(steps.length)}
                  disabled={view === steps.length}
                  title="Ende der Variante (Ende)"
                >
                  ⏭
                </button>
              </div>

              <div className="training-context">
                <p className="muted small">
                  In der Partie gegen {puzzle.opponent} (
                  {new Date(puzzle.when * 1000).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}) kam{" "}
                  {moveLabel(puzzle.number, puzzle.white, puzzle.played)},{" "}
                  <span className={`q--${puzzle.quality}`}>{qualityLabel[puzzle.quality]}</span>.
                </p>
                <p className="training-line small">
                  <span className="muted">Variante: </span>
                  {steps.map((s, k) => (
                    <button
                      key={k}
                      className="line-move"
                      aria-current={view === k + 1 || undefined}
                      onClick={() => setView(k + 1)}
                    >
                      {k === 0 || whiteAt(k) ? moveLabel(moveNumberAt(k), whiteAt(k), s.san) : deSan(s.san)}
                    </button>
                  ))}
                </p>
              </div>
            </>
          )}

          <div className="row">
            {done ? (
              <>
                <button className="btn" onClick={next}>
                  Nächste
                </button>
                <button
                  className="btn btn--quiet"
                  onClick={() => {
                    const e = entryOf(puzzle.url);
                    if (e) onOpen(e);
                  }}
                >
                  Partie ansehen
                </button>
              </>
            ) : (
              <>
                <button className="btn btn--quiet" onClick={giveHint} disabled={state === "reply" || hint === 2}>
                  {hint === 0 ? "Tipp" : "Noch ein Tipp"}
                </button>
                <button className="btn btn--quiet" onClick={reveal} disabled={state === "reply"}>
                  Lösung zeigen
                </button>
                <button className="btn btn--quiet" onClick={next}>
                  Überspringen
                </button>
              </>
            )}
          </div>
        </>
      )}

      {entries && all.length > 0 && !puzzle && (
        <div className="notice">
          <p>Keine Stellungen in diesem Filter.</p>
        </div>
      )}
    </div>
  );
}
