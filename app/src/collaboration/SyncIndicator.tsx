import type { SyncStatus } from '@stratigraph/sync';

interface SyncIndicatorProps {
  status: SyncStatus;
  pendingChanges: number;
}

const variants: Record<SyncStatus, { color: string; bg: string; label: string }> = {
  synced: { color: '#4a9e6f', bg: '#e8f5e9', label: 'Synced' },
  connected: { color: '#5b9bd5', bg: '#e3f0fa', label: 'Connected' },
  connecting: { color: '#d48b45', bg: '#fff3e0', label: 'Syncing...' },
  disconnected: { color: '#c05c5c', bg: '#fde8e8', label: 'Offline' },
};

export function SyncIndicator({ status, pendingChanges }: SyncIndicatorProps) {
  const v = variants[status] || variants.disconnected;

  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 10px', borderRadius: 12,
        fontSize: '0.75rem', fontWeight: 500,
        color: v.color, background: v.bg,
      }}
    >
      <span
        style={{
          width: 6, height: 6, borderRadius: '50%',
          background: v.color, display: 'inline-block',
        }}
      />
      {v.label}
      {pendingChanges > 0 && ` (${pendingChanges})`}
    </span>
  );
}
