// The desktop shell. Two windows: the full app ("main") and the widget, a small frameless window
// that floats above everything and shows only the figure. Both read the Legend vault straight
// from disk, so the widget fills in as you talk to Claude. The vault is LEGEND_VAULT if set, else
// the "vault" in ~/.legend/config.json, else ~/Legend: the same places the capture scripts look.
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(serde::Serialize)]
struct VaultFiles {
    path: String,
    seed: Option<String>,
    sessions: Vec<String>, // the text of every session file, for the app to parse
}

fn home() -> PathBuf {
    PathBuf::from(std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).unwrap_or_default())
}

/// ~/.legend/config.json: where the vault lives, and where node and the capture scripts are.
fn config() -> serde_json::Value {
    fs::read_to_string(home().join(".legend").join("config.json"))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or(serde_json::Value::Null)
}

fn vault_dir() -> PathBuf {
    if let Ok(p) = std::env::var("LEGEND_VAULT") {
        return PathBuf::from(p);
    }
    config().get("vault").and_then(|s| s.as_str()).map(PathBuf::from).unwrap_or_else(|| home().join("Legend"))
}

/// A vault to read: the one given (a folder the user opened), or the user's own.
fn dir_for(path: Option<String>) -> PathBuf {
    path.map(PathBuf::from).unwrap_or_else(vault_dir)
}

// Privacy: the vault's settings.json, which the capture hook reads on every prompt.
const LEVELS: [&str; 3] = ["verbatim", "keywords", "scores"];

fn read_settings() -> serde_json::Value {
    fs::read_to_string(vault_dir().join("settings.json"))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

#[derive(serde::Serialize)]
struct Privacy {
    privacy: String,
    record_project: bool,
    records: usize, // captured prompts on disk, for the scrub warning
}

#[tauri::command]
fn read_privacy() -> Privacy {
    let s = read_settings();
    let records = fs::read_dir(vault_dir().join("raw"))
        .map(|d| {
            d.flatten()
                .filter_map(|e| fs::read_to_string(e.path()).ok())
                .map(|t| t.lines().filter(|l| !l.trim().is_empty()).count())
                .sum()
        })
        .unwrap_or(0);
    Privacy {
        privacy: s.get("privacy").and_then(|v| v.as_str()).unwrap_or("verbatim").to_string(),
        record_project: s.get("recordProject").and_then(|v| v.as_bool()).unwrap_or(false),
        records,
    }
}

/// Set the privacy level. Tightening it (fewer words kept, or project names off) marks existing
/// records for scrubbing and starts the scrub straight away when the capture scripts can be found;
/// otherwise the next capture does it. Returns whether a scrub was started now.
#[tauri::command]
fn write_privacy(privacy: String, record_project: bool) -> Result<bool, String> {
    let rank = |l: &str| LEVELS.iter().position(|x| *x == l).unwrap_or(0);
    if !LEVELS.contains(&privacy.as_str()) {
        return Err(format!("unknown privacy level {privacy}"));
    }
    let mut s = read_settings();
    let old_level = s.get("privacy").and_then(|v| v.as_str()).unwrap_or("verbatim").to_string();
    let old_project = s.get("recordProject").and_then(|v| v.as_bool()).unwrap_or(false);
    let tighter = rank(&privacy) > rank(&old_level) || (old_project && !record_project);
    let pending = tighter || s.get("pending").and_then(|v| v.as_bool()).unwrap_or(false);
    s["privacy"] = serde_json::json!(privacy);
    s["recordProject"] = serde_json::json!(record_project);
    s["pending"] = serde_json::json!(pending);
    let dir = vault_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("settings.json"), serde_json::to_string_pretty(&s).unwrap() + "\n").map_err(|e| e.to_string())?;
    if !pending {
        return Ok(false);
    }
    let cfg = config();
    let (Some(node), Some(scripts)) = (cfg.get("node").and_then(|v| v.as_str()), cfg.get("scripts").and_then(|v| v.as_str())) else {
        return Ok(false);
    };
    let mut cmd = std::process::Command::new(node);
    cmd.arg(Path::new(scripts).join("classify.mjs")).arg("--apply-privacy").env("LEGEND_CAPTURE", "off").env("LEGEND_VAULT", &dir);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console flashing up
    }
    let started = cmd.spawn().is_ok();
    Ok(started)
}

fn collect_sessions(dir: &Path, out: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let hidden = path.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with('.'));
        if hidden {
            continue;
        }
        if path.is_dir() {
            collect_sessions(&path, out);
        } else if path.extension().is_some_and(|e| e == "md") {
            if let Ok(text) = fs::read_to_string(&path) {
                out.push(text);
            }
        }
    }
}

/// Every session file in the vault, and the genome's seed when there is one.
#[tauri::command]
fn read_vault(path: Option<String>) -> VaultFiles {
    let dir = dir_for(path);
    let seed = fs::read_to_string(dir.join("genome.json"))
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| v.get("seed").and_then(|s| s.as_str()).map(String::from));
    let mut sessions = Vec::new();
    collect_sessions(&dir.join("sessions"), &mut sessions);
    VaultFiles { path: dir.to_string_lossy().into_owned(), seed, sessions }
}

#[derive(serde::Serialize)]
struct SessionStamp {
    path: String,
    modified: u64, // ms since the epoch
}

fn collect_paths(dir: &Path, out: &mut Vec<SessionStamp>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with('.')) {
            continue;
        }
        if path.is_dir() {
            collect_paths(&path, out);
        } else if path.extension().is_some_and(|e| e == "md") {
            let modified = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            out.push(SessionStamp { path: path.to_string_lossy().into_owned(), modified });
        }
    }
}

/// Every session file's path and modified time, without reading them: the watcher's cheap look.
#[tauri::command]
fn list_sessions(path: Option<String>) -> Vec<SessionStamp> {
    let mut out = Vec::new();
    collect_paths(&dir_for(path).join("sessions"), &mut out);
    out
}

/// The text of the given session files (only those inside the vault; missing ones come back empty).
#[tauri::command]
fn read_sessions(paths: Vec<String>, root: Option<String>) -> Vec<String> {
    let root = dir_for(root);
    paths
        .iter()
        .map(|p| {
            let path = PathBuf::from(p);
            if path.starts_with(&root) { fs::read_to_string(path).unwrap_or_default() } else { String::new() }
        })
        .collect()
}

/// Save one file into a folder the user chose: an imagery still (JPEG) or a video clip (MP4). Takes
/// a data URL; `ext` defaults to jpg.
#[tauri::command]
fn save_image(dir: String, name: String, data_url: String, ext: Option<String>) -> Result<String, String> {
    use base64::Engine;
    let b64 = data_url.split_once(',').map(|(_, b)| b).ok_or("not a data URL")?;
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
    let safe: String = name.chars().filter(|c| c.is_ascii_alphanumeric() || "-_. ".contains(*c)).collect();
    let ext: String = ext.unwrap_or_else(|| "jpg".into()).chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    let path = Path::new(&dir).join(format!("{safe}.{ext}"));
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Bring a window forward (the widget's "open Legend" uses this for the main window).
#[tauri::command]
fn show_window(app: tauri::AppHandle, label: String) {
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Show the widget if it is hidden, hide it if it is showing (W in the main app).
#[tauri::command]
fn toggle_window(app: tauri::AppHandle, label: String) {
    if let Some(w) = app.get_webview_window(&label) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.show();
        }
    }
}

#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_vault, show_window, toggle_window, quit, read_privacy, write_privacy, list_sessions, read_sessions, save_image])
        .on_window_event(|window, event| {
            // The widget is always square: a resize snaps to the larger side.
            if let tauri::WindowEvent::Resized(size) = event {
                if window.label() == "widget" && size.width != size.height {
                    let side = size.width.max(size.height);
                    let _ = window.set_size(tauri::PhysicalSize::new(side, side));
                }
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // With the widget floating, closing the full app only hides it; with no widget, it quits.
                let widget_up = window.app_handle().get_webview_window("widget").and_then(|w| w.is_visible().ok()).unwrap_or(false);
                if window.label() == "main" && widget_up {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Legend");
}
