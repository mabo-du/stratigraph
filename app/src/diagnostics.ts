/**
 * diagnostics.ts — Application layer diagnostics and startup checks.
 *
 * exports: checkFullDiskEncryption() -> Promise<boolean>
 * 
 * used_by: App.tsx
 */

import { isTauri } from './utils/tauriBridge';

/**
 * Checks if the OS reports Full Disk Encryption as active.
 * This is a best-effort diagnostic for field security awareness.
 * 
 * Returns true if FDE is active or if we cannot determine (optimistic fallback),
 * Returns false ONLY if we can positively determine FDE is disabled.
 */
export async function checkFullDiskEncryption(): Promise<boolean> {
  if (!isTauri()) {
    // In PWA/browser mode, we rely on the browser's sandbox and IndexedDB.
    // We cannot check OS-level FDE from the browser.
    return true; 
  }

  try {
    await import('@tauri-apps/api/core');
    
    // We would ideally call a custom Tauri command here that queries the OS:
    // Windows: `manage-bde -status` or WMI
    // macOS: `fdesetup status`
    // Linux: check `/etc/crypttab` or `lsblk -o TYPE`
    
    // For Phase 1, since we haven't implemented the native rust side of this diagnostic yet,
    // we return true but this is the hook where the Rust command would be integrated.
    // Example: return await invoke<boolean>('check_fde_status');
    
    return true;
  } catch (e) {
    console.warn("Failed to check FDE status", e);
    return true; // fail open to avoid blocking usage if diagnostic fails
  }
}
