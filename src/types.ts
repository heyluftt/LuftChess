export type Quality = "best" | "gut" | "ungenau" | "fehler" | "verpasst" | "patzer" | "buch";

export interface Opening {
  eco: string;
  name: string;
}

export interface Score {
  cp: number;
  mate: number | null;
}

export interface LineStep {
  san: string;
  uci: string;
  fen: string;
}

export interface MoveReport {
  ply: number;
  number: number;
  white: boolean;
  san: string;
  uci: string;
  /** Stellung nach dem Zug */
  fen: string;
  score: Score;
  bestSan: string | null;
  bestUci: string | null;
  scoreBefore: Score;
  loss: number;
  quality: Quality;
  /** Engine-Variante ab dem besseren Zug */
  bestLine: LineStep[];
  /** Restzeit nach dem Zug (s) */
  clock: number | null;
  /** Verbrauchte Zeit (s) */
  spent: number | null;
}

export interface Report {
  white: string;
  black: string;
  result: string;
  depth: number;
  startFen: string;
  opening: Opening | null;
  moves: MoveReport[];
  accuracyWhite: number;
  accuracyBlack: number;
}

/** Kurzfassung einer gespeicherten Analyse für die Partienliste */
export interface Summary {
  accuracyWhite: number;
  accuracyBlack: number;
  depth: number;
}

export interface Side {
  username: string;
  rating: number | null;
  result: string;
}

export interface Game {
  url: string;
  pgn: string;
  endTime: number;
  timeClass: string;
  timeControl: string;
  white: Side;
  black: Side;
}

/** Partiedaten, die mit einer Analyse gespeichert werden */
export type GameMeta = Omit<Game, "url" | "pgn">;

export interface SavedEntry {
  url: string;
  savedAt: number;
  game: GameMeta | null;
  pgn: string | null;
  report: Report;
}

export interface Settings {
  username: string;
  engine: string;
  depth: number;
  /** Neue Partien im Hintergrund analysieren */
  autoAnalyze: boolean;
}
