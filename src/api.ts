import type { Game, Report, SavedEntry, Summary } from "./types";

/** Läuft die Oberfläche in Tauri oder nur im Browser (Vorschau)? */
export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (inTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  const { mockCall } = await import("./dev/mock");
  return mockCall(cmd, args) as Promise<T>;
}

export const api = {
  setPanel: (width: number) => call<void>("set_panel", { width }),
  go: (path: string) => call<void>("chess_go", { path }),
  action: (action: "back" | "forward" | "reload") => call<void>("chess_action", { action }),
  recentGames: (username: string, limit: number) => call<Game[]>("recent_games", { username, limit }),
  analyze: (g: Game, engine: string, depth: number) => {
    const { url, pgn, ...game } = g;
    return call<Report>("analyze_game", { url, game, pgn, engine, depth });
  },
  savedAll: () => call<SavedEntry[]>("saved_all"),
  cancelAnalysis: () => call<void>("cancel_analysis"),
  savedReport: (url: string) => call<Report | null>("saved_report", { url }),
  savedSummaries: (urls: string[]) => call<Record<string, Summary>>("saved_summaries", { urls }),
  findEngine: () => call<string | null>("find_engine"),
  engineFolder: () => call<string>("engine_folder"),
};

export async function onEvent<T>(name: string, fn: (payload: T) => void): Promise<() => void> {
  if (!inTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(name, (e) => fn(e.payload));
}
