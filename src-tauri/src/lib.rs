pub mod analysis;
mod chesscom;
mod openings;
mod store;

use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::webview::WebviewBuilder;
use tauri::window::WindowBuilder;
use tauri::{Emitter, LogicalPosition, LogicalSize, Manager, Url, WebviewUrl, Window, WindowEvent};

/// Breite der linken Leiste (muss zu --rail in styles.css passen)
const RAIL: f64 = 60.0;
const CHESS_HOME: &str = "https://www.chess.com/play/online";

struct Layout {
    panel: Mutex<f64>,
}

/// Jede neue Analyse erhöht den Zähler; ältere Läufe sehen das und brechen ab,
/// damit nie zwei Stockfish-Prozesse um die Kerne konkurrieren.
#[derive(Default)]
struct AnalysisGen(Arc<AtomicU64>);

/// Chess.com-Webview zwischen Leiste und Analyse-Panel einpassen.
fn place_chess(window: &Window, panel: f64) {
    let Some(wv) = window.app_handle().get_webview("chess") else { return };
    let scale = window.scale_factor().unwrap_or(1.0);
    let Ok(size) = window.inner_size() else { return };
    let size = size.to_logical::<f64>(scale);
    let width = (size.width - RAIL - panel).max(320.0);
    let _ = wv.set_position(LogicalPosition::new(RAIL, 0.0));
    let _ = wv.set_size(LogicalSize::new(width, size.height));
}

#[tauri::command]
fn set_panel(width: f64, window: Window, layout: tauri::State<Layout>) {
    *layout.panel.lock().unwrap() = width.max(0.0);
    place_chess(&window, width.max(0.0));
}

#[tauri::command]
fn chess_go(path: String, app: tauri::AppHandle) -> Result<(), String> {
    let wv = app.get_webview("chess").ok_or("Chess.com-Ansicht fehlt")?;
    let url = if path.starts_with("https://") {
        path
    } else {
        format!("https://www.chess.com{path}")
    };
    let url = Url::parse(&url).map_err(|e| e.to_string())?;
    if url.host_str().map(|h| h == "chess.com" || h.ends_with(".chess.com")) != Some(true) {
        return Err("Nur Chess.com-Adressen".into());
    }
    wv.navigate(url).map_err(|e| e.to_string())
}

#[tauri::command]
fn chess_action(action: String, app: tauri::AppHandle) -> Result<(), String> {
    let wv = app.get_webview("chess").ok_or("Chess.com-Ansicht fehlt")?;
    let js = match action.as_str() {
        "back" => "history.back()",
        "forward" => "history.forward()",
        "reload" => "location.reload()",
        _ => return Err("Unbekannte Aktion".into()),
    };
    wv.eval(js).map_err(|e| e.to_string())
}

#[tauri::command]
async fn recent_games(username: String, limit: usize) -> Result<Vec<chesscom::Game>, String> {
    let limit = limit.clamp(1, 500);
    tauri::async_runtime::spawn_blocking(move || chesscom::recent_games(&username, limit))
        .await
        .map_err(|e| e.to_string())?
}

#[derive(Serialize, Clone)]
struct Progress {
    done: usize,
    total: usize,
}

fn store(app: &tauri::AppHandle) -> Result<store::Store, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(store::Store::new(dir.join("analyses")))
}

/// Gespeicherte Analyse einer Partie, falls vorhanden
#[tauri::command]
async fn saved_report(url: String, app: tauri::AppHandle) -> Result<Option<analysis::Report>, String> {
    let store = store(&app)?;
    tauri::async_runtime::spawn_blocking(move || store.load(&url))
        .await
        .map_err(|e| e.to_string())
}

/// Genauigkeit der bereits analysierten Partien aus der Liste
#[tauri::command]
async fn saved_summaries(
    urls: Vec<String>,
    app: tauri::AppHandle,
) -> Result<HashMap<String, store::Summary>, String> {
    let store = store(&app)?;
    tauri::async_runtime::spawn_blocking(move || store.summaries(&urls))
        .await
        .map_err(|e| e.to_string())
}

/// Laufende Analyse abbrechen
#[tauri::command]
fn cancel_analysis(gen: tauri::State<'_, AnalysisGen>) {
    gen.0.fetch_add(1, Ordering::SeqCst);
}

/// Alle gespeicherten Analysen (Statistik, Training)
#[tauri::command]
async fn saved_all(app: tauri::AppHandle) -> Result<Vec<store::Entry>, String> {
    let store = store(&app)?;
    tauri::async_runtime::spawn_blocking(move || store.all())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn analyze_game(
    url: String,
    game: Option<store::GameMeta>,
    pgn: String,
    engine: String,
    depth: u32,
    app: tauri::AppHandle,
    gen: tauri::State<'_, AnalysisGen>,
) -> Result<analysis::Report, String> {
    let depth = depth.clamp(8, 24);
    let counter = gen.0.clone();
    let mine = counter.fetch_add(1, Ordering::SeqCst) + 1;
    let store = store(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let report = analysis::analyze(
            &pgn,
            &engine,
            depth,
            |done, total| {
                if counter.load(Ordering::SeqCst) == mine {
                    let _ = app.emit_to("ui", "analysis-progress", Progress { done, total });
                }
            },
            || counter.load(Ordering::SeqCst) != mine,
        )?;
        // Speichern ist Komfort: schlägt es fehl, gibt es den Bericht trotzdem
        if let Err(e) = store.save(&url, game, &pgn, &report) {
            eprintln!("Analyse nicht gespeichert: {e}");
        }
        Ok(report)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Sucht stockfish(.exe) neben der App und im App-Datenordner.
#[tauri::command]
fn find_engine(app: tauri::AppHandle) -> Option<String> {
    let names: &[&str] = if cfg!(windows) { &["stockfish.exe"] } else { &["stockfish"] };
    let mut dirs: Vec<PathBuf> = Vec::new();
    // Entwicklung: src-tauri/engine
    #[cfg(debug_assertions)]
    dirs.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("engine"));
    if let Ok(exe) = std::env::current_exe() {
        if let Some(d) = exe.parent() {
            dirs.push(d.to_path_buf());
        }
    }
    if let Ok(d) = app.path().app_data_dir() {
        dirs.push(d);
    }
    if let Ok(d) = app.path().resource_dir() {
        dirs.push(d.join("engine"));
    }
    for d in dirs {
        for n in names {
            let p = d.join(n);
            if p.is_file() {
                return Some(p.to_string_lossy().into_owned());
            }
        }
    }
    None
}

#[tauri::command]
fn engine_folder(app: tauri::AppHandle) -> Result<String, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Layout { panel: Mutex::new(0.0) })
        .manage(AnalysisGen::default())
        .invoke_handler(tauri::generate_handler![
            set_panel,
            chess_go,
            chess_action,
            recent_games,
            analyze_game,
            saved_report,
            saved_summaries,
            saved_all,
            cancel_analysis,
            find_engine,
            engine_folder
        ])
        .setup(|app| {
            let (w, h) = (1440.0, 900.0);
            let window = WindowBuilder::new(app, "main")
                .title("LuftChess")
                .inner_size(w, h)
                .min_inner_size(1000.0, 640.0)
                .theme(Some(tauri::Theme::Dark))
                .build()?;

            // Eigene Oberfläche: füllt das ganze Fenster
            window.add_child(
                WebviewBuilder::new("ui", WebviewUrl::App("index.html".into())).auto_resize(),
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(w, h),
            )?;

            // Chess.com darüber, zwischen Leiste und Panel
            let handle = app.handle().clone();
            window.add_child(
                WebviewBuilder::new("chess", WebviewUrl::External(Url::parse(CHESS_HOME)?)).on_navigation(
                    move |url| {
                        let _ = handle.emit_to("ui", "chess-nav", url.to_string());
                        true
                    },
                ),
                LogicalPosition::new(RAIL, 0.0),
                LogicalSize::new(w - RAIL, h),
            )?;

            let win = window.clone();
            window.on_window_event(move |e| {
                if let WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } = e {
                    let panel = *win.state::<Layout>().panel.lock().unwrap();
                    place_chess(&win, panel);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("LuftChess konnte nicht gestartet werden");
}
