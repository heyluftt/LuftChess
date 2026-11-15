// Nur für die Browser-Vorschau (npm run dev ohne Tauri). Echte Stockfish-Analyse
// einer Partie, damit das Layout mit realistischen Daten geprüft werden kann.
import report from "./report.json";
import pgn from "./pgn.json";
import type { Game } from "../types";

const now = Math.floor(Date.now() / 1000);

const games: Game[] = [
  {
    url: "https://www.chess.com/game/live/100000000001",
    pgn,
    endTime: now - 60 * 40,
    timeClass: "rapid",
    timeControl: "600",
    white: { username: "TurmImNebel", rating: 218, result: "checkmated" },
    black: { username: "luftdemo", rating: 213, result: "win" },
  },
  {
    url: "https://www.chess.com/game/live/1",
    pgn,
    endTime: now - 60 * 60 * 3,
    timeClass: "rapid",
    timeControl: "600",
    white: { username: "luftdemo", rating: 204, result: "win" },
    black: { username: "Springerin42", rating: 179, result: "resigned" },
  },
  {
    url: "https://www.chess.com/game/live/2",
    pgn,
    endTime: now - 60 * 60 * 26,
    timeClass: "rapid",
    timeControl: "600",
    white: { username: "laeuferpaar", rating: 192, result: "checkmated" },
    black: { username: "luftdemo", rating: 204, result: "win" },
  },
  {
    url: "https://www.chess.com/game/live/3",
    pgn,
    endTime: now - 60 * 60 * 30,
    timeClass: "blitz",
    timeControl: "180+2",
    white: { username: "luftdemo", rating: 188, result: "timeout" },
    black: { username: "Nordlicht_88", rating: 231, result: "win" },
  },
  {
    url: "https://www.chess.com/game/live/4",
    pgn,
    endTime: now - 60 * 60 * 50,
    timeClass: "rapid",
    timeControl: "600",
    white: { username: "Remisbreite", rating: 199, result: "agreed" },
    black: { username: "luftdemo", rating: 196, result: "agreed" },
  },
];

// Ältere Partien auffüllen, damit "Mehr laden" etwas zu tun hat
for (let i = 5; i < 40; i++) {
  const base = games[i % 5];
  games.push({ ...base, url: `https://www.chess.com/game/live/${100 + i}`, endTime: now - 60 * 60 * 24 * (i - 2) });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Gespeicherte Analysen der Vorschau: jede zweite Partie gilt als analysiert,
// Genauigkeit leicht gestreut, damit die Statistik etwas zeigt
const saved = new Map<string, typeof report>();
games.forEach((g, i) => {
  if (i % 2) return;
  const d = ((i * 37) % 23) - 11;
  saved.set(g.url, { ...report, white: g.white.username, black: g.black.username, accuracyWhite: report.accuracyWhite + d, accuracyBlack: report.accuracyBlack - d / 2 });
});

export async function mockCall(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  switch (cmd) {
    case "recent_games":
      await wait(300);
      return games.slice(0, Number(args?.limit ?? 25));
    case "analyze_game":
      await wait(600);
      saved.set(String(args?.url), report);
      return report;
    case "saved_all":
      return [...saved.entries()].map(([url, r]) => {
        const { pgn: p, url: _u, ...game } = games.find((g) => g.url === url)!;
        return { url, savedAt: now, game, pgn: p, report: r };
      });
    case "saved_report":
      return saved.get(String(args?.url)) ?? null;
    case "saved_summaries":
      return Object.fromEntries(
        ((args?.urls as string[]) ?? [])
          .filter((u) => saved.has(u))
          .map((u) => [u, { accuracyWhite: report.accuracyWhite, accuracyBlack: report.accuracyBlack, depth: report.depth }]),
      );
    case "find_engine":
      return "C:\\Users\\Spieler\\AppData\\Roaming\\dev.heyluftt.luftchess\\stockfish.exe";
    case "engine_folder":
      return "C:\\Users\\Spieler\\AppData\\Roaming\\dev.heyluftt.luftchess";
    default:
      return undefined;
  }
}
