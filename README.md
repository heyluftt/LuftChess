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
npm run tauri dev
```

Build with installer:

```bash
npm run tauri build
```

## Stockfish

Expects `src-tauri/engine/stockfish.exe` (not in the repository). Download: <https://stockfishchess.org/download/>. Stockfish is licensed under GPLv3.

## Third-party licenses

- Pieces: cburnett by Colin M. L. Burnett (GPLv2+)
- Openings: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0)
