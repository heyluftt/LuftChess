import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { SavedEntry } from "../types";
import { deSan, moveLabel, qualityLabel } from "../format";
import { buildPuzzles, loadProgress, order, ownPiece, saveProgress, type Progress } from "../training";
import { Board } from "./Board";

interface Props {
  username: string;
  onOpen: (entry: SavedEntry) => void;
}

type State = "solving" | "wrong" | "solved" | "revealed";

export function TrainingView({ username, onOpen }: Props) {
  const [entries, setEntries] = useState<SavedEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, Progress>>(loadProgress);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [state, setState] = useState<State>("solving");
  const [tries, setTries] = useState(0);
  const [lastTry, setLastTry] = useState<string | null>(null);

  useEffect(() => {
    api.savedAll().then(setEntries, (e) => setError(String(e)));
  }, []);

  const all = useMemo(() => (entries ? buildPuzzles(entries, username) : []), [entries, username]);
  // Reihenfolge einmal pro Laden festlegen, damit "Weiter" nicht springt
  const queue = useMemo(() => order(all, loadProgress()), [all]);
  const puzzle = queue[index % Math.max(1, queue.length)];
  const solvedCount = all.filter((p) => progress[p.id]?.solved).length;

  /** Gelöst zählt nur beim ersten Versuch; Lösung angesehen oder Fehlversuch macht die Aufgabe wieder offen */
  const record = (solved: boolean) => {
    if (!puzzle) return;
    const next = { ...progress, [puzzle.id]: { solved, seen: Date.now() } };
    setProgress(next);
    saveProgress(next);
  };

  const next = () => {
    setIndex((i) => i + 1);
    setPicked(null);
    setState("solving");
    setTries(0);
    setLastTry(null);
  };

  const onSquare = (sq: string) => {
    if (!puzzle || state === "solved" || state === "revealed") return;
    if (ownPiece(puzzle.fen, sq)) {
      setPicked(sq === picked ? null : sq);
      return;
    }
    if (!picked) return;
    const tryUci = picked + sq;
    setPicked(null);
    setLastTry(tryUci);
    if (tryUci === puzzle.bestUci.slice(0, 4)) {
      setState("solved");
      record(tries === 0);
    } else {
      setTries((t) => t + 1);
      setState("wrong");
    }
  };

  const entryOf = (url: string) => entries?.find((e) => e.url === url);

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h2>Training</h2>
          <p className="muted">
            {entries ? `${all.length} Stellungen aus deinen Fehlern · ${solvedCount} gelöst` : "Lädt …"}
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
          <p>Noch keine Stellungen. Sie entstehen aus Patzern und Fehlern in analysierten Partien.</p>
        </div>
      )}

      {puzzle && (
        <>
          <p className="training-task">
            <span className={`piece piece--${puzzle.me}`} />
            {puzzle.me === "white" ? "Weiß" : "Schwarz"} am Zug. Finde den besten Zug.
          </p>

          <Board
            fen={state === "solved" || state === "revealed" ? (puzzle.line[0]?.fen ?? puzzle.fen) : puzzle.fen}
            flipped={puzzle.me === "black"}
            last={
              state === "solved" || state === "revealed"
                ? { uci: puzzle.bestUci, quality: "best" }
                : state === "wrong" && lastTry
                  ? { uci: lastTry, quality: "patzer" }
                  : null
            }
            onSquare={onSquare}
            picked={picked}
          />

          <div className="training-status" aria-live="polite">
            {state === "solving" && <p className="muted">Figur anklicken, dann Zielfeld.</p>}
            {state === "wrong" && (
              <p>
                <span className="q--patzer">Nicht der Engine-Zug.</span> Noch einmal.
              </p>
            )}
            {state === "solved" && (
              <p>
                <span className="q--best">Richtig: {deSan(puzzle.bestSan)}</span>
                {tries > 0 && <span className="muted"> · nach {tries + 1} Versuchen</span>}
              </p>
            )}
            {state === "revealed" && (
              <p>
                Lösung: <strong>{deSan(puzzle.bestSan)}</strong>
              </p>
            )}
          </div>

          {(state === "solved" || state === "revealed") && (
            <div className="training-context">
              <p className="muted small">
                In der Partie gegen {puzzle.opponent} ({new Date(puzzle.when * 1000).toLocaleDateString("de-DE", { day: "numeric", month: "short" })})
                kam {moveLabel(puzzle.number, puzzle.white, puzzle.played)},{" "}
                <span className={`q--${puzzle.quality}`}>{qualityLabel[puzzle.quality]}</span>.
              </p>
              {puzzle.line.length > 1 && (
                <p className="muted small">
                  Variante:{" "}
                  {puzzle.line.map((s, k) => {
                    const white = k % 2 === 0 ? puzzle.white : !puzzle.white;
                    const number = puzzle.number + Math.floor((k + (puzzle.white ? 0 : 1)) / 2);
                    return (k === 0 || white ? moveLabel(number, white, s.san) : deSan(s.san)) + " ";
                  })}
                </p>
              )}
            </div>
          )}

          <div className="row">
            {state === "solved" || state === "revealed" ? (
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
                <button
                  className="btn btn--quiet"
                  onClick={() => {
                    setState("revealed");
                    setPicked(null);
                    record(false);
                  }}
                >
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
    </div>
  );
}
