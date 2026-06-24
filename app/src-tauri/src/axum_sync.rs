use axum::{
    extract::ws::WebSocketUpgrade,
    extract::{Path, State},
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::StreamExt;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use yrs_axum::broadcast::BroadcastGroup;
use yrs_axum::ws::{AxumSink, AxumStream};
use yrs_axum::AwarenessRef;

// ── Room registry ────────────────────────────────────────────────────────────

/// One Yrs document per collaboration room, created lazily when the first
/// WebSocket connects for that room ID.  Dropped automatically when the last
/// `Arc` reference is released (i.e. when `cleanup_room` is called from JS).
pub struct RoomRegistry {
    rooms: RwLock<HashMap<String, Arc<BroadcastGroup>>>,
    /// We keep the Awareness alive so that awareness state (cursor positions,
    /// user names) survives even if all peers temporarily disconnect.
    _awarenesses: RwLock<HashMap<String, AwarenessRef>>,
}

impl RoomRegistry {
    pub fn new() -> Self {
        Self {
            rooms: RwLock::new(HashMap::new()),
            _awarenesses: RwLock::new(HashMap::new()),
        }
    }

    /// Get or create the BroadcastGroup for `room_id`.
    pub async fn get_or_create(self: &Arc<Self>, room_id: &str) -> Arc<BroadcastGroup> {
        // Fast path: read lock to check existence.
        {
            let rooms = self.rooms.read().await;
            if let Some(bcast) = rooms.get(room_id) {
                return Arc::clone(bcast);
            }
        }

        // Slow path: create a new room.
        let doc = yrs::Doc::new();
        let awareness: AwarenessRef = Arc::new(RwLock::new(yrs::sync::Awareness::new(doc)));
        let bcast = Arc::new(BroadcastGroup::new(awareness.clone(), 100).await);

        let mut rooms = self.rooms.write().await;
        // Double-check: another task may have created the room while we waited.
        if let Some(existing) = rooms.get(room_id) {
            return Arc::clone(existing);
        }
        rooms.insert(room_id.to_string(), Arc::clone(&bcast));
        self._awarenesses
            .write()
            .await
            .insert(room_id.to_string(), awareness);
        bcast
    }

    /// Remove a room and its associated document.  Safe to call even if the
    /// room does not exist.
    pub async fn remove(&self, room_id: &str) {
        self.rooms.write().await.remove(room_id);
        self._awarenesses.write().await.remove(room_id);
    }
}

// ── Axum server ──────────────────────────────────────────────────────────────

async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(room_id): Path<String>,
    State(registry): State<Arc<RoomRegistry>>,
) -> impl IntoResponse {
    let bcast = registry.get_or_create(&room_id).await;

    ws.on_upgrade(move |socket| async move {
        let (sink, stream) = socket.split();
        let sink = Arc::new(Mutex::new(AxumSink::from(sink)));
        let stream = AxumStream::from(stream);

        let sub = bcast.subscribe(sink, stream);
        match sub.completed().await {
            Ok(_) => log::info!("WebSocket peer disconnected from room {}", room_id),
            Err(e) => log::error!(
                "WebSocket peer in room {} disconnected with error: {}",
                room_id,
                e
            ),
        }
    })
}

pub async fn start_axum_server(registry: Arc<RoomRegistry>) -> u16 {
    let app = Router::new()
        .route("/sync/{room_id}", get(ws_handler))
        .with_state(registry);

    // Bind to loopback only — the relay must never be exposed to other
    // machines on the network without explicit authentication.
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let local_addr = listener.local_addr().unwrap();
    let port = local_addr.port();

    tauri::async_runtime::spawn(async move {
        log::info!("Started Axum WebSocket relay on 127.0.0.1:{}", port);
        if let Err(e) = axum::serve(listener, app).await {
            log::error!("Axum server error: {}", e);
        }
    });

    port
}
