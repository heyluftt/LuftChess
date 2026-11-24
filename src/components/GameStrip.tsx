import { useRef, useState } from "react";
import type { MoveReport, Score } from "../types";
import { winPct } from "../format";

interface Props {
  start: Score;
  moves: MoveReport[];
  me: "white" | "black";
  selected: number | null;
  onSelect: (ply: number) => void;
}

const H = 112;
const MARK = 10;
const flagged = new Set(["patzer", "fehler", "verpasst"]);

export function GameStrip({ start, moves, me, selected, onSelect }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const n = moves.length;
  const cols = n + 1;
  const W = 1000;
  const cw = W / cols;
  const gap = cw > 6 ? 1.5 : 0;

  const shares = [start, ...moves.map((m) => m.score)].map((s) => {
    const w = winPct(s) / 100;
    return me === "white" ? w : 1 - w;
  });
  const mine = me === "white" ? "var(--ivory)" : "var(--ebony)";
  const theirs = me === "white" ? "var(--ebony)" : "var(--ivory)";

  const plyAt = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return null;
    const i = Math.floor(((clientX - r.left) / r.width) * cols);
    return Math.max(0, Math.min(n, i));
  };

  const active = hover ?? selected;

  const spent = moves.map((m) => m.spent);
  const known = spent.filter((s): s is number => s !== null).sort((a, b) => a - b);
  const cap = known.length ? Math.max(1, known[Math.floor((known.length - 1) * 0.95)]) : 0;
  const TH = 36;

  return (
    <>
    <svg
      ref={ref}
      className="strip"
      viewBox={`0 0 ${W} ${H + MARK}`}
      preserveAspectRatio="none"
      role="slider"
      aria-label="Bewertungsverlauf, Pfeiltasten wählen den Zug"
      aria-valuemin={0}
      aria-valuemax={n}
      aria-valuenow={selected ?? n}
      tabIndex={0}
      onPointerMove={(e) => setHover(plyAt(e.clientX))}
      onPointerLeave={() => setHover(null)}
      onPointerDown={(e) => {
        const p = plyAt(e.clientX);
        if (p !== null) onSelect(p);
      }}
    >
      {shares.map((s, i) => {
        const x = i * cw + gap / 2;
        const w = cw - gap;
        const mineH = Math.max(1, s * H);
        return (
          <g key={i}>
            <rect x={x} y={MARK} width={w} height={H - mineH} fill={theirs} />
            <rect x={x} y={MARK + H - mineH} width={w} height={mineH} fill={mine} />
          </g>
        );
      })}

      <line x1="0" x2={W} y1={MARK + H / 2} y2={MARK + H / 2} className="strip-mid" />

      {moves.map((m, i) =>
        flagged.has(m.quality) ? (
          <rect
            key={m.ply}
            x={(i + 1) * cw + gap / 2}
            y={0}
            width={Math.max(cw - gap, 4)}
            height={MARK - 4}
            rx={1}
            className={`q-fill q-fill--${m.quality}`}
            opacity={(m.white ? "white" : "black") === me ? 1 : 0.45}
          />
        ) : null,
      )}

      {active !== null && (
        <rect
          x={active * cw}
          y={MARK - 1}
          width={cw}
          height={H + 2}
          className="strip-cursor"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
    {known.length > 0 && (
      <svg
        className="timebar"
        viewBox={`0 0 ${W} ${TH}`}
        preserveAspectRatio="none"
        aria-label="Zeit pro Zug"
        onPointerMove={(e) => setHover(plyAt(e.clientX))}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(e) => {
          const p = plyAt(e.clientX);
          if (p !== null) onSelect(p);
        }}
      >
        {moves.map((m, i) => {
          if (m.spent === null) return null;
          const h = Math.max(1, (Math.min(m.spent, cap) / cap) * (TH - 2));
          const isMine = (m.white ? "white" : "black") === me;
          return (
            <rect
              key={m.ply}
              x={(i + 1) * cw + gap / 2}
              y={TH - h}
              width={cw - gap}
              height={h}
              className={isMine ? "timebar-mine" : "timebar-theirs"}
              data-over={m.spent > cap || undefined}
            />
          );
        })}
        {active !== null && active > 0 && (
          <rect x={active * cw} y={0} width={cw} height={TH} className="strip-cursor" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
    )}
    </>
  );
}
