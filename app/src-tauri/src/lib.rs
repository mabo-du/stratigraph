#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub mod axum_sync;
pub mod mdns_plugin;

use mdns_sd::ServiceDaemon;
use sha2::Digest;
use std::sync::Arc;
use tauri::Manager;

// ── Per-install Stronghold salt ──────────────────────────────────────────────

/// Returns a per-install random salt for the Stronghold KDF.
/// On first run a fresh salt is generated and persisted to disk;
/// subsequent runs read the existing salt so the vault remains decryptable.
fn get_or_create_stronghold_salt() -> Vec<u8> {
    let salt_path = salt_file_path();

    // Try to read an existing salt first.
    if let Ok(salt) = std::fs::read(&salt_path) {
        if salt.len() >= 32 {
            return salt;
        }
    }

    // Generate a fresh 32-byte salt from a UUID v4 source (backed by
    // the OS CSPRNG on all platforms).
    let salt = sha2::Sha256::digest(uuid::Uuid::new_v4().to_string().as_bytes()).to_vec();

    // Best-effort persist — if the directory doesn't exist yet we skip
    // rather than failing the app startup.
    if let Some(parent) = salt_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&salt_path, &salt);

    salt
}

/// Platform-appropriate location for the per-install salt file.
fn salt_file_path() -> std::path::PathBuf {
    #[cfg(target_os = "linux")]
    {
        if let Ok(dir) = std::env::var("XDG_DATA_HOME") {
            return std::path::PathBuf::from(dir)
                .join("stratigraph")
                .join("stronghold_salt");
        }
        if let Ok(home) = std::env::var("HOME") {
            return std::path::PathBuf::from(home).join(".local/share/stratigraph/stronghold_salt");
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return std::path::PathBuf::from(home)
                .join("Library/Application Support/com.stratigraph.desktop/stronghold_salt");
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return std::path::PathBuf::from(appdata)
                .join("com.stratigraph.desktop")
                .join("stronghold_salt");
        }
    }
    // Absolute last-resort fallback — the current working directory.
    std::path::PathBuf::from("stratigraph_stronghold_salt")
}

// ── Room cleanup ─────────────────────────────────────────────────────────────

/// Called from the JS side when the user switches projects or exits
/// collaboration, so the old room's Yrs document and BroadcastGroup are
/// dropped and memory is reclaimed.
#[tauri::command]
async fn cleanup_room(
    room_id: String,
    registry: tauri::State<'_, Arc<axum_sync::RoomRegistry>>,
) -> Result<(), String> {
    registry.remove(&room_id).await;
    log::info!("Cleaned up room {}", room_id);
    Ok(())
}

// ── Application entry point ─────────────────────────────────────────────────

pub fn run() {
    // Generate (or load) the per-install salt once before building the
    // plugin, then move it into the closure.
    let salt = get_or_create_stronghold_salt();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(
            tauri_plugin_stronghold::Builder::new(move |password| {
                use sha2::{Digest, Sha256};
                let mut hasher = Sha256::new();
                hasher.update(password.as_bytes());
                hasher.update(&salt);
                hasher.finalize().to_vec()
            })
            .build(),
        )
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Create the room registry — one Yrs document per room, created
            // lazily when the first WebSocket connects for that room.
            let registry = Arc::new(axum_sync::RoomRegistry::new());

            // Start the Axum WebSocket relay on a random loopback port.
            let registry_clone = registry.clone();
            let port = tauri::async_runtime::block_on(async move {
                axum_sync::start_axum_server(registry_clone).await
            });

            // Start the mDNS Service Daemon for peer discovery.
            let daemon = ServiceDaemon::new().expect("Failed to create mDNS daemon");
            let node_id = uuid::Uuid::new_v4().to_string();

            // Manage Tauri state.
            app.manage(registry);
            app.manage(mdns_plugin::MdnsState {
                daemon: daemon.clone(),
                node_id,
                port,
                registered_services: std::sync::Mutex::new(Vec::new()),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            mdns_plugin::start_discovery,
            mdns_plugin::get_local_port,
            mdns_plugin::register_service,
            cleanup_room,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                let state = app_handle.state::<mdns_plugin::MdnsState>();
                let services = state.registered_services.lock().unwrap();
                for fullname in services.iter() {
                    log::info!("Unregistering mDNS service: {}", fullname);
                    let _ = state.daemon.unregister(fullname);
                }
                // Allow brief time for UDP goodbye packets to be broadcast
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
        });
}
