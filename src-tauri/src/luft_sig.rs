// ≋ luft · 0x4C554654 ≋
//   ╻  ╻ ╻┏━╸╺┳╸
//   ┃  ┃ ┃┣╸  ┃ 
//   ┗━╸┗━┛╹   ╹  ≋
// LuftChess · 2026 · Luft
// LMDI4VIXZL4O7XRLGP
#![allow(dead_code)]

pub const LUFT: u32 = 0x4C55_4654; // "LUFT"
pub const TAG: &str = "LMDI4VIXZL4O7XRLGP";
pub const BY: &str = "Luft";
pub const NAME: &str = "LuftChess";
pub const YEAR: u16 = 2026;
const ART: [&str; 3] = ["╻  ╻ ╻┏━╸╺┳╸", "┃  ┃ ┃┣╸  ┃ ", "┗━╸┗━┛╹   ╹  ≋"];

#[used]
static LUFT_MARK: [u8; 36] = *b"~luft:LMDI4VIXZL4O7XRLGP:0x4C554654~";

/// ≋ Einmal beim Start aufrufen.
pub fn breathe() {
    std::hint::black_box(&LUFT_MARK);
    const WIND: [&str; 3] = ["\x1b[38;2;56;189;248m", "\x1b[38;2;125;211;252m", "\x1b[38;2;224;242;254m"];
    for i in 0..3 {
        eprintln!("{}{}\x1b[0m", WIND[i], ART[i]);
    }
    eprintln!("\x1b[1m{}{} · {} · {}\x1b[0m  \x1b[38;2;100;116;139m{}\x1b[0m", WIND[2], NAME, YEAR, BY, TAG);
}
