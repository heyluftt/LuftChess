import type React from "react";
import type { Quality } from "../types";

interface Props {
  /** Stellung als FEN (nur das Brett-Feld wird gebraucht) */
  fen: string;
  /** Schwarz unten */
  flipped: boolean;
  /** Zuletzt gespielter Zug (UCI), Felder werden in der Bewertungsfarbe markiert */
  last?: { uci: string; quality: Quality } | null;
  /** Besserer Zug (UCI) als Pfeil */
  arrow?: string | null;
  /** König der Seite am Zug steht im Schach */
  check?: boolean;
  /** Klick auf ein Feld (z. B. "e4"); macht das Brett bedienbar */
  onSquare?: (square: string) => void;
  /** Hervorgehobenes Feld (gewählte Figur) */
  picked?: string | null;
}

const S = 100; // Feldgröße im viewBox

// Figuren: cburnett (Colin M. L. Burnett), Dateiname = Farbe + Figur, z. B. wn.svg
const pieceFiles = import.meta.glob<string>("../pieces/*.svg", { eager: true, query: "?url", import: "default" });
const pieceUrl = (p: string) => {
  const name = (p === p.toUpperCase() ? "w" : "b") + p.toLowerCase();
  return pieceFiles[`../pieces/${name}.svg`];
};
const files = "abcdefgh";

/** Brett-Teil der FEN in 64 Felder, Index = Rang * 8 + Linie (a1 = 0) */
function parseBoard(fen: string): (string | null)[] {
  const squares: (string | null)[] = Array(64).fill(null);
  const rows = fen.split(" ")[0].split("/");
  rows.forEach((row, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const c of row) {
      if (c >= "1" && c <= "8") file += Number(c);
      else {
        if (file < 8 && rank >= 0) squares[rank * 8 + file] = c;
        file++;
      }
    }
  });
  return squares;
}

const sq = (name: string) => (name.charCodeAt(0) - 97) + (Number(name[1]) - 1) * 8;

export function Board({ fen, flipped, last, arrow, check, onSquare, picked }: Props) {
  const squares = parseBoard(fen);
  const turn = fen.split(" ")[1] === "b" ? "b" : "w";

  const pos = (i: number) => {
    const f = i % 8;
    const r = Math.floor(i / 8);
    return { x: (flipped ? 7 - f : f) * S, y: (flipped ? r : 7 - r) * S };
  };
  const center = (i: number) => {
    const p = pos(i);
    return { x: p.x + S / 2, y: p.y + S / 2 };
  };

  const lastSquares = last ? [sq(last.uci.slice(0, 2)), sq(last.uci.slice(2, 4))] : [];
  const kingInCheck = check ? squares.findIndex((p) => p === (turn === "w" ? "K" : "k")) : -1;

  let arrowEl = null;
  if (arrow && arrow.length >= 4) {
    const a = center(sq(arrow.slice(0, 2)));
    const b = center(sq(arrow.slice(2, 4)));
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > 0) {
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const head = 34;
      const tip = { x: b.x - ux * 8, y: b.y - uy * 8 };
      const base = { x: tip.x - ux * head, y: tip.y - uy * head };
      const half = 22;
      arrowEl = (
        <g className="board-arrow">
          <line x1={a.x} y1={a.y} x2={base.x} y2={base.y} strokeWidth={16} strokeLinecap="round" />
          <polygon
            points={`${tip.x},${tip.y} ${base.x - uy * half},${base.y + ux * half} ${base.x + uy * half},${base.y - ux * half}`}
          />
        </g>
      );
    }
  }

  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onSquare) return;
    const r = e.currentTarget.getBoundingClientRect();
    const col = Math.floor(((e.clientX - r.left) / r.width) * 8);
    const row = Math.floor(((e.clientY - r.top) / r.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return;
    const file = flipped ? 7 - col : col;
    const rank = flipped ? row : 7 - row;
    onSquare(files[file] + (rank + 1));
  };

  return (
    <svg
      className="board"
      data-interactive={onSquare ? true : undefined}
      viewBox={`0 0 ${8 * S} ${8 * S}`}
      role="img"
      aria-label={`Stellung: ${fen}`}
      onClick={click}
    >
      {squares.map((_, i) => {
        const { x, y } = pos(i);
        const light = (i % 8 + Math.floor(i / 8)) % 2 === 1;
        return <rect key={i} x={x} y={y} width={S} height={S} className={light ? "sq-light" : "sq-dark"} />;
      })}

      {last &&
        lastSquares.map((i, k) => {
          const { x, y } = pos(i);
          return (
            <rect
              key={`l${k}`}
              x={x}
              y={y}
              width={S}
              height={S}
              className={`sq-last q-fill--${last.quality === "gut" ? "neutral" : last.quality}`}
            />
          );
        })}

      {picked && (
        <rect {...(({ x, y }) => ({ x, y }))(pos(sq(picked)))} width={S} height={S} className="sq-picked" />
      )}

      {kingInCheck >= 0 && (
        <circle {...(({ x, y }) => ({ cx: x, cy: y }))(center(kingInCheck))} r={S * 0.48} className="sq-check" />
      )}

      {/* Koordinaten am Rand */}
      {Array.from({ length: 8 }, (_, k) => {
        const file = flipped ? 7 - k : k;
        const rank = flipped ? k + 1 : 8 - k;
        return (
          <g key={`c${k}`} className="board-coord">
            <text x={k * S + S - 6} y={8 * S - 7} textAnchor="end" data-light={k % 2 === 1 || undefined}>
              {files[file]}
            </text>
            <text x={5} y={k * S + 20} data-light={k % 2 === 0 || undefined}>
              {rank}
            </text>
          </g>
        );
      })}

      {squares.map((p, i) => {
        if (!p) return null;
        const { x, y } = pos(i);
        return <image key={`p${i}`} href={pieceUrl(p)} x={x} y={y} width={S} height={S} className="piece-img" />;
      })}

      {arrowEl}
    </svg>
  );
}
