# LuftChess – Design

Richtung „Klubraum“, seit 2026-11-21.
Nussholz, Messing, Serifen-Titel – wie ein alter Schachklub. Neben Chess.com bleibt die App ruhig und dunkel.

## Grundsätze

- Messing markiert Bedienelemente (primäre Buttons, aktive Filter, aktive Seite in der Leiste, Fokus, Schalter).
- Sonst trägt Farbe nur Bedeutung: die Zugbewertung (`--q-*`), unverändert.
- Serifenschrift nur für Überschriften und große Zahlen (Genauigkeit, Kennzahlen); alles andere in der Textschrift.

## Farben (`src/styles.css`, `:root`)

| Token | Wert | Rolle |
|---|---|---|
| `--graphite` | `#1f1914` | Grundfläche (Nussholz dunkel) |
| `--rail-bg` | `#18130f` | linke Leiste |
| `--panel-bg` | `#2a221b` | rechtes Panel |
| `--raise` | `#33291f` | angehobene Flächen |
| `--line` / `--line-strong` | `#3e3226` / `#54453a` | Linien |
| `--ivory` | `#f1e6d4` | Text (Pergament) |
| `--ash` / `--dim` | `#a8957e` / `#7a6b5a` | gedämpfter Text |
| `--ebony` | `#120e0b` | tiefste Fläche, Eingabefelder |
| `--brass` / `--on-brass` | `#c9a14a` / `#1f1914` | Akzent und Text darauf |

Die Variablennamen stammen aus dem früheren Design „Graphit & Elfenbein“ und wurden beibehalten.

## Schriften (lokal, `src/assets/fonts/`, eingebunden in `src/main.tsx`)

| Rolle | Schrift | Schnitte | Lizenz |
|---|---|---|---|
| Titel, große Zahlen (`--font-title`) | Fraunces | 500, 600 | OFL-1.1 |
| Text (`--font-text`) | Instrument Sans | 400–700 | OFL-1.1 |

Keine CDN-Links, die App muss offline starten.

## Formen

- Radien: `--r-s` 4px, `--r-m` 8px (unverändert).
- Brett: Ahorn `--sq-light` `#e3c9a0`, Nussbaum `--sq-dark` `#a87a52`.

## Fenster

Eigene Titelleiste (36 px, `--titlebar`), Systemrahmen aus (`decorations(false)` in `lib.rs`).
Links Logo und Name in Fraunces, rechts klassische Fensterknöpfe, Schließen rot beim Überfahren.
Chess.com sitzt darunter; unten und rechts bleiben 5 px frei, damit sich das Fenster dort ziehen lässt.

## Bedienelemente

- Scrollbalken schmal, runder Daumen in `--line-strong`, keine Pfeile.
- Regler mit Messingspur und Füllstand, Schalter statt Häkchen.
- Fokus-Rahmen nur bei Tastatur (`html.tastatur`), Eingabefelder färben den Rand.
- Markierter Text in Messing.

## Bewegung

Weich, Stufe 2. Tokens: `--dauer-druck` 90 ms, `--dauer-kurz` 150 ms, `--dauer-mittel` 260 ms,
Kurven `--kurve-standard`, `--kurve-weich`, `--kurve-feder`.

| Moment | Effekt |
|---|---|
| Ansicht wechseln | Panel blendet ein und hebt sich 6 px |
| Listen | Partien und Übersicht erscheinen gestaffelt |
| Drücken | Knöpfe geben auf 96 % nach und federn zurück |
| Zug zeigen | Figur gleitet vom Start- aufs Zielfeld (Signatur) |
| Bewertung | Leiste neben dem Brett gleitet |
| Fehlversuch im Training | Brett schüttelt kurz |
| Gelöst | Statuszeile springt auf |

`prefers-reduced-motion` schaltet alles ab.
