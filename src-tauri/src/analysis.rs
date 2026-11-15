//! Partie-Analyse: PGN einlesen, jede Stellung mit Stockfish (UCI) bewerten
//! und jeden Zug einordnen. Läuft nur auf abgeschlossenen Partien.

use crate::openings::{self, Opening};
use serde::{Deserialize, Serialize};
use shakmaty::{
    fen::Fen, san::San, san::SanPlus, uci::UciMove, CastlingMode, Chess, Color, EnPassantMode, Position, Square,
};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

/// Ab diesem Wert gilt eine Bewertung als "entschieden"; Matts werden darauf gedeckelt.
const CLAMP_CP: i32 = 1000;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Quality {
    /// Einziger guter Zug in der Stellung
    Grossartig,
    Best,
    /// Fast so gut wie der beste Zug
    Exzellent,
    Gut,
    Ungenau,
    Fehler,
    Verpasst,
    Patzer,
    /// Eröffnungstheorie
    Buch,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Score {
    /// Centipawns aus Sicht von Weiß (bei Matt gedeckelt)
    pub cp: i32,
    /// Matt in N aus Sicht von Weiß (positiv = Weiß setzt matt)
    pub mate: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LineStep {
    pub san: String,
    pub uci: String,
    pub fen: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveReport {
    pub ply: usize,
    pub number: u32,
    pub white: bool,
    pub san: String,
    /// Gespielter Zug in UCI (e2e4, e1g1, e7e8q)
    pub uci: String,
    /// Stellung nach dem Zug
    pub fen: String,
    /// Bewertung nach dem Zug
    pub score: Score,
    /// Bester Zug laut Engine in der Stellung vor dem Zug
    pub best_san: Option<String>,
    pub best_uci: Option<String>,
    /// Bewertung, die der beste Zug gehalten hätte (Stellung vor dem Zug)
    pub score_before: Score,
    /// Verlust in Centipawns aus Sicht des Ziehenden (>= 0)
    pub loss: i32,
    pub quality: Quality,
    /// Engine-Variante ab dem besseren Zug (leer, wenn der beste Zug gespielt wurde)
    #[serde(default)]
    pub best_line: Vec<LineStep>,
    /// Restzeit nach dem Zug in Sekunden
    #[serde(default)]
    pub clock: Option<f32>,
    /// Für den Zug verbrauchte Zeit in Sekunden
    #[serde(default)]
    pub spent: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub white: String,
    pub black: String,
    pub result: String,
    pub depth: u32,
    /// Ausgangsstellung (Grundstellung oder FEN-Header der PGN)
    pub start_fen: String,
    /// Benannte Eröffnung laut Buch
    #[serde(default)]
    pub opening: Option<Opening>,
    pub moves: Vec<MoveReport>,
    pub accuracy_white: f32,
    pub accuracy_black: f32,
}

// ---------------------------------------------------------------- PGN

pub struct ParsedPgn {
    pub white: String,
    pub black: String,
    pub result: String,
    /// FEN-Header, falls die Partie nicht aus der Grundstellung beginnt
    pub fen: Option<String>,
    pub sans: Vec<String>,
    /// Restzeit nach jedem Zug in Sekunden (`[%clk ...]`), gleich lang wie `sans`
    pub clocks: Vec<Option<f32>>,
    /// Grundzeit und Inkrement in Sekunden; None bei Fernschach oder ohne Angabe
    pub time_control: Option<(f32, f32)>,
}

fn header_opt(pgn: &str, key: &str) -> Option<String> {
    let prefix = format!("[{key} \"");
    pgn.lines()
        .find_map(|l| l.trim().strip_prefix(&prefix).map(|r| r.trim_end_matches("\"]").to_string()))
}

fn header(pgn: &str, key: &str) -> String {
    header_opt(pgn, key).unwrap_or_else(|| "?".into())
}

/// `[%clk 0:09:58.5]` in einem Kommentar → 598.5
fn parse_clock(comment: &str) -> Option<f32> {
    let rest = comment.split("[%clk").nth(1)?;
    let value = rest.trim_start().split(']').next()?.trim();
    let mut secs = 0.0f32;
    for part in value.split(':') {
        secs = secs * 60.0 + part.parse::<f32>().ok()?;
    }
    Some(secs)
}

/// "600" oder "180+2"; "1/86400" (Fernschach) ergibt None
fn parse_time_control(tc: &str) -> Option<(f32, f32)> {
    if tc.contains('/') {
        return None;
    }
    let (base, inc) = tc.split_once('+').unwrap_or((tc, "0"));
    Some((base.trim().parse().ok()?, inc.trim().parse().ok()?))
}

/// Liest die Hauptvariante mit Uhrzeiten; Varianten, NAGs und Zugnummern werden übersprungen.
pub fn parse_pgn(pgn: &str) -> ParsedPgn {
    let movetext: String = pgn
        .lines()
        .filter(|l| !l.trim_start().starts_with('['))
        .collect::<Vec<_>>()
        .join("\n");

    // Kommentare der Hauptvariante mit Uhrzeit werden zu einem Token "\u{1}<sekunden>"
    let mut clean = String::with_capacity(movetext.len());
    let mut comment = String::new();
    let (mut brace, mut paren) = (false, 0u32);
    let mut chars = movetext.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '{' if !brace => {
                brace = true;
                comment.clear();
            }
            '}' if brace => {
                brace = false;
                if paren == 0 {
                    if let Some(s) = parse_clock(&comment) {
                        clean.push_str(&format!(" \u{1}{s} "));
                    }
                }
            }
            _ if brace => comment.push(c),
            '(' => paren += 1,
            ')' if paren > 0 => paren -= 1,
            _ if paren > 0 => {}
            ';' => {
                while let Some(&n) = chars.peek() {
                    if n == '\n' {
                        break;
                    }
                    chars.next();
                }
            }
            _ => clean.push(c),
        }
    }

    let mut sans: Vec<String> = Vec::new();
    let mut clocks: Vec<Option<f32>> = Vec::new();
    for tok in clean.split_whitespace() {
        if let Some(secs) = tok.strip_prefix('\u{1}') {
            if let Some(last) = clocks.last_mut() {
                *last = secs.parse().ok();
            }
            continue;
        }
        let tok = tok.trim_start_matches(|c: char| c.is_ascii_digit() || c == '.');
        let tok = tok.trim_end_matches(['!', '?']);
        if tok.is_empty()
            || tok.starts_with('$')
            || matches!(tok, "1-0" | "0-1" | "1/2-1/2" | "*" | "-0" | "-1" | "/2-1/2")
        {
            continue;
        }
        sans.push(tok.to_string());
        clocks.push(None);
    }

    ParsedPgn {
        white: header(pgn, "White"),
        black: header(pgn, "Black"),
        result: header(pgn, "Result"),
        fen: header_opt(pgn, "FEN").filter(|f| !f.trim().is_empty()),
        time_control: header_opt(pgn, "TimeControl").and_then(|t| parse_time_control(&t)),
        sans,
        clocks,
    }
}

// ---------------------------------------------------------------- Engine

pub struct Engine {
    child: Child,
    stdin: ChildStdin,
    out: BufReader<ChildStdout>,
}

struct EngineAnswer {
    /// aus Sicht der Seite am Zug
    cp: Option<i32>,
    mate: Option<i32>,
    best: Option<String>,
    /// Hauptvariante in UCI
    pv: Vec<String>,
    /// Bewertung des zweitbesten Zugs (cp, mate), aus Sicht der Seite am Zug
    second: Option<(Option<i32>, Option<i32>)>,
}

impl Engine {
    pub fn start(path: &str) -> Result<Self, String> {
        let mut cmd = Command::new(path);
        cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Stockfish konnte nicht gestartet werden ({path}): {e}"))?;
        let stdin = child.stdin.take().ok_or("Kein stdin")?;
        let out = BufReader::new(child.stdout.take().ok_or("Kein stdout")?);
        let mut eng = Engine { child, stdin, out };
        eng.send("uci")?;
        eng.wait_for("uciok")?;
        let threads = std::thread::available_parallelism().map(|n| n.get().saturating_sub(1).max(1)).unwrap_or(2);
        eng.send(&format!("setoption name Threads value {threads}"))?;
        eng.send("setoption name Hash value 128")?;
        eng.send("ucinewgame")?;
        eng.send("isready")?;
        eng.wait_for("readyok")?;
        Ok(eng)
    }

    /// Anzahl der berechneten Varianten (2 liefert den zweitbesten Zug)
    fn set_multipv(&mut self, n: u32) -> Result<(), String> {
        self.send(&format!("setoption name MultiPV value {n}"))?;
        self.send("isready")?;
        self.wait_for("readyok")
    }

    fn send(&mut self, line: &str) -> Result<(), String> {
        writeln!(self.stdin, "{line}").map_err(|e| e.to_string())?;
        self.stdin.flush().map_err(|e| e.to_string())
    }

    fn read_line(&mut self) -> Result<String, String> {
        let mut s = String::new();
        let n = self.out.read_line(&mut s).map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("Stockfish hat sich unerwartet beendet".into());
        }
        Ok(s)
    }

    fn wait_for(&mut self, token: &str) -> Result<(), String> {
        loop {
            if self.read_line()?.trim() == token {
                return Ok(());
            }
        }
    }

    fn evaluate(&mut self, start: Option<&str>, moves: &[String], depth: u32) -> Result<EngineAnswer, String> {
        let base = match start {
            Some(fen) => format!("position fen {fen}"),
            None => "position startpos".to_string(),
        };
        if moves.is_empty() {
            self.send(&base)?;
        } else {
            self.send(&format!("{base} moves {}", moves.join(" ")))?;
        }
        // Zeitlimit als Notbremse: einzelne Stellungen können die Suche selten explodieren lassen
        // (bei Stockfish 19 mit mehreren Threads beobachtet), dann endet sie nie auf der Zieltiefe
        let cap_ms = 3000 + depth * 200;
        self.send(&format!("go depth {depth} movetime {cap_ms}"))?;
        let mut ans = EngineAnswer { cp: None, mate: None, best: None, pv: Vec::new(), second: None };
        loop {
            let line = self.read_line()?;
            let mut it = line.split_whitespace();
            match it.next() {
                Some("info") => {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    // Variante 1 (oder ohne Angabe) ist die Hauptvariante, 2 der zweitbeste Zug
                    let pv_index = parts
                        .iter()
                        .position(|p| *p == "multipv")
                        .and_then(|i| parts.get(i + 1))
                        .and_then(|v| v.parse::<u32>().ok())
                        .unwrap_or(1);
                    let Some(i) = parts.iter().position(|p| *p == "score") else { continue };
                    let kind = parts.get(i + 1).copied();
                    let val = parts.get(i + 2).and_then(|v| v.parse::<i32>().ok());
                    if matches!(parts.get(i + 3).copied(), Some("lowerbound") | Some("upperbound")) {
                        continue;
                    }
                    let score = match (kind, val) {
                        (Some("cp"), Some(v)) => (Some(v), None),
                        (Some("mate"), Some(v)) => (None, Some(v)),
                        _ => continue,
                    };
                    match pv_index {
                        1 => {
                            (ans.cp, ans.mate) = score;
                            if let Some(p) = parts.iter().position(|p| *p == "pv") {
                                ans.pv = parts[p + 1..].iter().map(|s| s.to_string()).collect();
                            }
                        }
                        2 => ans.second = Some(score),
                        _ => {}
                    }
                }
                Some("bestmove") => {
                    ans.best = it.next().filter(|m| *m != "(none)").map(str::to_string);
                    return Ok(ans);
                }
                _ => {}
            }
        }
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        let _ = self.send("quit");
        let _ = self.child.wait();
    }
}

// ---------------------------------------------------------------- Bewertung

/// Engine-Bewertung (Sicht der Seite am Zug) in eine Bewertung aus Sicht von Weiß
fn score_white(cp: Option<i32>, mate: Option<i32>, turn: Color) -> Score {
    let sign = if turn == Color::White { 1 } else { -1 };
    if let Some(m) = mate {
        let m = m * sign;
        let cp = if m == 0 { -sign * CLAMP_CP } else { m.signum() * CLAMP_CP };
        return Score { cp, mate: Some(m) };
    }
    Score { cp: (cp.unwrap_or(0) * sign).clamp(-CLAMP_CP, CLAMP_CP), mate: None }
}

fn to_white(ans: &EngineAnswer, turn: Color, pos: &Chess) -> Score {
    // Partieende: kein Zug mehr möglich
    if ans.cp.is_none() && ans.mate.is_none() {
        let sign = if turn == Color::White { 1 } else { -1 };
        if pos.is_checkmate() {
            // die Seite am Zug ist matt
            return Score { cp: -sign * CLAMP_CP, mate: Some(0) };
        }
        return Score { cp: 0, mate: None };
    }
    score_white(ans.cp, ans.mate, turn)
}

/// Gewinnchance (0–100) aus Sicht des Ziehenden
fn mover_pct(s: &Score, white: bool) -> f64 {
    if white {
        win_pct(s.cp)
    } else {
        100.0 - win_pct(s.cp)
    }
}

/// Gewinnchance (0–100) aus Sicht von Weiß, wie bei Lichess
fn win_pct(cp: i32) -> f64 {
    let cp = cp.clamp(-CLAMP_CP, CLAMP_CP) as f64;
    50.0 + 50.0 * (2.0 / (1.0 + (-0.00368208 * cp).exp()) - 1.0)
}

fn move_accuracy(before_white: i32, after_white: i32, white: bool) -> f64 {
    let (b, a) = if white {
        (win_pct(before_white), win_pct(after_white))
    } else {
        (100.0 - win_pct(before_white), 100.0 - win_pct(after_white))
    };
    let drop = (b - a).max(0.0);
    (103.1668 * (-0.04354 * drop).exp() - 3.1669).clamp(0.0, 100.0)
}

/// Alles, was zur Einordnung eines Zugs gebraucht wird
struct MoveCtx<'a> {
    before: &'a Score,
    after: &'a Score,
    white: bool,
    played_best: bool,
    /// Bewertung des zweitbesten Zugs (Sicht von Weiß), falls es einen gab
    second: Option<&'a Score>,
    /// Gewinnchance des Ziehenden vor dem letzten Zug des Gegners und dessen Verlust dabei
    prev: Option<(f64, f64)>,
    /// Der Zug schlägt zurück auf dem Feld, auf dem der Gegner gerade geschlagen hat
    recapture: bool,
}

/// Grenzen in Prozentpunkten Gewinnchance, ungefähr wie bei Chess.com
/// (erwartete Punkte: 0,02 / 0,05 / 0,10 / 0,20)
const EXZELLENT: f64 = 2.0;
const GUT: f64 = 5.0;
const UNGENAU: f64 = 10.0;
const FEHLER: f64 = 20.0;
/// "Großartig": der zweitbeste Zug wäre um so viel schlechter gewesen
const ONLY_MOVE_GAP: f64 = 20.0;

fn classify(c: &MoveCtx) -> (i32, Quality) {
    let s = if c.white { 1 } else { -1 };
    let loss = ((c.before.cp - c.after.cp) * s).max(0);
    let (wb, wa) = (mover_pct(c.before, c.white), mover_pct(c.after, c.white));
    // Verlust an Gewinnchance, damit Züge in schon entschiedenen Stellungen nicht als Patzer zählen
    let drop = wb - wa;

    if c.played_best {
        let only_move = c.second.is_some_and(|sec| {
            let ws = mover_pct(sec, c.white);
            // nur wenn die Alternative die Stellung wirklich verdorben hätte
            wb - ws >= ONLY_MOVE_GAP && ws < 90.0
        });
        let q = if only_move && !c.recapture { Quality::Grossartig } else { Quality::Best };
        return (loss, q);
    }

    let had_mate = c.before.mate.is_some_and(|m| m * s > 0);
    let still_mate = c.after.mate.is_some_and(|m| m * s > 0 || m == 0);
    if had_mate && !still_mate && drop < 30.0 {
        return (loss, Quality::Verpasst);
    }

    // Gegner hat gerade einen Fehler gemacht und der Zug gibt den Vorteil wieder her,
    // ohne schlechter zu stehen als vor dem Fehler des Gegners
    if let Some((before_their_move, their_drop)) = c.prev {
        if their_drop >= UNGENAU && drop >= UNGENAU && wa >= before_their_move - GUT {
            return (loss, Quality::Verpasst);
        }
    }

    let q = if drop < EXZELLENT {
        Quality::Exzellent
    } else if drop < GUT {
        Quality::Gut
    } else if drop < UNGENAU {
        Quality::Ungenau
    } else if drop < FEHLER {
        Quality::Fehler
    } else {
        Quality::Patzer
    };
    (loss, q)
}

const LINE_LEN: usize = 10;

/// Variante in Züge mit SAN und Stellung umwandeln; bricht beim ersten ungültigen Zug ab
fn line_steps(start: &Chess, pv: &[String]) -> Vec<LineStep> {
    let mut pos = start.clone();
    let mut out = Vec::new();
    for u in pv.iter().take(LINE_LEN) {
        let Some(m) = UciMove::from_ascii(u.as_bytes()).ok().and_then(|x| x.to_move(&pos).ok()) else { break };
        let san = SanPlus::from_move(pos.clone(), m).to_string();
        pos.play_unchecked(m);
        out.push(LineStep { san, uci: u.clone(), fen: fen_of(&pos) });
    }
    out
}

/// Verbrauchte Zeit je Zug aus den Restzeiten: vorige Restzeit derselben Seite + Inkrement − jetzige.
/// Der erste Zug jeder Seite rechnet ab der Grundzeit.
fn time_spent(clocks: &[Option<f32>], tc: Option<(f32, f32)>, black_first: bool) -> Vec<Option<f32>> {
    let (base, inc) = match tc {
        Some((b, i)) => (Some(b), i),
        None => (None, 0.0),
    };
    let mut prev = [base, base];
    clocks
        .iter()
        .enumerate()
        .map(|(i, clock)| {
            let side = (i + black_first as usize) % 2;
            let spent = match (prev[side], clock) {
                (Some(p), Some(c)) => Some(((p + inc - c).max(0.0) * 10.0).round() / 10.0),
                _ => None,
            };
            if clock.is_some() {
                prev[side] = *clock;
            }
            spent
        })
        .collect()
}

/// Fehlermeldung, wenn eine neuere Analyse diese abgelöst hat
pub const CANCELLED: &str = "Analyse abgebrochen";

fn fen_of(pos: &Chess) -> String {
    Fen::from_position(pos, EnPassantMode::Legal).to_string()
}

pub fn analyze(
    pgn: &str,
    engine_path: &str,
    depth: u32,
    mut on_progress: impl FnMut(usize, usize),
    cancelled: impl Fn() -> bool,
) -> Result<Report, String> {
    let parsed = parse_pgn(pgn);
    if parsed.sans.is_empty() {
        return Err("In der PGN wurden keine Züge gefunden".into());
    }

    // Ausgangsstellung: Grundstellung oder FEN-Header
    let mut pos = match &parsed.fen {
        Some(f) => Fen::from_ascii(f.as_bytes())
            .ok()
            .and_then(|fen| fen.into_position::<Chess>(CastlingMode::Standard).ok())
            .ok_or_else(|| format!("Ungültige Ausgangsstellung in der PGN: {f}"))?,
        None => Chess::default(),
    };
    let start_fen = fen_of(&pos);
    let start_arg = parsed.fen.as_ref().map(|_| start_fen.clone());
    // Zugnummer der Ausgangsstellung; Schwarz am Zug verschiebt die Halbzüge um eins
    let first_number = pos.fullmoves().get();
    let black_first = pos.turn() == Color::Black;

    // Züge legal nachspielen, UCI-Liste und Stellungen sammeln
    let mut positions = vec![pos.clone()];
    let mut ucis: Vec<String> = Vec::new();
    let mut sans: Vec<String> = Vec::new();
    for (i, s) in parsed.sans.iter().enumerate() {
        let san = San::from_ascii(s.trim_end_matches(['+', '#']).as_bytes())
            .map_err(|_| format!("Unbekannter Zug in Halbzug {}: {s}", i + 1))?;
        let m = san
            .to_move(&pos)
            .map_err(|_| format!("Illegaler Zug in Halbzug {}: {s}", i + 1))?;
        sans.push(SanPlus::from_move(pos.clone(), m).to_string());
        ucis.push(m.to_uci(CastlingMode::Standard).to_string());
        pos.play_unchecked(m);
        positions.push(pos.clone());
    }

    let total = positions.len();
    let mut engine = Engine::start(engine_path)?;
    let mut scores = Vec::with_capacity(total);
    let mut bests: Vec<Option<String>> = Vec::with_capacity(total);
    let mut pvs: Vec<Vec<String>> = Vec::with_capacity(total);
    // Buch nur ab Grundstellung
    let (book_len, opening) = if start_arg.is_none() { openings::lookup(&positions[1..]) } else { (0, None) };

    for (i, p) in positions.iter().enumerate() {
        if cancelled() {
            return Err(CANCELLED.into());
        }
        on_progress(i, total);
        let ans = engine.evaluate(start_arg.as_deref(), &ucis[..i], depth)?;
        scores.push(to_white(&ans, p.turn(), p));
        bests.push(ans.best.clone());
        pvs.push(ans.pv);
    }

    // Zweiter Durchgang nur für gefundene beste Züge außerhalb des Buchs: Wie gut wäre
    // der zweitbeste Zug gewesen? Etwas flacher, für die Frage "einziger Zug?" reicht das.
    let mut seconds: Vec<Option<Score>> = vec![None; total];
    let candidates: Vec<usize> = (book_len..ucis.len())
        .filter(|&i| bests[i].as_deref() == Some(ucis[i].as_str()))
        .collect();
    if !candidates.is_empty() {
        engine.set_multipv(2)?;
        let second_depth = depth.saturating_sub(4).max(8);
        for (k, &i) in candidates.iter().enumerate() {
            if cancelled() {
                return Err(CANCELLED.into());
            }
            on_progress(total + k, total + candidates.len());
            let ans = engine.evaluate(start_arg.as_deref(), &ucis[..i], second_depth)?;
            seconds[i] = ans.second.map(|(cp, mate)| score_white(cp, mate, positions[i].turn()));
        }
    }
    on_progress(total + candidates.len(), total + candidates.len());
    drop(engine);

    let spent = time_spent(&parsed.clocks, parsed.time_control, black_first);
    let mut moves = Vec::with_capacity(sans.len());
    // (Summe, Summe der Kehrwerte, Anzahl) je Farbe
    let (mut w, mut b) = ((0.0, 0.0, 0), (0.0, 0.0, 0));
    for i in 0..sans.len() {
        let white = positions[i].turn() == Color::White;
        // Halbzug-Index ab einem gedachten weißen Zug, damit Zugnummern auch nach FEN stimmen
        let k = i + black_first as usize;
        let before = &scores[i];
        let after = &scores[i + 1];
        let best_uci = bests[i].clone();
        let played_best = best_uci.as_deref() == Some(ucis[i].as_str());
        let best_san = best_uci.as_ref().and_then(|u| {
            let uci = UciMove::from_ascii(u.as_bytes()).ok()?;
            let m = uci.to_move(&positions[i]).ok()?;
            Some(SanPlus::from_move(positions[i].clone(), m).to_string())
        });
        // Letzter Zug des Gegners: Gewinnchance des Ziehenden davor und was der Gegner dabei verlor
        let prev = (i > 0).then(|| {
            let before_theirs = mover_pct(&scores[i - 1], white);
            let their_drop = mover_pct(&scores[i - 1], !white) - mover_pct(before, !white);
            (before_theirs, their_drop)
        });
        let to = |u: &str| u.get(2..4).and_then(|sq| sq.parse::<Square>().ok());
        let recapture = i > 0
            && to(&ucis[i]).is_some_and(|sq| {
                to(&ucis[i - 1]) == Some(sq) && positions[i - 1].board().piece_at(sq).is_some()
            });
        let (loss, mut quality) = classify(&MoveCtx {
            before,
            after,
            white,
            played_best,
            second: seconds[i].as_ref(),
            prev,
            recapture,
        });
        if i < book_len {
            quality = Quality::Buch;
        }
        let acc = move_accuracy(before.cp, after.cp, white);
        let side = if white { &mut w } else { &mut b };
        side.0 += acc;
        side.1 += 1.0 / acc.max(1.0);
        side.2 += 1;
        moves.push(MoveReport {
            ply: i + 1,
            number: first_number + (k / 2) as u32,
            white,
            san: sans[i].clone(),
            uci: ucis[i].clone(),
            fen: fen_of(&positions[i + 1]),
            score: after.clone(),
            best_san,
            best_uci,
            score_before: before.clone(),
            loss,
            quality,
            best_line: if played_best || quality == Quality::Buch {
                Vec::new()
            } else {
                line_steps(&positions[i], &pvs[i])
            },
            clock: parsed.clocks[i],
            spent: spent[i],
        });
    }

    // Mittel aus arithmetischem und harmonischem Mittel: einzelne Patzer wiegen schwerer
    let avg = |(sum, inv, n): (f64, f64, i32)| {
        if n == 0 {
            return 0.0;
        }
        let v = (sum / n as f64 + n as f64 / inv) / 2.0;
        (v * 10.0).round() as f32 / 10.0
    };
    Ok(Report {
        white: parsed.white,
        black: parsed.black,
        result: parsed.result,
        depth,
        start_fen,
        opening,
        moves,
        accuracy_white: avg(w),
        accuracy_black: avg(b),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_chesscom_pgn() {
        let pgn = "[White \"a\"]\n[Black \"b\"]\n[Result \"1-0\"]\n\n1. e4 {[%clk 0:09:58]} 1... e5 2. Nf3 (2. f4 exf4) 2... Nc6?! $6 3. Bb5 1-0";
        let p = parse_pgn(pgn);
        assert_eq!(p.sans, vec!["e4", "e5", "Nf3", "Nc6", "Bb5"]);
        assert_eq!(p.white, "a");
        assert_eq!(p.result, "1-0");
        assert_eq!(p.fen, None);
    }

    #[test]
    fn reads_fen_header() {
        let pgn = "[SetUp \"1\"]\n[FEN \"4k3/8/8/8/8/8/4P3/4K3 b - - 0 30\"]\n\n30... Kd7 31. e4 *";
        let p = parse_pgn(pgn);
        assert_eq!(p.fen.as_deref(), Some("4k3/8/8/8/8/8/4P3/4K3 b - - 0 30"));
        assert_eq!(p.sans, vec!["Kd7", "e4"]);
    }

    #[test]
    fn reads_clocks() {
        let pgn = "[TimeControl \"180+2\"]\n\n1. e4 {[%clk 0:03:00]} 1... e5 {[%clk 0:02:59.5]} \
                   2. Nf3 {[%clk 0:02:50.1]} (2. f4 {[%clk 0:01:00]}) 2... Nc6 {[%clk 0:02:40]} 3. Bb5 *";
        let p = parse_pgn(pgn);
        assert_eq!(p.sans, vec!["e4", "e5", "Nf3", "Nc6", "Bb5"]);
        assert_eq!(p.clocks, vec![Some(180.0), Some(179.5), Some(170.1), Some(160.0), None]);
        assert_eq!(p.time_control, Some((180.0, 2.0)));
        let spent = time_spent(&p.clocks, p.time_control, false);
        // 180 + 2 − 170,1 = 11,9 für 2. Sf3; 179,5 + 2 − 160 = 21,5 für 2... Sc6
        assert_eq!(spent, vec![Some(2.0), Some(2.5), Some(11.9), Some(21.5), None]);
    }

    fn cp(v: i32) -> Score {
        Score { cp: v, mate: None }
    }

    fn ctx<'a>(before: &'a Score, after: &'a Score, best: bool) -> MoveCtx<'a> {
        MoveCtx { before, after, white: true, played_best: best, second: None, prev: None, recapture: false }
    }

    #[test]
    fn thresholds_like_chesscom() {
        let b = cp(0);
        // 0 cp = 50 %; Verlust in Prozentpunkten entscheidet
        let q = |after: i32| classify(&ctx(&b, &cp(after), false)).1;
        assert_eq!(q(-5), Quality::Exzellent);
        assert_eq!(q(-30), Quality::Gut);
        assert_eq!(q(-80), Quality::Ungenau);
        assert_eq!(q(-160), Quality::Fehler);
        assert_eq!(q(-400), Quality::Patzer);
    }

    #[test]
    fn only_move_is_great() {
        let (b, a, second) = (cp(50), cp(50), cp(-300));
        let mut c = ctx(&b, &a, true);
        c.second = Some(&second);
        assert_eq!(classify(&c).1, Quality::Grossartig);
        c.recapture = true;
        assert_eq!(classify(&c).1, Quality::Best);
        let close = cp(20);
        c.recapture = false;
        c.second = Some(&close);
        assert_eq!(classify(&c).1, Quality::Best);
    }

    #[test]
    fn giving_back_a_gift_is_missed() {
        // Gegner patzt (Weiß steht danach +400), Weiß gibt es zurück auf +20
        let (b, a) = (cp(400), cp(20));
        let mut c = ctx(&b, &a, false);
        c.prev = Some((win_pct(0), 40.0));
        assert_eq!(classify(&c).1, Quality::Verpasst);
        // ohne Fehler des Gegners ist es ein Patzer
        c.prev = Some((win_pct(400), 0.0));
        assert_eq!(classify(&c).1, Quality::Patzer);
    }

    #[test]
    fn daily_has_no_time_control() {
        assert_eq!(parse_time_control("1/86400"), None);
        assert_eq!(parse_time_control("600"), Some((600.0, 0.0)));
    }

    #[test]
    fn fen_after_moves() {
        let mut pos = Chess::default();
        let m = San::from_ascii(b"e4").unwrap().to_move(&pos).unwrap();
        pos.play_unchecked(m);
        // Kein e.p.-Feld, weil kein Bauer schlagen kann
        assert_eq!(fen_of(&pos), "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
    }
}
