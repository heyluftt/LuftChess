import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const IconPlay = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="10" cy="5.2" r="2.4" />
    <path d="M7.6 9.2h4.8M8.2 9.2c0 2.6-.8 4.4-2 5.8h7.6c-1.2-1.4-2-3.2-2-5.8" />
    <path d="M5 17.2h10" />
  </svg>
);

export const IconPuzzle = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3.5" width="4.4" height="4.4" rx=".6" />
    <rect x="3.5" y="7.9" width="4.4" height="4.4" rx=".6" />
    <rect x="3.5" y="12.3" width="4.4" height="4.4" rx=".6" />
    <rect x="7.9" y="12.3" width="4.4" height="4.4" rx=".6" fill="currentColor" />
    <path d="M14.5 5.5l2 2-2 2" />
  </svg>
);

export const IconLearn = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M10 5.6C8.4 4.4 6.2 4 3.5 4.2v10.6c2.7-.2 4.9.2 6.5 1.4 1.6-1.2 3.8-1.6 6.5-1.4V4.2C13.8 4 11.6 4.4 10 5.6z" />
    <path d="M10 5.6v10.6" />
  </svg>
);

export const IconArchive = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="10" cy="10" r="6.6" />
    <path d="M10 6.4V10l2.4 1.6" />
  </svg>
);

export const IconBack = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M11.5 5.5L7 10l4.5 4.5" />
  </svg>
);

export const IconReload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M15.6 10a5.6 5.6 0 1 1-1.7-4" />
    <path d="M14.4 3.4v3h-3" />
  </svg>
);

export const IconAnalysis = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 16V11M7.3 16V7M10.6 16v-5.5M13.9 16V4.5" />
    <path d="M3 16.6h14" />
  </svg>
);

export const IconStats = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3.5 14.5l4-4.5 3 2.5 5.5-6.5" />
    <path d="M3 17h14" />
  </svg>
);

export const IconTraining = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="10" cy="10" r="6.5" />
    <circle cx="10" cy="10" r="3" />
    <circle cx="10" cy="10" r=".6" fill="currentColor" />
  </svg>
);

export const IconSettings =(p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 6h5M13 6h3M4 14h2M10 14h6" />
    <circle cx="11" cy="6" r="1.9" />
    <circle cx="8" cy="14" r="1.9" />
  </svg>
);

export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
  </svg>
);

export const IconExternal = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ width: 16, height: 16, ...p })}>
    <path d="M8.5 4.5h-4v11h11v-4M11.5 4.5h4v4M15.5 4.5L9 11" />
  </svg>
);

export const Mark = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
    <rect x="1" y="1" width="26" height="26" rx="6" fill="var(--ebony)" stroke="var(--line-strong)" />
    <path d="M1 17h26v4a6 6 0 0 1-6 6H7a6 6 0 0 1-6-6z" fill="var(--ivory)" />
    <path d="M9.5 6.5v8h6" stroke="var(--ivory)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
