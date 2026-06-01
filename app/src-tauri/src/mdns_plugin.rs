use mdns_sd::{ServiceDaemon, ServiceInfo};
use tauri::{ipc::Channel, Runtime, State};
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

pub struct MdnsState {
    pub daemon: ServiceDaemon,
    pub node_id: String,
    pub port: u16,
    pub awareness: std::sync::Arc<tokio::sync::RwLock<yrs::sync::Awareness>>,
    pub registered_services: std::sync::Mutex<Vec<String>>,
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
        properties: HashMap<String, String>,
        fullname: String,
    },
    Lost {
        fullname: String,
    },
}

#[tauri::command]
pub async fn start_discovery(
    state: State<'_, MdnsState>,
    service_type: String,
    on_peer_discovered: Channel<PeerEvent>,
) -> Result<(), String> {
    let receiver = state.daemon.browse(&service_type).map_err(|e| e.to_string())?;

    let node_id = state.node_id.clone();
    let awareness = state.awareness.clone();
    let blacklist = std::sync::Arc::new(std::sync::Mutex::new(HashMap::<String, std::time::Instant>::new()));

    tauri::async_runtime::spawn(async move {
        // Continuously listen for mDNS broadcast events
        while let Ok(event) = receiver.recv_async().await {
            match event {
                mdns_sd::ServiceEvent::ServiceResolved(info) => {
                    let ip = info.get_addresses().iter().next().map(|a| a.to_string()).unwrap_or_default();
                    let fullname = info.get_fullname().to_string();
                    
                    let mut props = HashMap::new();
                    for prop in info.get_properties().iter() {
                        let val = prop.val_str();
                        props.insert(prop.key().to_string(), val.to_string());
                    }

                    if !ip.is_empty() {
                        let peer = PeerEvent::Found {
                            ip: ip.clone(),
                            port: info.get_port(),
                            properties: props.clone(),
                            fullname: fullname.clone(),
                        };
                        let _ = on_peer_discovered.send(peer);
                        
                        // Full Mesh Tie-breaker Logic
                        let peer_node_id = props.get("node_id").map(|s: &String| s.as_str()).unwrap_or("");
                        let my_node_id = node_id.clone();
                        
                        if !peer_node_id.is_empty() && my_node_id < peer_node_id.to_string() {
                            let port = info.get_port();
                            let addr = format!("ws://{}:{}/sync", ip, port);
                            
                            // Check Cooldown Blacklist
                            {
                                let mut bl = blacklist.lock().unwrap();
                                if let Some(&time) = bl.get(&addr) {
                                    if time.elapsed() < std::time::Duration::from_secs(60) {
                                        continue;
                                    } else {
                                        bl.remove(&addr);
                                    }
                                }
                            }
                            
                            let a = awareness.clone();
                            let addr_clone = addr.clone();
                            let bl_clone = blacklist.clone();
                            log::info!("Connecting to peer {} at {}", peer_node_id, addr);
                            tauri::async_runtime::spawn(async move {
                                if let Err(e) = crate::axum_client::connect_to_peer(&addr_clone, a).await {
                                    log::error!("Failed to connect to peer: {}", e);
                                    bl_clone.lock().unwrap().insert(addr_clone, std::time::Instant::now());
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

#[tauri::command]
pub fn register_service(
    state: State<'_, MdnsState>,
    service_type: String,
    device_name: String,
    properties: HashMap<String, String>,
) -> Result<(), String> {
    let instance_name = format!("{}_{}", device_name, uuid::Uuid::new_v4().simple());
    
    let host_name = format!("{}.local.", instance_name);
    
    let mut safe_properties = HashMap::new();
    // Ensure we include node_id for tie breaker
    safe_properties.insert("node_id".to_string(), state.node_id.clone());
    for (k, v) in properties {
        safe_properties.insert(k, v);
    }
    
    let service_info = ServiceInfo::new(
        &service_type,
        &instance_name,
        &host_name,
        "",
        state.port,
        Some(safe_properties),
    ).map_err(|e| e.to_string())?;

    let fullname = service_info.get_fullname().to_string();
    state.daemon.register(service_info).map_err(|e| e.to_string())?;
    state.registered_services.lock().unwrap().push(fullname);
    Ok(())
}
