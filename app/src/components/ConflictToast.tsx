import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConflictToastProps {
  message: string;
  onDismiss: () => void;
  autoHideMs?: number;
}

export function ConflictToast({ message, onDismiss, autoHideMs = 8000 }: ConflictToastProps) {
  const [visible, setVisible] = useState(true);

  const dismiss = useCallback(() => {
    setVisible(false);
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    const timer = setTimeout(dismiss, autoHideMs);
    return () => clearTimeout(timer);
  }, [dismiss, autoHideMs]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        zIndex: 2000,
        display: 'flex', alignItems: 'center', gap: 10,
        background: '#c05c5c', color: '#fff',
        padding: '10px 18px', borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        fontSize: '0.85rem', maxWidth: 500,
      }}
    >
      <AlertTriangle size={16} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{message}</span>
      <X
        size={16}
        onClick={dismiss}
        style={{ cursor: 'pointer', opacity: 0.7, flexShrink: 0 }}
      />
    </div>
  );
}

/**
 * Hook to manage conflict toasts.
 * Uses a monotonically increasing key to force re-mount on each new conflict.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useConflictToast() {
  const [conflict, setConflict] = useState<string | null>(null);
  const [toastKey, setToastKey] = useState(0);

  const showConflict = useCallback((message: string) => {
    setConflict(message);
    setToastKey(k => k + 1);
  }, []);

  const dismissConflict = useCallback(() => {
    setConflict(null);
  }, []);

  return {
    conflict,
    showConflict,
    dismissConflict,
    toast: conflict ? (
      <ConflictToast
        key={toastKey}
        message={conflict}
        onDismiss={dismissConflict}
      />
    ) : null,
  };
}
