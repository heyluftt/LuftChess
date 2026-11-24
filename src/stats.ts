import type { MoveReport, Quality, SavedEntry } from "./types";

export type Phase = "eroeffnung" | "mittelspiel" | "endspiel";
export const phaseLabel: Record<Phase, string> = {
  eroeffnung: "Eröffnung",
  mittelspiel: "Mittelspiel",
  endspiel: "Endspiel",
};

const errors = new Set<Quality>(["patzer", "fehler", "verpasst"]);
const values: Record<string, number> = { q: 9, r: 5, b: 3, n: 3 };

function material(fen: string): number {
  let sum = 0;
  for (const c of fen.split(" ")[0]) sum += values[c.toLowerCase()] ?? 0;
  return sum;
}

export function phaseOf(m: MoveReport): Phase {
  if (material(m.fen) <= 26) return "endspiel";
  return m.number <= 12 ? "eroeffnung" : "mittelspiel";
}

export interface GameStat {
  url: string;
  when: number;
  me: "white" | "black";
  accuracy: number;
  score: number;
  timeClass: string | null;
  opening: string | null;
  eco: string | null;
  errors: Record<Phase, number>;
  timeTrouble: number;
  errorCount: number;
  avgSpent: number | null;
}

const drawResults = ["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"];

function scoreFor(e: SavedEntry, me: "white" | "black"): number {
  const r = e.game?.[me].result;
  if (r) return r === "win" ? 1 : drawResults.includes(r) ? 0.5 : 0;
  const res = e.report.result;
  if (res === "1/2-1/2") return 0.5;
  return (res === "1-0") === (me === "white") ? 1 : 0;
}

function baseTime(tc: string | undefined): number | null {
  const n = Number(tc?.split("+")[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function gameStats(entries: SavedEntry[], user: string): GameStat[] {
  const u = user.toLowerCase();
  return entries.flatMap((e) => {
    const me =
      e.report.white.toLowerCase() === u ? "white" : e.report.black.toLowerCase() === u ? "black" : null;
    if (!me) return [];
    const mine = e.report.moves.filter((m) => m.white === (me === "white"));
    const errs: Record<Phase, number> = { eroeffnung: 0, mittelspiel: 0, endspiel: 0 };
    const base = baseTime(e.game?.timeControl);
    let timeTrouble = 0;
    let errorCount = 0;
    for (const m of mine) {
      if (!errors.has(m.quality)) continue;
      errorCount++;
      errs[phaseOf(m)]++;
      if (base && m.clock !== null && m.clock < Math.max(20, base * 0.1)) timeTrouble++;
    }
    const timed = mine.filter((m) => m.spent !== null);
    return [
      {
        url: e.url,
        when: e.game?.endTime ?? e.savedAt,
        me,
        accuracy: me === "white" ? e.report.accuracyWhite : e.report.accuracyBlack,
        score: scoreFor(e, me),
        timeClass: e.game?.timeClass ?? null,
        opening: e.report.opening?.name ?? null,
        eco: e.report.opening?.eco ?? null,
        errors: errs,
        timeTrouble,
        errorCount,
        avgSpent: timed.length ? timed.reduce((a, m) => a + m.spent!, 0) / timed.length : null,
      },
    ];
  });
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export interface OpeningRow {
  name: string;
  eco: string;
  me: "white" | "black";
  games: number;
  score: number;
  accuracy: number;
}

export function openingRows(stats: GameStat[]): OpeningRow[] {
  const groups = new Map<string, GameStat[]>();
  for (const s of stats) {
    if (!s.opening) continue;
    const key = `${s.me}|${s.opening.split(":")[0]}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.entries()]
    .map(([key, gs]) => ({
      name: key.split("|")[1],
      eco: gs[0].eco ?? "",
      me: gs[0].me,
      games: gs.length,
      score: (mean(gs.map((g) => g.score)) * 100),
      accuracy: mean(gs.map((g) => g.accuracy)),
    }))
    .sort((a, b) => b.games - a.games || b.score - a.score);
}
