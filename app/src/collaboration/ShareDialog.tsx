import { useState, useRef, useEffect } from 'react';
import { Copy, Check, X } from 'lucide-react';
import QRCode from 'qrcode';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  shareableLink: string;
}

export function ShareDialog({ open, onClose, shareableLink }: ShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (showQR && qrCanvasRef.current && shareableLink) {
      QRCode.toCanvas(qrCanvasRef.current, shareableLink, {
        width: 200,
        margin: 2,
        color: { dark: '#0b0e11', light: '#ffffff' },
      });
    }
  }, [showQR, shareableLink]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = shareableLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Share Session</h3>
          <X size={18} style={{ cursor: 'pointer', opacity: 0.5 }} onClick={onClose} />
        </div>

        <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: 12 }}>
          Share this link with your team. It includes an encryption key — anyone with the link can join.
        </p>

        <div
          style={{
            background: '#f5f5f5', borderRadius: 6, padding: '10px 12px',
            fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all',
            marginBottom: 12,
          }}
        >
          {shareableLink}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            onClick={handleCopy}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 6, border: 'none',
              background: copied ? '#4a9e6f' : '#5b9bd5', color: '#fff',
              cursor: 'pointer', fontSize: '0.85rem', flex: 1,
              justifyContent: 'center',
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button
            onClick={() => setShowQR(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 6, border: '1px solid #ddd',
              background: showQR ? '#f0f4f8' : '#fff', color: '#333',
              cursor: 'pointer', fontSize: '0.85rem',
            }}
          >
            {showQR ? 'Hide' : 'QR'}
          </button>
        </div>

        {showQR && (
          <div style={{ textAlign: 'center', padding: 8 }}>
            <canvas ref={qrCanvasRef} style={{ borderRadius: 8 }} />
            <p style={{ fontSize: '0.75rem', color: '#888', marginTop: 8 }}>
              Scan with phone camera to join
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
