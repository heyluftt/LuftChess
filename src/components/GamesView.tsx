import { useState } from "react";
import type { Game, Summary } from "../types";
import { endReason, fmtPct, fmtTimeControl, fmtWhen, outcomeFor } from "../format";

interface Props {
  username: string;
  games: Game[] | null;
  summaries: Record<string, Summary>;
  busyUrl?: string | null;
  onSettings: () => void;
  error: string | null;
  loading: boolean;
  onReload: () => void;
  onMore?: () => void;
  onOpen: (game: Game) => void;
}

const outcomeText = { win: "Sieg", loss: "Niederlage", draw: "Remis" } as const;
const classes = [
  ["", "Alle"],
  ["bullet", "Bullet"],
  ["blitz", "Blitz"],
  ["rapid", "Schnell"],
  ["daily", "Täglich"],
] as const;

export function GamesView(props: Props) {
  if (!props.username) return <NoUser onSettings={props.onSettings} />;
  return <GameList {...props} />;
}

export function NoUser({ onSettings }: { onSettings?: () => void }) {
  return (
    <div className="view">
      <div className="notice">
        <h3>Chess.com-Name fehlt</h3>
        <p>Trag unter Optionen deinen Chess.com-Benutzernamen ein.</p>
        {onSettings && (
          <button className="btn" onClick={onSettings}>
            Zu den Optionen
          </button>
        )}
      </div>
    </div>
  );
}

function GameList({ username, games, summaries, busyUrl, error, loading, onReload, onMore, onOpen }: Props) {
  const [filter, setFilter] = useState("");
  const present = new Set(games?.map((g) => g.timeClass));
  const shown = games?.filter((g) => !filter || g.timeClass === filter) ?? null;
  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h2>Letzte Partien</h2>
          <p className="muted">{username}</p>
        </div>
        <button className="btn btn--quiet" onClick={onReload} disabled={loading}>
          {loading ? "Lädt …" : "Aktualisieren"}
        </button>
      </header>

      {error && (
        <div className="notice notice--error" role="alert">
          <p>{error}</p>
          <button className="btn" onClick={onReload}>
            Erneut versuchen
          </button>
        </div>
      )}

      {!error && games && games.length === 0 && (
        <div className="notice">
          <p>Noch keine beendeten Partien. Spiel eine Partie – danach taucht sie hier auf.</p>
        </div>
      )}

      {!games && loading && (
        <ul className="games" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="game game--skeleton" />
          ))}
        </ul>
      )}

      {games && present.size > 1 && (
        <div className="chips" role="group" aria-label="Bedenkzeit">
          {classes
            .filter(([k]) => !k || present.has(k))
            .map(([k, label]) => (
              <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {label}
              </button>
            ))}
        </div>
      )}

      {shown && shown.length > 0 && (
        <ul className="games">
          {shown.map((g, i) => {
            const { me, outcome } = outcomeFor(g, username);
            const opp = me === "white" ? g.black : g.white;
            const mine = g[me];
            const sum = summaries[g.url];
            const acc = sum ? (me === "white" ? sum.accuracyWhite : sum.accuracyBlack) : null;
            return (
              <li key={g.url} style={{ "--i": i } as React.CSSProperties}>
                <button className="game" data-outcome={outcome} onClick={() => onOpen(g)}>
                  <span className={`piece piece--${me}`} title={me === "white" ? "Du hattest Weiß" : "Du hattest Schwarz"} />
                  <span className="game-main">
                    <span className="game-opp">
                      {opp.username}
                      {opp.rating !== null && <span className="rating">{opp.rating}</span>}
                    </span>
                    <span className="game-meta">
                      <span>{fmtTimeControl(g.timeControl)}</span>
                      <span>{endReason(g)}</span>
                      <span>{fmtWhen(g.endTime)}</span>
                      {busyUrl === g.url && <span className="game-busy">analysiert …</span>}
                      {acc !== null && (
                        <span className="game-acc" title="Deine Genauigkeit (gespeicherte Analyse)">
                          {fmtPct(acc)} %
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="game-result">
                    <span className="outcome">{outcomeText[outcome]}</span>
                    {mine.rating !== null && <span className="rating">{mine.rating}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {games && onMore && (
        <button className="btn btn--quiet more" onClick={onMore} disabled={loading}>
          {loading ? "Lädt …" : "Mehr laden"}
        </button>
      )}

      <p className="footnote">Nur beendete Partien – während des Spielens gibt es keine Engine-Hilfe.</p>
    </div>
  );
}
