import { useSyncContext } from './SyncProvider';

/**
 * Hook to access the list of currently connected users (awareness).
 * Returns the same user list as the context, but is more ergonomic
 * for components that only need awareness, not the full room.
 */
export function useAwareness() {
  const { users } = useSyncContext();
  return users;
}
