import type { LineStep, Quality, SavedEntry } from "./types";

export interface Puzzle {
  id: string;
  url: string;
  when: number;
  opponent: string;
  fen: string;
  me: "white" | "black";
  number: number;
  white: boolean;
  played: string;
  quality: Quality;
  bestUci: string;
  bestSan: string;
  line: LineStep[];
}

const asPuzzle = new Set<Quality>(["patzer", "fehler", "verpasst"]);

export function buildPuzzles(entries: SavedEntry[], user: string): Puzzle[] {
  const u = user.toLowerCase();
  return entries.flatMap((e) => {
    const { report } = e;
    const me = report.white.toLowerCase() === u ? "white" : report.black.toLowerCase() === u ? "black" : null;
    if (!me) return [];
    return report.moves.flatMap((m, i) => {
      if (m.white !== (me === "white") || !asPuzzle.has(m.quality) || !m.bestUci || !m.bestSan) return [];
      return [
        {
          id: `${e.url}#${m.ply}`,
          url: e.url,
          when: e.game?.endTime ?? e.savedAt,
          opponent: me === "white" ? report.black : report.white,
          fen: i === 0 ? report.startFen : report.moves[i - 1].fen,
          me,
          number: m.number,
          white: m.white,
          played: m.san,
          quality: m.quality,
          bestUci: m.bestUci,
          bestSan: m.bestSan,
          line: m.bestLine,
        },
      ];
    });
  });
}

export interface Progress {
  solved: boolean;
  seen: number;
}

const KEY = "luftchess.training";

export function loadProgress(): Record<string, Progress> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function saveProgress(p: Record<string, Progress>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
  }
}

export interface Streak {
  current: number;
  best: number;
}

const STREAK_KEY = "luftchess.training.streak";

export function loadStreak(): Streak {
  try {
    const s = JSON.parse(localStorage.getItem(STREAK_KEY) ?? "null");
    return s && typeof s.current === "number" ? s : { current: 0, best: 0 };
  } catch {
    return { current: 0, best: 0 };
  }
}

export function saveStreak(s: Streak) {
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(s));
  } catch {
  }
}

export function taskPlies(lineLength: number, maxOwn = 3): number {
  const n = Math.min(lineLength, 2 * maxOwn - 1);
  return n % 2 === 0 ? n - 1 : n;
}

export function order(puzzles: Puzzle[], progress: Record<string, Progress>): Puzzle[] {
  const open = puzzles.filter((p) => !progress[p.id]?.solved).sort((a, b) => b.when - a.when);
  const done = puzzles
    .filter((p) => progress[p.id]?.solved)
    .sort((a, b) => (progress[a.id]?.seen ?? 0) - (progress[b.id]?.seen ?? 0));
  return [...open, ...done];
}

export function ownPiece(fen: string, square: string): boolean {
  const [board, turn] = fen.split(" ");
  const rank = 8 - Number(square[1]);
  const fileIdx = square.charCodeAt(0) - 97;
  let col = 0;
  for (const c of board.split("/")[rank] ?? "") {
    if (c >= "1" && c <= "8") col += Number(c);
    else {
      if (col === fileIdx) return turn === "w" ? c === c.toUpperCase() : c === c.toLowerCase();
      col++;
    }
    if (col > fileIdx) break;
  }
  return false;
}
