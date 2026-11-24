
use crate::analysis::Report;
use crate::chesscom::Side;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const VERSION: u32 = 2;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GameMeta {
    pub end_time: i64,
    pub time_class: String,
    pub time_control: String,
    pub white: Side,
    pub black: Side,
}

#[derive(Serialize, Deserialize)]
struct Saved {
    version: u32,
    url: String,
    saved_at: u64,
    #[serde(default)]
    game: Option<GameMeta>,
    #[serde(default)]
    pgn: Option<String>,
    report: Report,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub url: String,
    pub saved_at: u64,
    pub game: Option<GameMeta>,
    pub pgn: Option<String>,
    pub report: Report,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub accuracy_white: f32,
    pub accuracy_black: f32,
    pub depth: u32,
}

fn file_name(url: &str) -> String {
    let rest = url.split_once("://").map_or(url, |(_, r)| r);
    let path = rest.split_once('/').map_or("", |(_, p)| p);
    let mut name: String = path
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '_' })
        .collect();
    name.truncate(120);
    let name = name.trim_matches('_');
    format!("{}.json", if name.is_empty() { "partie" } else { name })
}

pub struct Store {
    dir: PathBuf,
}

impl Store {
    pub fn new(dir: PathBuf) -> Self {
        Store { dir }
    }

    fn path(&self, url: &str) -> PathBuf {
        self.dir.join(file_name(url))
    }

    fn read(path: &Path, url: &str) -> Option<Saved> {
        let raw = fs::read(path).ok()?;
        let saved: Saved = serde_json::from_slice(&raw).ok()?;
        (saved.version == VERSION && saved.url == url).then_some(saved)
    }

    pub fn load(&self, url: &str) -> Option<Report> {
        Self::read(&self.path(url), url).map(|s| s.report)
    }

    pub fn all(&self) -> Vec<Entry> {
        let Ok(dir) = fs::read_dir(&self.dir) else { return Vec::new() };
        let mut out: Vec<Entry> = dir
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
            .filter_map(|e| {
                let saved: Saved = serde_json::from_slice(&fs::read(e.path()).ok()?).ok()?;
                (saved.version == VERSION).then_some(Entry {
                    url: saved.url,
                    saved_at: saved.saved_at,
                    game: saved.game,
                    pgn: saved.pgn,
                    report: saved.report,
                })
            })
            .collect();
        let when = |e: &Entry| e.game.as_ref().map_or(e.saved_at as i64, |g| g.end_time);
        out.sort_by_key(|e| std::cmp::Reverse(when(e)));
        out
    }

    pub fn save(&self, url: &str, game: Option<GameMeta>, pgn: &str, report: &Report) -> Result<(), String> {
        fs::create_dir_all(&self.dir).map_err(|e| e.to_string())?;
        let saved = Saved {
            version: VERSION,
            url: url.to_string(),
            saved_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
            game,
            pgn: Some(pgn.to_string()),
            report: report.clone(),
        };
        let json = serde_json::to_vec(&saved).map_err(|e| e.to_string())?;
        let target = self.path(url);
        let tmp = target.with_extension("json.tmp");
        fs::write(&tmp, json).map_err(|e| e.to_string())?;
        fs::rename(&tmp, &target).map_err(|e| e.to_string())
    }

    pub fn summaries(&self, urls: &[String]) -> HashMap<String, Summary> {
        urls.iter()
            .filter_map(|u| {
                let s = Self::read(&self.path(u), u)?;
                Some((
                    u.clone(),
                    Summary {
                        accuracy_white: s.report.accuracy_white,
                        accuracy_black: s.report.accuracy_black,
                        depth: s.report.depth,
                    },
                ))
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_names() {
        assert_eq!(file_name("https://www.chess.com/game/live/100000000001"), "game_live_100000000001.json");
        assert_eq!(file_name("https://www.chess.com/game/daily/12?x=1"), "game_daily_12_x_1.json");
        assert_eq!(file_name("https://www.chess.com/"), "partie.json");
    }

    #[test]
    fn roundtrip() {
        let dir = std::env::temp_dir().join(format!("luftchess-test-{}", std::process::id()));
        let store = Store::new(dir.clone());
        let url = "https://www.chess.com/game/live/1";
        assert!(store.load(url).is_none());
        let report = Report {
            white: "a".into(),
            black: "b".into(),
            result: "1-0".into(),
            depth: 12,
            start_fen: "x".into(),
            opening: None,
            moves: vec![],
            accuracy_white: 90.5,
            accuracy_black: 80.0,
        };
        store.save(url, None, "", &report).unwrap();
        assert_eq!(store.load(url).unwrap().accuracy_white, 90.5);
        assert!(store.load("https://www.chess.com/game/live/2").is_none());
        let sums = store.summaries(&[url.to_string(), "https://www.chess.com/game/live/2".into()]);
        assert_eq!(sums.len(), 1);
        assert_eq!(store.all().len(), 1);
        let _ = fs::remove_dir_all(dir);
    }
}
