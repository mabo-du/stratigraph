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
            });

            // Optionally auto-register service immediately
            // But we might need room_id, so this can also be a command.
            // For now, let's just register with a default or pass it through.
            mdns_plugin::register_service(&daemon, port, "global-room", "Stratigraph-Node", &node_id)
                .expect("Failed to register mDNS service");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            mdns_plugin::start_discovery,
            mdns_plugin::get_local_port
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
