interface Collaborator {
  userId: string;
  displayName: string;
  color: string;
  activity?: string;
}

interface AwarenessPanelProps {
  open: boolean;
  collaborators: Collaborator[];
  onClose: () => void;
}

export function AwarenessPanel({ open, collaborators, onClose }: AwarenessPanelProps) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'absolute', top: 44, right: 0,
        width: 260, background: '#fff', borderRadius: 8,
        border: '1px solid #e0e0e0', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        zIndex: 500, padding: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
          Connected ({collaborators.length})
        </span>
        <span
          onClick={onClose}
          style={{ cursor: 'pointer', opacity: 0.5, fontSize: '0.85rem' }}
        >
          ✕
        </span>
      </div>

      {collaborators.map((c) => (
        <div
          key={c.userId}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 0', borderBottom: '1px solid #f0f0f0',
          }}
        >
          <span
            style={{
              width: 24, height: 24, borderRadius: '50%',
              background: c.color, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.7rem', fontWeight: 600, flexShrink: 0,
            }}
          >
            {c.displayName[0].toUpperCase()}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: '0.85rem', fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {c.displayName}
            </div>
            {c.activity && (
              <div style={{ fontSize: '0.75rem', color: '#888' }}>{c.activity}</div>
            )}
          </div>
        </div>
      ))}

      {collaborators.length === 0 && (
        <div style={{ fontSize: '0.8rem', color: '#888', padding: '12px 0', textAlign: 'center' }}>
          No other users connected
        </div>
      )}
    </div>
  );
}
