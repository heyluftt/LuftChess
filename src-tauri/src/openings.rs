
use serde::{Deserialize, Serialize};
use shakmaty::{fen::Epd, san::San, Chess, EnPassantMode, Position};
use std::collections::HashMap;
use std::sync::OnceLock;

const DATA: &str = include_str!("../data/openings.tsv");

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Opening {
    pub eco: String,
    pub name: String,
}

struct Book {
    positions: HashMap<String, Option<usize>>,
    names: Vec<Opening>,
}

fn key(pos: &Chess) -> String {
    Epd::from_position(pos, EnPassantMode::Legal).to_string()
}

fn book() -> &'static Book {
    static BOOK: OnceLock<Book> = OnceLock::new();
    BOOK.get_or_init(|| {
        let mut positions: HashMap<String, Option<usize>> = HashMap::new();
        let mut names = Vec::new();
        for line in DATA.lines() {
            let mut cols = line.split('\t');
            let (Some(eco), Some(name), Some(pgn)) = (cols.next(), cols.next(), cols.next()) else { continue };
            let mut pos = Chess::default();
            let mut ok = true;
            for tok in pgn.split_whitespace().filter(|t| !t.ends_with('.')) {
                let Some(m) = San::from_ascii(tok.as_bytes()).ok().and_then(|s| s.to_move(&pos).ok()) else {
                    ok = false;
                    break;
                };
                pos.play_unchecked(m);
                positions.entry(key(&pos)).or_insert(None);
            }
            if ok {
                let slot = positions.entry(key(&pos)).or_insert(None);
                if slot.is_none() {
                    *slot = Some(names.len());
                }
                names.push(Opening { eco: eco.to_string(), name: name.to_string() });
            }
        }
        Book { positions, names }
    })
}

pub fn lookup(after: &[Chess]) -> (usize, Option<Opening>) {
    let b = book();
    let mut depth = 0;
    let mut found = None;
    for pos in after {
        match b.positions.get(&key(pos)) {
            Some(named) => {
                depth += 1;
                if let Some(i) = named {
                    found = Some(b.names[*i].clone());
                }
            }
            None => break,
        }
    }
    (depth, found)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn play(sans: &[&str]) -> Vec<Chess> {
        let mut pos = Chess::default();
        sans.iter()
            .map(|s| {
                let m = San::from_ascii(s.as_bytes()).unwrap().to_move(&pos).unwrap();
                pos.play_unchecked(m);
                pos.clone()
            })
            .collect()
    }

    #[test]
    fn finds_sicilian() {
        let (depth, o) = lookup(&play(&["e4", "c5", "Nf3", "d6", "a3"]));
        assert_eq!(depth, 4);
        let o = o.unwrap();
        assert_eq!(o.eco, "B50");
        assert!(o.name.starts_with("Sicilian Defense"));
    }

    #[test]
    fn leaves_book_early() {
        let (depth, _) = lookup(&play(&["h4", "h5", "Rh3", "Rh6", "Ra3"]));
        assert!(depth < 5);
    }
}
