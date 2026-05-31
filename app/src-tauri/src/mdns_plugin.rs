use mdns_sd::{ServiceDaemon, ServiceInfo};
use tauri::{ipc::Channel, Runtime, State};
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

pub struct MdnsState {
    pub daemon: ServiceDaemon,
    pub node_id: String,
    pub port: u16,
    pub awareness: std::sync::Arc<tokio::sync::RwLock<yrs::sync::Awareness>>,
}

#[tauri::command]
pub fn get_local_port(state: State<'_, MdnsState>) -> u16 {
    state.port
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PeerEvent {
    Found {
        ip: String,
        port: u16,
        room_id: String,
        device_name: String,
        fullname: String,
    },
    Lost {
        fullname: String,
    },
}

#[tauri::command]
pub async fn start_discovery(
    state: State<'_, MdnsState>,
    on_peer_discovered: Channel<PeerEvent>,
) -> Result<(), String> {
    let service_type = "_stratigraph._tcp.local.";
    let receiver = state.daemon.browse(service_type).map_err(|e| e.to_string())?;

    let node_id = state.node_id.clone();
    let awareness = state.awareness.clone();

    tauri::async_runtime::spawn(async move {
        // Continuously listen for mDNS broadcast events
        while let Ok(event) = receiver.recv_async().await {
            match event {
                mdns_sd::ServiceEvent::ServiceResolved(info) => {
                    let ip = info.get_addresses().iter().next().map(|a| a.to_string()).unwrap_or_default();
                    let room_id = info.get_property_val_str("room_id").unwrap_or("").to_string();
                    let device_name = info.get_property_val_str("device_name").unwrap_or("").to_string();
                    let fullname = info.get_fullname().to_string();

                    if !ip.is_empty() {
                        let peer = PeerEvent::Found {
                            ip: ip.clone(),
                            port: info.get_port(),
                            room_id,
                            device_name,
                            fullname: fullname.clone(),
                        };
                        let _ = on_peer_discovered.send(peer);
                        
                        // Full Mesh Tie-breaker Logic
                        let peer_node_id = info.get_property_val_str("node_id").unwrap_or("");
                        let my_node_id = node_id.clone();
                        
                        if !peer_node_id.is_empty() && my_node_id < peer_node_id.to_string() {
                            let a = awareness.clone();
                            let port = info.get_port();
                            let addr = format!("ws://{}:{}/sync", ip, port);
                            log::info!("Connecting to peer {} at {}", peer_node_id, addr);
                            tauri::async_runtime::spawn(async move {
                                if let Err(e) = crate::axum_client::connect_to_peer(&addr, a).await {
                                    log::error!("Failed to connect to peer: {}", e);
                                }
                            });
                        }
                    }
                },
                mdns_sd::ServiceEvent::ServiceRemoved(_, fullname) => {
                    let _ = on_peer_discovered.send(PeerEvent::Lost { fullname });
                },
                _ => {}
            }
        }
    });
    
    Ok(())
}

pub fn register_service(daemon: &ServiceDaemon, port: u16, room_id: &str, device_name: &str, node_id: &str) -> Result<(), String> {
    let service_type = "_stratigraph._tcp.local.";
    let instance_name = format!("{}_{}", device_name, uuid::Uuid::new_v4().simple());
    
    // mdns-sd will auto-detect the IP if we provide the hostname. We leave host empty and IPs empty for auto-detection in newer versions.
    // However, it's safer to use the local IP. We'll let mdns-sd try to resolve it.
    let host_name = format!("{}.local.", instance_name);
    
    let mut properties = HashMap::new();
    properties.insert("room_id".to_string(), room_id.to_string());
    properties.insert("device_name".to_string(), device_name.to_string());
    properties.insert("node_id".to_string(), node_id.to_string());
    
    let service_info = ServiceInfo::new(
        service_type,
        &instance_name,
        &host_name,
        "",
        port,
        Some(properties),
    ).map_err(|e| e.to_string())?;

    daemon.register(service_info).map_err(|e| e.to_string())?;
    Ok(())
}
