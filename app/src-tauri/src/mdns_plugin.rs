use mdns_sd::{ServiceDaemon, ServiceInfo};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{ipc::Channel, State};

pub struct MdnsState {
    pub daemon: ServiceDaemon,
    pub node_id: String,
    pub port: u16,
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

/// Standard mDNS service type for StratiGraph peer discovery.
pub const MDNS_SERVICE_TYPE: &str = "_stratigraph._tcp.local.";

#[tauri::command]
pub async fn start_discovery(
    state: State<'_, MdnsState>,
    service_type: String,
    on_peer_discovered: Channel<PeerEvent>,
) -> Result<(), String> {
    let receiver = state
        .daemon
        .browse(&service_type)
        .map_err(|e| e.to_string())?;

    tauri::async_runtime::spawn(async move {
        while let Ok(event) = receiver.recv_async().await {
            match event {
                mdns_sd::ServiceEvent::ServiceResolved(info) => {
                    let ip = info
                        .get_addresses()
                        .iter()
                        .next()
                        .map(|a| a.to_string())
                        .unwrap_or_default();
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
                            properties: props,
                            fullname: fullname.clone(),
                        };
                        // Best-effort send — the JS channel may have been
                        // dropped if the React component unmounted.
                        let _ = on_peer_discovered.send(peer);
                    }
                }
                mdns_sd::ServiceEvent::ServiceRemoved(_instance, fullname) => {
                    let _ = on_peer_discovered.send(PeerEvent::Lost { fullname });
                }
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
    )
    .map_err(|e| e.to_string())?;

    let fullname = service_info.get_fullname().to_string();
    state
        .daemon
        .register(service_info)
        .map_err(|e| e.to_string())?;
    state.registered_services.lock().unwrap().push(fullname);
    Ok(())
}
