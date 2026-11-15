//! Chess.com Published-Data-API (nur lesend, keine Anmeldung).
//! Liefert ausschließlich abgeschlossene Partien.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

const UA: &str = "LuftChess/0.1 (Desktop-Launcher; github.com/heyluftt)";

#[derive(Deserialize)]
struct Archives {
    archives: Vec<String>,
}

#[derive(Deserialize)]
struct Month {
    games: Vec<RawGame>,
}

#[derive(Deserialize)]
struct RawSide {
    username: String,
    rating: Option<i32>,
    result: String,
}

#[derive(Deserialize)]
struct RawGame {
    url: String,
    pgn: Option<String>,
    end_time: Option<i64>,
    time_class: Option<String>,
    time_control: Option<String>,
    rules: Option<String>,
    white: RawSide,
    black: RawSide,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Side {
    pub username: String,
    pub rating: Option<i32>,
    pub result: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub url: String,
    pub pgn: String,
    pub end_time: i64,
    pub time_class: String,
    pub time_control: String,
    pub white: Side,
    pub black: Side,
}

fn get_json<T: for<'de> Deserialize<'de>>(url: &str) -> Result<T, String> {
    let mut res = ureq::get(url)
        .header("User-Agent", UA)
        .call()
        .map_err(|e| match e {
            ureq::Error::StatusCode(404) => "Diesen Benutzer gibt es auf Chess.com nicht".to_string(),
            ureq::Error::StatusCode(429) => "Zu viele Anfragen – kurz warten und erneut versuchen".to_string(),
            other => format!("Chess.com nicht erreichbar: {other}"),
        })?;
    res.body_mut()
        .read_json::<T>()
        .map_err(|e| format!("Antwort von Chess.com unlesbar: {e}"))
}

/// Abgeschlossene Monate ändern sich nicht mehr und bleiben für die Sitzung im Speicher.
static MONTHS: Mutex<Option<HashMap<String, Vec<Game>>>> = Mutex::new(None);

fn month_games(url: &str, cacheable: bool) -> Result<Vec<Game>, String> {
    if cacheable {
        if let Some(g) = MONTHS.lock().unwrap().as_ref().and_then(|m| m.get(url)) {
            return Ok(g.clone());
        }
    }
    let month: Month = get_json(url)?;
    let games: Vec<Game> = month
        .games
        .into_iter()
        .rev()
        .filter(|g| g.rules.as_deref().unwrap_or("chess") == "chess")
        .filter_map(|g| {
            Some(Game {
                url: g.url,
                pgn: g.pgn?,
                end_time: g.end_time.unwrap_or(0),
                time_class: g.time_class.unwrap_or_default(),
                time_control: g.time_control.unwrap_or_default(),
                white: Side { username: g.white.username, rating: g.white.rating, result: g.white.result },
                black: Side { username: g.black.username, rating: g.black.rating, result: g.black.result },
            })
        })
        .collect();
    if cacheable {
        MONTHS.lock().unwrap().get_or_insert_with(HashMap::new).insert(url.to_string(), games.clone());
    }
    Ok(games)
}

/// Die letzten `limit` Standardschach-Partien, neueste zuerst.
pub fn recent_games(username: &str, limit: usize) -> Result<Vec<Game>, String> {
    let user = username.trim().to_lowercase();
    if user.is_empty() {
        return Err("Benutzername fehlt".into());
    }
    let archives: Archives = get_json(&format!("https://api.chess.com/pub/player/{user}/games/archives"))?;

    let mut out = Vec::new();
    for (i, url) in archives.archives.iter().rev().enumerate() {
        // nur der laufende Monat (der neueste) kann noch wachsen
        out.extend(month_games(url, i > 0)?);
        if out.len() >= limit {
            out.truncate(limit);
            break;
        }
    }
    Ok(out)
}
