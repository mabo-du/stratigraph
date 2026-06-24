import { WifiOff, Link } from 'lucide-react';
import type { SyncStatus } from '@stratigraph/sync';
import { isTauri } from '../utils/tauriBridge';

interface Collaborator {
  userId: string;
  displayName: string;
  color: string;
  activity?: string;
}

interface CollaborationBarProps {
  isConnected: boolean;
  status: SyncStatus;
  collaborators: Collaborator[];
  pendingChanges: number;
  onCopyLink: () => void;
  onJoinClick: () => void;
  onStartSession: () => void;
  onLeaveSession: () => void;
  onShowUsers: () => void;
}

const COLORS: Record<string, string> = {
  synced: '#4a9e6f',
  connected: '#5b9bd5',
  connecting: '#d48b45',
  disconnected: '#c05c5c',
};

const LABELS: Record<string, string> = {
  synced: 'Synced',
  connected: 'Connected',
  connecting: 'Connecting...',
  disconnected: 'Offline',
};

export function CollaborationBar({
  isConnected,
  status,
  collaborators,
  pendingChanges,
  onCopyLink,
  onJoinClick,
  onStartSession,
  onLeaveSession,
  onShowUsers,
}: CollaborationBarProps) {
  const color = COLORS[status] || COLORS.disconnected;
  const label = LABELS[status] || LABELS.disconnected;

  if (!isConnected) {
    if (!isTauri()) {
      return (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 12px', borderRadius: 6,
            border: `1px solid var(--border-2)`,
            color: 'var(--text-3)', fontSize: '0.8rem', cursor: 'not-allowed',
          }}
          title="Web app is offline-only for privacy. Use the desktop app for local P2P sync."
        >
          <WifiOff size={14} />
          <span>Offline Only</span>
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 12px', borderRadius: 6,
            border: `1px solid ${color}`,
            color, fontSize: '0.8rem', cursor: 'pointer',
          }}
          onClick={onStartSession}
          title="Start collaboration session"
        >
          <WifiOff size={14} />
          <span>Collaborate</span>
        </div>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 8px', borderRadius: 6,
            border: '1px solid var(--border-2)',
            color: 'var(--text-2)', fontSize: '0.8rem', cursor: 'pointer',
          }}
          onClick={onJoinClick}
          title="Join an existing session"
        >
          <Link size={14} />
          <span>Join</span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '4px 12px', borderRadius: 6,
        border: `1px solid ${color}`,
        color, fontSize: '0.8rem',
      }}
    >
      <span
        style={{
          width: 8, height: 8, borderRadius: '50%',
          background: color, display: 'inline-block',
        }}
      />
      <span>{label}</span>

      {/* Collaborator avatars */}
      {collaborators.length > 0 && (
        <div
          style={{ display: 'flex', gap: 0, cursor: 'pointer' }}
          onClick={onShowUsers}
          title="Show connected users"
        >
          {collaborators.slice(0, 5).map((c) => (
            <span
              key={c.userId}
              style={{
                width: 22, height: 22, borderRadius: '50%',
                background: c.color, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.65rem', fontWeight: 600,
                border: '2px solid #fff', marginLeft: -4,
              }}
              title={c.displayName}
            >
              {c.displayName[0].toUpperCase()}
            </span>
          ))}
          {collaborators.length > 5 && (
            <span
              style={{
                width: 22, height: 22, borderRadius: '50%',
                background: '#888', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.65rem', marginLeft: -4,
              }}
            >
              +{collaborators.length - 5}
            </span>
          )}
        </div>
      )}

      {/* Copy invite link */}
      <span
        onClick={onCopyLink}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
        title="Copy invite link"
      >
        <Link size={14} />
      </span>

      {/* Pending changes badge */}
      {pendingChanges > 0 && (
        <span
          style={{
            background: '#d48b45', color: '#fff',
            padding: '1px 6px', borderRadius: 8,
            fontSize: '0.7rem',
          }}
        >
          {pendingChanges}
        </span>
      )}

      {/* Leave */}
      <span
        onClick={onLeaveSession}
        style={{ cursor: 'pointer', opacity: 0.6, fontSize: '0.75rem' }}
        title="Leave session"
      >
        ✕
      </span>
    </div>
  );
}
