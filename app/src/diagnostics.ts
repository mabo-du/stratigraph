/**
 * diagnostics.ts — Application layer diagnostics and startup checks.
 *
 * exports: checkFullDiskEncryption() -> Promise<boolean>
 * 
 * used_by: App.tsx
 *
 * TODO(t129): Implement native Rust side of FDE check via Tauri command.
 * When implemented, replace the stub return in the Tauri branch with:
 *   return await invoke<boolean>('check_fde_status');
 */

import { isTauri } from './utils/tauriBridge';

/**
 * Checks if the OS reports Full Disk Encryption as active.
 * This is a best-effort diagnostic for field security awareness.
 * 
 * Returns true if FDE is active or if we cannot determine (optimistic fallback),
 * Returns false ONLY if we can positively determine FDE is disabled.
 *
 * === STUB STATUS ===
 * The native Rust command (check_fde_status) is not yet implemented.
 * This function currently always returns true for both browser and Tauri.
 * See TODO(t129) above.
 */
export async function checkFullDiskEncryption(): Promise<boolean> {
  if (!isTauri()) {
    // In PWA/browser mode, we rely on the browser's sandbox and IndexedDB.
    // We cannot check OS-level FDE from the browser.
    return true; 
  }

  try {
    await import('@tauri-apps/api/core');
    
    // STUB: Native Rust command check_fde_status not yet implemented.
    // Queries per platform when implemented:
    //   Windows: manage-bde -status or WMI
    //   macOS: fdesetup status
    //   Linux: check /etc/crypttab or lsblk -o TYPE
    
    return true;
  } catch (e) {
    console.warn("Failed to check FDE status", e);
    return true; // fail open to avoid blocking usage if diagnostic fails
  }
}
