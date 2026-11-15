# LuftChess

Desktop client for Chess.com with local game analysis. Tauri 2, Rust, React. The interface is in German.

- Chess.com in its own window
- Analysis of finished games with Stockfish: accuracy, mistakes, better moves with lines, time per move, opening
- Statistics across all analysed games
- Training with positions from your own mistakes
- Analyses are stored locally, optionally run in the background

## Development

```bash
npm install
powershell -ExecutionPolicy Bypass -File scripts/get-stockfish.ps1
npm run tauri dev
```

Build with installer:

```bash
npm run tauri build
```

## Stockfish

The installer ships Stockfish 19 (universal build, picks the best code for the CPU). It is not in the repository; `scripts/get-stockfish.ps1` downloads the official release into `src-tauri/engine/`. Stockfish is licensed under GPLv3, source: <https://github.com/official-stockfish/Stockfish>.

## Third-party licenses

- Pieces: cburnett by Colin M. L. Burnett (GPLv2+)
- Openings: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0)
