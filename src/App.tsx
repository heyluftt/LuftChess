import { useCallback, useEffect, useRef, useState } from "react";
import { api, inTauri, onEvent } from "./api";
import type { Game, Report, SavedEntry, Settings, Summary } from "./types";
import { Rail, viewGroup, type PanelView } from "./components/Rail";
import { StatsView } from "./components/StatsView";
import { TrainingView } from "./components/TrainingView";
import { entryToGame } from "./format";
import { GamesView, NoUser } from "./components/GamesView";
import { AnalysisView } from "./components/AnalysisView";
import { SettingsView } from "./components/SettingsView";

const PANEL = 384; // muss zu --panel in styles.css passen
const KEY = "luftchess.settings";
const PAGE = 25;
// In der Browser-Vorschau passt der Name zu den Beispieldaten
const defaults: Settings = { username: inTauri ? "" : "luftdemo", engine: "", depth: 16, autoAnalyze: false };
/** Chess.com-Seiten, auf denen gespielt wird: dort rechnet keine Engine */
const PLAY_PAGE = /^\/(play|game|live)(\/|$)/;

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [panelOpen, setPanelOpen] = useState(!inTauri);
  const [view, setView] = useState<PanelView>("games");
  const [chessPath, setChessPath] = useState(inTauri ? "/play/online" : "/");

  const [games, setGames] = useState<Game[] | null>(null);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [limit, setLimit] = useState(PAGE);

  const [game, setGame] = useState<Game | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [engineMissing, setEngineMissing] = useState(false);
  const [engineFolder, setEngineFolder] = useState<string | null>(null);
  const cache = useRef(new Map<string, Report>());
  const running = useRef<string | null>(null);
  const manualBusy = useRef(false);
  const [manualRunning, setManualRunning] = useState(false);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const bgFailed = useRef(new Set<string>());
  const onPlayPage = PLAY_PAGE.test(chessPath);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* Speicher nicht verfügbar – Einstellungen gelten nur für diese Sitzung */
    }
  }, [settings]);

  useEffect(() => {
    api.setPanel(panelOpen ? PANEL : 0);
  }, [panelOpen]);

  useEffect(() => {
    const offs = [
      onEvent<string>("chess-nav", (url) => {
        try {
          setChessPath(new URL(url).pathname);
        } catch {
          /* ignorieren */
        }
      }),
      // Fortschritt nur für die angeklickte Partie, nicht für die Hintergrund-Analyse
      onEvent<{ done: number; total: number }>("analysis-progress", (p) => {
        if (manualBusy.current) setProgress(p);
      }),
    ];
    return () => void offs.forEach((p) => p.then((off) => off()));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loadGames = useCallback(async (count: number = limit) => {
    if (!settings.username) return;
    setGamesLoading(true);
    setGamesError(null);
    setLimit(count);
    try {
      const list = await api.recentGames(settings.username, count);
      setGames(list);
      api
        .savedSummaries(list.map((g) => g.url))
        .then((s) => setSummaries((prev) => ({ ...prev, ...s })))
        .catch(() => {});
    } catch (e) {
      setGamesError(String(e));
    } finally {
      setGamesLoading(false);
    }
  }, [settings.username, limit]);

  // Partien laden, sobald die Liste sichtbar wird und für diesen Namen noch nichts geladen ist
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (panelOpen && view === "games" && settings.username && loadedFor.current !== settings.username) {
      loadedFor.current = settings.username;
      setGames(null);
      loadGames(PAGE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen, view, settings.username]);

  const resolveEngine = async (): Promise<string | null> => {
    if (settings.engine) return settings.engine;
    const found = await api.findEngine();
    if (found) setSettings((s) => ({ ...s, engine: found }));
    return found;
  };

  const remember = (url: string, r: Report) => {
    cache.current.set(url, r);
    setSummaries((s) => ({
      ...s,
      [url]: { accuracyWhite: r.accuracyWhite, accuracyBlack: r.accuracyBlack, depth: r.depth },
    }));
  };

  /** Erst Arbeitsspeicher, dann gespeicherte Analyse, sonst Stockfish. `force` rechnet immer neu. */
  const analyze = async (g: Game, force = false) => {
    running.current = g.url;
    // eine neue Anfrage löst die vorige ab
    manualBusy.current = false;
    setManualRunning(false);
    setAnalysisError(null);
    setEngineMissing(false);
    setProgress(null);
    if (force) cache.current.delete(g.url);
    setReport(cache.current.get(g.url) ?? null);
    if (cache.current.has(g.url)) return;

    if (!force) {
      const stored = await api.savedReport(g.url).catch(() => null);
      if (stored) {
        remember(g.url, stored);
        if (running.current === g.url) setReport(stored);
        return;
      }
      if (running.current !== g.url) return;
    }

    const engine = await resolveEngine();
    if (running.current !== g.url) return;
    if (!engine) {
      setEngineMissing(true);
      setEngineFolder(await api.engineFolder().catch(() => null));
      return;
    }
    setProgress({ done: 0, total: 0 });
    manualBusy.current = true;
    setManualRunning(true);
    try {
      const r = await api.analyze(g, engine, settings.depth);
      remember(g.url, r);
      if (running.current === g.url) setReport(r);
    } catch (e) {
      const msg = String(e);
      if (running.current !== g.url) return;
      if (msg.startsWith("Stockfish konnte nicht gestartet")) {
        setEngineMissing(true);
        setEngineFolder(await api.engineFolder().catch(() => null));
      } else setAnalysisError(msg);
    } finally {
      if (running.current === g.url) {
        setProgress(null);
        manualBusy.current = false;
        setManualRunning(false);
      }
    }
  };

  // Hintergrund-Analyse: eine Partie nach der anderen, nur wenn nichts anderes rechnet
  // und Chess.com keine Spielseite zeigt
  useEffect(() => {
    if (!settings.autoAnalyze || !games || manualRunning || bgUrl || onPlayPage) return;
    const next = games.find((g) => !summaries[g.url] && !bgFailed.current.has(g.url));
    if (!next) return;
    let stale = false;
    (async () => {
      const engine = await resolveEngine();
      if (!engine || stale) return;
      setBgUrl(next.url);
      try {
        remember(next.url, await api.analyze(next, engine, settings.depth));
      } catch (e) {
        // abgebrochen heißt: später erneut versuchen
        if (!String(e).includes("abgebrochen")) bgFailed.current.add(next.url);
      } finally {
        setBgUrl(null);
      }
    })();
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoAnalyze, games, summaries, manualRunning, bgUrl, onPlayPage]);

  // Auf einer Spielseite sofort aufhören zu rechnen
  useEffect(() => {
    if (onPlayPage && bgUrl) api.cancelAnalysis();
  }, [onPlayPage, bgUrl]);

  // Option ausgeschaltet: laufende Hintergrund-Analyse beenden
  useEffect(() => {
    if (!settings.autoAnalyze && bgUrl) api.cancelAnalysis();
  }, [settings.autoAnalyze, bgUrl]);

  const openGame = (g: Game) => {
    setGame(g);
    setView("analysis");
    analyze(g);
  };

  const toggle = (target: PanelView) => {
    if (panelOpen && viewGroup(view) === target) {
      setPanelOpen(false);
      return;
    }
    setPanelOpen(true);
    setView(target === "games" && game && view === "analysis" ? "analysis" : target);
  };

  const openEntry = (e: SavedEntry) => openGame(entryToGame(e));

  return (
    <div className="shell" data-panel={panelOpen || undefined}>
      <Rail chessPath={chessPath} panelOpen={panelOpen} view={view} onToggle={toggle} />

      <main className="stage" aria-label="Chess.com">
        {inTauri ? (
          <p className="muted">Chess.com lädt …</p>
        ) : (
          <div className="stage-preview">
            <p>Hier läuft Chess.com.</p>
            <p className="muted">Browser-Vorschau – in der App liegt hier die Webseite.</p>
          </div>
        )}
      </main>

      {panelOpen && (
        <aside className="panel">
          {view === "games" && (
            <GamesView
              username={settings.username}
              games={games}
              summaries={summaries}
              busyUrl={bgUrl}
              onSettings={() => setView("settings")}
              error={gamesError}
              loading={gamesLoading}
              onReload={() => loadGames()}
              onMore={games && games.length >= limit ? () => loadGames(limit + PAGE) : undefined}
              onOpen={openGame}
            />
          )}
          {view === "analysis" && game && (
            <AnalysisView
              game={game}
              username={settings.username}
              report={report}
              progress={progress}
              error={analysisError}
              engineMissing={engineMissing}
              engineFolder={engineFolder}
              onBack={() => setView("games")}
              onRetry={() => analyze(game, true)}
              onSettings={() => setView("settings")}
            />
          )}
          {(view === "stats" || view === "training") && !settings.username && (
            <NoUser onSettings={() => setView("settings")} />
          )}
          {view === "stats" && settings.username && <StatsView username={settings.username} onOpen={openEntry} />}
          {view === "training" && settings.username && (
            <TrainingView username={settings.username} onOpen={openEntry} />
          )}
          {view === "settings" &&<SettingsView settings={settings} onChange={setSettings} />}
        </aside>
      )}
    </div>
  );
}
