import { useEffect, useState } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';

export interface Peer {
    ip: string;
    port: number;
    roomId: string;
    deviceName: string;
    fullname: string;
}

export function useMdnsDiscovery(roomId: string) {
    const [peers, setPeers] = useState<Map<string, Peer>>(new Map());

    useEffect(() => {
        // Ensure this only runs in a Tauri context
        if (!(window as any).__TAURI_INTERNALS__) return;

        const setupDiscovery = async () => {
            const channel = new Channel<{ type: string; ip?: string; port?: number; roomId?: string; deviceName?: string; fullname?: string }>();
            
            channel.onmessage = (event) => {
                if (event.type === 'Found' && event.roomId === roomId) {
                    setPeers((prev) => {
                        const next = new Map(prev);
                        next.set(event.fullname!, {
                            ip: event.ip!,
                            port: event.port!,
                            roomId: event.roomId!,
                            deviceName: event.deviceName!,
                            fullname: event.fullname!
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
                await invoke('start_discovery', { onPeerDiscovered: channel });
            } catch (err) {
                console.error("mDNS Discovery failed to start:", err);
            }
        };

        setupDiscovery();
    }, [roomId]);

    return Array.from(peers.values());
}
