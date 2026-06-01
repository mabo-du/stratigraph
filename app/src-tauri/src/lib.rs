#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub mod axum_sync;
pub mod axum_client;
pub mod mdns_plugin;

use std::sync::Arc;
use yrs::Doc;
use mdns_sd::ServiceDaemon;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_stronghold::Builder::new(|password| {
            use sha2::{Sha256, Digest};
            let salt = b"stratigraph_secure_salt_v1";
            let mut hasher = Sha256::new();
            hasher.update(password.as_bytes());
            hasher.update(salt);
            hasher.finalize().to_vec()
        }).build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            
            // Initialize Yrs document
            let doc = yrs::Doc::new();
            let awareness = std::sync::Arc::new(tokio::sync::RwLock::new(yrs::sync::Awareness::new(doc)));
            
            // Start the Axum server dynamically
            let awareness_clone = awareness.clone();
            let port = tauri::async_runtime::block_on(async move {
                axum_sync::start_axum_server(awareness_clone).await
            });

            // Start the mDNS Service Daemon
            let daemon = ServiceDaemon::new().expect("Failed to create mDNS daemon");
            let node_id = uuid::Uuid::new_v4().to_string();
            
            // Manage Tauri State
            app.manage(mdns_plugin::MdnsState {
                daemon: daemon.clone(),
                node_id: node_id.clone(),
                port,
                awareness: awareness.clone(),
                registered_services: std::sync::Mutex::new(Vec::new()),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            mdns_plugin::start_discovery,
            mdns_plugin::get_local_port,
            mdns_plugin::register_service
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
