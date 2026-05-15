use std::path::PathBuf;

use tauri::Manager;

#[tauri::command]
fn resolve_packcam_default_video_root() -> String {
  let base_dir = dirs::document_dir()
    .or_else(dirs::home_dir)
    .or_else(|| std::env::current_dir().ok())
    .unwrap_or_else(|| PathBuf::from("."));

  base_dir
    .join("PackCam")
    .join("videos")
    .to_string_lossy()
    .to_string()
}

#[tauri::command]
fn write_packcam_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
  let target = PathBuf::from(path.trim());

  if target.as_os_str().is_empty() {
    return Err("Path file kosong.".to_string());
  }

  if let Some(parent) = target.parent() {
    std::fs::create_dir_all(parent)
      .map_err(|error| format!("Gagal membuat folder tujuan: {error}"))?;
  }

  std::fs::write(&target, bytes).map_err(|error| format!("Gagal menulis file: {error}"))?;
  Ok(())
}

#[tauri::command]
fn read_packcam_file(path: String) -> Result<Vec<u8>, String> {
  let target = PathBuf::from(path.trim());

  if target.as_os_str().is_empty() {
    return Err("Path file kosong.".to_string());
  }

  std::fs::read(&target).map_err(|error| format!("Gagal membaca file: {error}"))
}

#[tauri::command]
fn remove_packcam_path(path: String) -> Result<(), String> {
  let target = PathBuf::from(path.trim());

  if target.as_os_str().is_empty() {
    return Err("Path file kosong.".to_string());
  }

  let metadata = std::fs::metadata(&target).map_err(|error| format!("Gagal membaca metadata: {error}"))?;

  if metadata.is_dir() {
    std::fs::remove_dir_all(&target).map_err(|error| format!("Gagal menghapus folder: {error}"))?;
  } else {
    std::fs::remove_file(&target).map_err(|error| format!("Gagal menghapus file: {error}"))?;
  }

  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_sql::Builder::default().build())
    .invoke_handler(tauri::generate_handler![
      resolve_packcam_default_video_root,
      write_packcam_file,
      read_packcam_file,
      remove_packcam_path
    ])
    .setup(|app| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title("PackCam");
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running PackCam");
}
