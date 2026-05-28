import { useState } from 'react';
import { Copy, Check, X } from 'lucide-react';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  shareableLink: string;
}

export function ShareDialog({ open, onClose, shareableLink }: ShareDialogProps) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS contexts
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
            marginBottom: 12, position: 'relative',
          }}
        >
          {shareableLink}
        </div>

        <button
          onClick={handleCopy}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 6, border: 'none',
            background: copied ? '#4a9e6f' : '#5b9bd5', color: '#fff',
            cursor: 'pointer', fontSize: '0.85rem', width: '100%',
            justifyContent: 'center',
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied!' : 'Copy invite link'}
        </button>
      </div>
    </div>
  );
}
