use axum::{
    extract::ws::{WebSocket, WebSocketUpgrade},
    routing::get,
    Router,
};
use futures_util::StreamExt;
use std::sync::Arc;
use tokio::sync::Mutex;
use yrs_axum::AwarenessRef;
use yrs_axum::broadcast::BroadcastGroup;
use yrs_axum::ws::{AxumSink, AxumStream};

pub async fn start_axum_server(awareness: AwarenessRef) -> u16 {
    // We use a BroadcastGroup which encapsulates the Awareness protocol and broadcast streams.
    let bcast = Arc::new(BroadcastGroup::new(awareness, 100).await);

    let bcast_clone = bcast.clone();
    let app = Router::new().route(
        "/sync",
        get(move |ws: WebSocketUpgrade| {
            let bcast_clone = bcast_clone.clone();
            async move {
                ws.on_upgrade(move |socket| async move {
                    let (sink, stream) = socket.split();
                    let sink = Arc::new(Mutex::new(AxumSink::from(sink)));
                    let stream = AxumStream::from(stream);
                    
                    let sub = bcast_clone.subscribe(sink, stream);
                    match sub.completed().await {
                        Ok(_) => log::info!("WebSocket peer disconnected gracefully"),
                        Err(e) => log::error!("WebSocket peer disconnected with error: {}", e),
                    }
                })
            }
        }),
    );

    // Bind to all interfaces with dynamic port 0
    let listener = tokio::net::TcpListener::bind("0.0.0.0:0").await.unwrap();
    let local_addr = listener.local_addr().unwrap();
    let port = local_addr.port();

    tauri::async_runtime::spawn(async move {
        log::info!("Started Axum WebSocket server on port {}", port);
        if let Err(e) = axum::serve(listener, app).await {
            log::error!("Axum server error: {}", e);
        }
    });

    port
}
