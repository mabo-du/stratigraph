import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Link, Camera, Check } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

interface JoinDialogProps {
  open: boolean;
  onClose: () => void;
  onJoin: (roomId: string, key: string) => void;
}

/**
 * Parses a StratiGraph collaboration link of the form:
 *   stratigraph://join/{roomId}[?server=...][#key={encryptionKey}]
 */
function parseJoinLink(input: string): { roomId: string; key: string } | null {
  const trimmed = input.trim();

  // Support raw room IDs (just the hex string) for quick manual entry
  if (/^[a-f0-9]{32}$/i.test(trimmed)) {
    return { roomId: trimmed, key: '' };
  }

  // Parse stratigraph://join/{roomId}...
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // Try prepending a scheme if the user pasted without it
    try {
      url = new URL('stratigraph://' + trimmed);
    } catch {
      return null;
    }
  }

  // Extract room ID from the path: /join/{roomId}
  const parts = url.pathname.replace(/^\/+/, '').split('/');
  if (parts.length < 2 || parts[0] !== 'join') return null;
  const roomId = parts[1];
  if (!roomId) return null;

  // Extract key from the fragment: #key=...
  const fragmentParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const key = fragmentParams.get('key') ?? '';

  return { roomId, key };
}

export function JoinDialog({ open, onClose, onJoin }: JoinDialogProps) {
  const [linkInput, setLinkInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [joined, setJoined] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivRef = useRef<HTMLDivElement>(null);

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const handlePasteJoin = useCallback(() => {
    const result = parseJoinLink(linkInput);
    if (!result) {
      setError('Invalid link. Paste the full collaboration link or the room ID.');
      return;
    }
    setJoined(true);
    onJoin(result.roomId, result.key);
    setTimeout(() => {
      onClose();
      setLinkInput('');
      setError(null);
      setJoined(false);
    }, 800);
  }, [linkInput, onJoin, onClose]);

  const handleStartScan = useCallback(async () => {
    setScanning(true);
    setError(null);

    // Small delay to let the DOM element render
    await new Promise(r => setTimeout(r, 100));

    try {
      const scanner = new Html5Qrcode('join-qr-scanner');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // Stop scanning on first successful decode
          scanner.stop().catch(() => {});
          setScanning(false);

          const result = parseJoinLink(decodedText);
          if (result) {
            setJoined(true);
            onJoin(result.roomId, result.key);
            setTimeout(() => {
              onClose();
              setLinkInput('');
              setError(null);
              setJoined(false);
            }, 800);
          } else {
            setError('QR code does not contain a valid collaboration link.');
          }
        },
        () => { /* ignore scan errors */ },
      );
    } catch (err: any) {
      setScanning(false);
      setError('Could not access camera. Try pasting the link instead.');
      console.error('QR scanner error:', err);
    }
  }, [onJoin, onClose]);

  const handleStopScan = useCallback(async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop().catch(() => {});
    }
    setScanning(false);
  }, []);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: 12,
          padding: 24, maxWidth: 440, width: '90%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Join Session</h3>
          <X size={18} style={{ cursor: 'pointer', opacity: 0.5 }} onClick={onClose} />
        </div>

        <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: 12 }}>
          Paste a collaboration link or scan the QR code from another device to join their session.
        </p>

        {/* Manual link input */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="stratigraph://join/..."
            value={linkInput}
            onChange={(e) => { setLinkInput(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handlePasteJoin(); }}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 6,
              border: '1px solid #ddd', fontSize: '0.85rem',
              fontFamily: 'monospace',
            }}
            autoFocus
          />
          <button
            onClick={handlePasteJoin}
            disabled={joined}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '8px 14px', borderRadius: 6, border: 'none',
              background: joined ? '#4a9e6f' : '#5b9bd5', color: '#fff',
              cursor: joined ? 'default' : 'pointer', fontSize: '0.85rem',
              whiteSpace: 'nowrap',
            }}
          >
            {joined ? <Check size={16} /> : <Link size={16} />}
            {joined ? 'Joined!' : 'Join'}
          </button>
        </div>

        {/* QR scanner toggle */}
        {!scanning ? (
          <button
            onClick={handleStartScan}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '10px', borderRadius: 6,
              border: '1px dashed #ccc', background: '#fafafa',
              cursor: 'pointer', fontSize: '0.85rem', color: '#555',
            }}
          >
            <Camera size={16} />
            Scan QR Code
          </button>
        ) : (
          <div>
            <div
              id="join-qr-scanner"
              ref={scannerDivRef}
              style={{ width: '100%', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}
            />
            <button
              onClick={handleStopScan}
              style={{
                width: '100%', padding: '8px', borderRadius: 6,
                border: '1px solid #ddd', background: '#fff',
                cursor: 'pointer', fontSize: '0.85rem',
              }}
            >
              Cancel Scan
            </button>
          </div>
        )}

        {error && (
          <p style={{ marginTop: 8, fontSize: '0.8rem', color: '#c05c5c' }}>{error}</p>
        )}
      </div>
    </div>
  );
}
