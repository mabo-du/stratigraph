use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{ready, SinkExt, Stream, StreamExt};
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use tokio::net::TcpStream;
use tokio::sync::RwLock;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};
use yrs::sync::{Awareness, Error};
use yrs::Doc;
use yrs_axum::conn::Connection;

struct TungsteniteSink(SplitSink<WebSocketStream<MaybeTlsStream<TcpStream>>, Message>);

impl futures_util::Sink<Vec<u8>> for TungsteniteSink {
    type Error = Error;

    fn poll_ready(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Result<(), Self::Error>> {
        let sink = unsafe { Pin::new_unchecked(&mut self.0) };
        let result = ready!(sink.poll_ready(cx));
        match result {
            Ok(_) => Poll::Ready(Ok(())),
            Err(e) => Poll::Ready(Err(Error::Other(Box::new(e)))),
        }
    }

    fn start_send(mut self: Pin<&mut Self>, item: Vec<u8>) -> Result<(), Self::Error> {
        let sink = unsafe { Pin::new_unchecked(&mut self.0) };
        let result = sink.start_send(Message::Binary(item.into()));
        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(Error::Other(Box::new(e))),
        }
    }

    fn poll_flush(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Result<(), Self::Error>> {
        let sink = unsafe { Pin::new_unchecked(&mut self.0) };
        let result = ready!(sink.poll_flush(cx));
        match result {
            Ok(_) => Poll::Ready(Ok(())),
            Err(e) => Poll::Ready(Err(Error::Other(Box::new(e)))),
        }
    }

    fn poll_close(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Result<(), Self::Error>> {
        let sink = unsafe { Pin::new_unchecked(&mut self.0) };
        let result = ready!(sink.poll_close(cx));
        match result {
            Ok(_) => Poll::Ready(Ok(())),
            Err(e) => Poll::Ready(Err(Error::Other(Box::new(e)))),
        }
    }
}

struct TungsteniteStream(SplitStream<WebSocketStream<MaybeTlsStream<TcpStream>>>);

impl Stream for TungsteniteStream {
    type Item = Result<Vec<u8>, Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let stream = unsafe { Pin::new_unchecked(&mut self.0) };
        let result = ready!(stream.poll_next(cx));
        match result {
            None => Poll::Ready(None),
            Some(Ok(Message::Binary(msg))) => Poll::Ready(Some(Ok(msg.to_vec()))),
            Some(Ok(Message::Text(msg))) => Poll::Ready(Some(Ok(msg.as_bytes().to_vec()))),
            Some(Ok(_)) => Poll::Ready(Some(Err(Error::Other(Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, "Unsupported message type")))))),
            Some(Err(e)) => Poll::Ready(Some(Err(Error::Other(Box::new(e))))),
        }
    }
}

pub async fn connect_to_peer(
    addr: &str,
    awareness: Arc<RwLock<Awareness>>,
) -> Result<(), Box<dyn std::error::Error>> {
    let (stream, _) = tokio::time::timeout(
        std::time::Duration::from_millis(2000),
        tokio_tungstenite::connect_async(addr)
    ).await??;
    let (sink, stream) = stream.split();
    let sink = TungsteniteSink(sink);
    let stream = TungsteniteStream(stream);
    
    let conn = Connection::new(
        awareness,
        sink,
        stream,
    );

    let sink_weak = conn.sink();
    let awareness_lock = conn.awareness().clone();
    
    let _sub = {
        let mut a = awareness_lock.blocking_write();
        let d = a.doc();
        d.observe_update_v1(move |_, e| {
            let update = e.update.to_owned();
            if let Some(sink_arc) = sink_weak.upgrade() {
                let sink_clone = sink_arc.clone();
                tokio::spawn(async move {
                    use yrs::updates::encoder::Encode;
                    let msg = yrs::sync::Message::Sync(yrs::sync::SyncMessage::Update(update)).encode_v1();
                    let mut s = sink_clone.lock().await;
                    if let Err(err) = s.send(msg).await {
                        log::error!("Failed to send update to peer: {}", err);
                    }
                });
            }
        })
        .unwrap()
    };

    // Await the connection loop so it runs forever until closed
    if let Err(e) = conn.await {
        log::error!("Peer connection {} closed with error: {}", addr, e);
    }
    
    Ok(())
}
