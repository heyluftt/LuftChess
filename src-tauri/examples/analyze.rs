//! Analysiert eine PGN ohne Oberfläche und gibt den Bericht als JSON aus.
//! Erzeugt u. a. die Beispieldaten für die Browser-Vorschau:
//!
//!   cargo run --example analyze -- ../src/dev/pgn.json engine/stockfish.exe 14 > ../src/dev/report.json
//!
//! Die PGN-Datei darf reiner Text oder ein JSON-String sein.

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [pgn_path, engine, rest @ ..] = args.as_slice() else {
        eprintln!("Aufruf: analyze <pgn-datei> <stockfish> [tiefe]");
        std::process::exit(2);
    };
    let depth = rest.first().and_then(|d| d.parse().ok()).unwrap_or(14);
    let raw = std::fs::read_to_string(pgn_path).expect("PGN-Datei nicht lesbar");
    let pgn = serde_json::from_str::<String>(&raw).unwrap_or(raw);

    let report = luftchess_lib::analysis::analyze(
        &pgn,
        engine,
        depth,
        |done, total| eprint!("\r{done}/{total}"),
        || false,
    )
    .unwrap_or_else(|e| {
        eprintln!("\n{e}");
        std::process::exit(1);
    });
    eprintln!();
    println!("{}", serde_json::to_string(&report).unwrap());
}
