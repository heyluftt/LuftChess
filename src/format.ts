import type { Game, Quality, SavedEntry, Score } from "./types";

/** Partie aus einer gespeicherten Analyse, auch wenn ältere Einträge keine Partiedaten haben */
export function entryToGame(e: SavedEntry): Game {
  const r = e.report.result;
  const side = (name: string, win: boolean) => ({
    username: name,
    rating: null,
    result: r === "1/2-1/2" ? "agreed" : win ? "win" : "resigned",
  });
  return {
    url: e.url,
    pgn: e.pgn ?? "",
    endTime: e.game?.endTime ?? e.savedAt,
    timeClass: e.game?.timeClass ?? "",
    timeControl: e.game?.timeControl ?? "",
    white: e.game?.white ?? side(e.report.white, r === "1-0"),
    black: e.game?.black ?? side(e.report.black, r === "0-1"),
  };
}

const nf1 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "+1,4", "−0,6", "M3", "−M2" – immer aus Sicht von Weiß */
export function fmtScore(s: Score): string {
  if (s.mate !== null) {
    if (s.mate === 0) return "Matt";
    return (s.mate < 0 ? "−" : "") + "M" + Math.abs(s.mate);
  }
  const v = s.cp / 100;
  if (Math.abs(v) < 0.05) return "0,0";
  return (v > 0 ? "+" : "−") + nf1.format(Math.abs(v));
}

export const fmtPct = (v: number) => nf1.format(v);

/** 4,2 s · 1:05 */
export function fmtSecs(s: number): string {
  if (s < 60) return `${nf1.format(s)} s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s - m * 60)).padStart(2, "0")}`;
}

/** Restzeit wie auf der Uhr: 9:58 */
export function fmtClock(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s - m * 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** Gewinnchance für Weiß in Prozent (gleiche Formel wie im Rust-Teil) */
export function winPct(s: Score): number {
  if (s.mate !== null) {
    if (s.mate === 0) return s.cp > 0 ? 100 : 0;
    return s.mate > 0 ? 100 : 0;
  }
  const cp = Math.max(-1000, Math.min(1000, s.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export const qualityLabel: Record<Quality, string> = {
  best: "Bester Zug",
  gut: "Gut",
  ungenau: "Ungenau",
  fehler: "Fehler",
  verpasst: "Verpasst",
  patzer: "Patzer",
  buch: "Theorie",
};

export const qualityMark: Record<Quality, string> = {
  buch: "",
  best: "★",
  gut: "",
  ungenau: "?!",
  fehler: "?",
  verpasst: "✕",
  patzer: "??",
};

const de: Record<string, string> = { N: "S", B: "L", R: "T", Q: "D", K: "K" };

/** SAN in deutscher Notation: Nf3 → Sf3, Qxd8+ → Dxd8+, e8=Q → e8=D */
export function deSan(san: string): string {
  return san.replace(/^[NBRQK]/, (c) => de[c]).replace(/=([NBRQ])/, (_, c) => "=" + de[c]);
}

export function moveLabel(number: number, white: boolean, san: string) {
  return `${number}${white ? "." : "…"} ${deSan(san)}`;
}

export type Outcome = "win" | "loss" | "draw";

export function outcomeFor(game: Game, user: string): { me: "white" | "black"; outcome: Outcome } {
  const me = game.white.username.toLowerCase() === user.toLowerCase() ? "white" : "black";
  const r = game[me].result;
  const outcome: Outcome =
    r === "win"
      ? "win"
      : ["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"].includes(r)
        ? "draw"
        : "loss";
  return { me, outcome };
}

const reasons: Record<string, string> = {
  checkmated: "Schachmatt",
  resigned: "Aufgabe",
  timeout: "Zeit",
  abandoned: "Abbruch",
  agreed: "Einigung",
  repetition: "Wiederholung",
  stalemate: "Patt",
  insufficient: "Material",
  "50move": "50 Züge",
  timevsinsufficient: "Zeit/Material",
};

export function endReason(game: Game): string {
  const loser = game.white.result === "win" ? game.black : game.black.result === "win" ? game.white : game.white;
  return reasons[loser.result] ?? loser.result;
}

export function fmtTimeControl(tc: string): string {
  const [base, inc] = tc.split("+");
  const s = Number(base);
  if (!Number.isFinite(s)) return tc;
  const main = s >= 60 ? `${Math.round(s / 60)} Min.` : `${s} Sek.`;
  return inc && inc !== "0" ? `${main} +${inc}` : main;
}

export function fmtWhen(unix: number): string {
  const d = new Date(unix * 1000);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 3600) return `vor ${Math.max(1, Math.round(diff / 60))} Min.`;
  if (diff < 86400) return `vor ${Math.round(diff / 3600)} Std.`;
  if (diff < 86400 * 2) return "gestern";
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}
