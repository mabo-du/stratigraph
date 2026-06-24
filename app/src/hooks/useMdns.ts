import { useEffect, useState } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';

export interface Peer {
    ip: string;
    port: number;
    roomId: string;
    deviceName: string;
    fullname: string;
}

const SERVICE_TYPE = '_stratigraph._tcp.local.';

export function useMdnsDiscovery(roomId: string) {
    const [peers, setPeers] = useState<Map<string, Peer>>(new Map());

    useEffect(() => {
        // Ensure this only runs in a Tauri context
        if (!(window as any).__TAURI_INTERNALS__) return;
        if (!roomId) return;

        let cancelled = false;

        const setupDiscovery = async () => {
            const channel = new Channel<{
                type: string;
                ip?: string;
                port?: number;
                properties?: Record<string, string>;
                fullname?: string;
            }>();

            channel.onmessage = (event) => {
                if (cancelled) return;
                // roomId is nested inside `properties` (a HashMap) on the Rust
                // PeerEvent::Found struct, not a top-level field.
                if (event.type === 'Found' && event.properties?.roomId === roomId) {
                    setPeers((prev) => {
                        const next = new Map(prev);
                        next.set(event.fullname!, {
                            ip: event.ip!,
                            port: event.port!,
                            roomId: event.properties!.roomId!,
                            deviceName: event.properties!.deviceName ?? '',
                            fullname: event.fullname!,
                        });
                        return next;
                    });
                } else if (event.type === 'Lost') {
                    setPeers((prev) => {
                        if (prev.has(event.fullname!)) {
                            const next = new Map(prev);
                            next.delete(event.fullname!);
                            return next;
                        }
                        return prev;
                    });
                }
            };

            try {
                await invoke('start_discovery', {
                    serviceType: SERVICE_TYPE,
                    onPeerDiscovered: channel,
                });
            } catch (err) {
                if (!cancelled) {
                    console.error('mDNS Discovery failed to start:', err);
                }
            }
        };

        setupDiscovery();
        return () => { cancelled = true; };
    }, [roomId]);

    return Array.from(peers.values());
}
