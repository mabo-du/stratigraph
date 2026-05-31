/**
 * tauriBridge.ts — Tauri desktop integration utilities.
 *
 * Provides native file dialog access when running inside a Tauri WebView,
 * with graceful fallback to browser APIs when running in a regular browser.
 *
 * exports: isTauri, openFileDialog, saveFileDialog, readFile, writeFile
 */

let _tauriInitialized = false;
let _isTauri = false;
let _tauriDialog: typeof import('@tauri-apps/plugin-dialog') | null = null;
let _tauriFs: typeof import('@tauri-apps/plugin-fs') | null = null;

async function initTauri() {
  if (_tauriInitialized) return;
  _tauriInitialized = true;

  try {
    // Check if we're in a Tauri environment by trying to import the Tauri API
    // This will throw if we're in a regular browser
    await import('@tauri-apps/api/core');
    _isTauri = true;

    // Import Tauri plugins
    _tauriDialog = await import('@tauri-apps/plugin-dialog');
    _tauriFs = await import('@tauri-apps/plugin-fs');
  } catch {
    // Not running in Tauri — use browser fallbacks
    _isTauri = false;
  }
}

/** Returns true if the app is running inside a Tauri WebView */
export function isTauri(): boolean {
  return _isTauri;
}

/**
 * Open a native file open dialog.
 * Falls back to a hidden <input> element in the browser.
 */
export async function openFileDialog(
  options: { filters?: { name: string; extensions: string[] }[]; multiple?: boolean; asBinary?: boolean } = {}
): Promise<File[] | null> {
  await initTauri();

  if (_isTauri && _tauriDialog) {
    try {
      const selected = await _tauriDialog.open({
        multiple: options.multiple ?? false,
        filters: options.filters?.map(f => ({
          name: f.name,
          extensions: f.extensions,
        })),
      });
      if (!selected) return null;

      const paths = Array.isArray(selected) ? selected : [selected];
      const files: File[] = [];

      for (const path of paths) {
        if (typeof path === 'string' && _tauriFs) {
          const name = path.split(/[/\\]/).pop() || 'file';
          if (options.asBinary) {
            const bytes = await _tauriFs.readFile(path);
            files.push(new File([bytes], name, { type: 'application/octet-stream' }));
          } else {
            const contents = await _tauriFs.readTextFile(path);
            files.push(new File([contents], name, { type: 'text/plain' }));
          }
        }
      }

      return files.length > 0 ? files : null;
    } catch {
      // Fall through to browser fallback
    }
  }

  // Browser fallback: hidden file input
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options.multiple) input.multiple = true;
    if (options.filters) {
      input.accept = options.filters
        .flatMap(f => f.extensions.map(e => `.${e}`))
        .join(',');
    }
    input.onchange = () => {
      if (input.files && input.files.length > 0) {
        resolve(Array.from(input.files));
      } else {
        resolve(null);
      }
    };
    input.click();
  });
}

/**
 * Open a native save dialog and write content to a file.
 * Falls back to a browser download in non-Tauri environments.
 */
export async function saveFileDialog(
  content: string | Uint8Array,
  options: { defaultName?: string; filters?: { name: string; extensions: string[] }[]; asBinary?: boolean } = {}
): Promise<boolean> {
  await initTauri();

  if (_isTauri && _tauriDialog && _tauriFs) {
    try {
      const path = await _tauriDialog.save({
        defaultPath: options.defaultName,
        filters: options.filters?.map(f => ({
          name: f.name,
          extensions: f.extensions,
        })),
      });
      if (!path) return false;

      if (options.asBinary && content instanceof Uint8Array) {
        await _tauriFs.writeFile(path, content);
      } else {
        await _tauriFs.writeTextFile(path, content as string);
      }
      return true;
    } catch {
      // Fall through to browser fallback
    }
  }

  // Browser fallback: Blob download
  const mimeTypes: Record<string, string> = {
    'json': 'application/json',
    'geojson': 'application/geo+json',
    'svg': 'image/svg+xml',
    'png': 'image/png',
    'pdf': 'application/pdf',
    'oxcal': 'text/plain',
    'md': 'text/markdown',
    'txt': 'text/plain',
  };

  const ext = options.defaultName?.split('.').pop() || 'json';
  const mime = mimeTypes[ext] || 'application/octet-stream';
  const blob = new Blob([content as any], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = options.defaultName || `export.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

/**
 * Read a file's text content using native dialog.
 * Browser fallback uses file input.
 */
export async function readFile(asBinary: boolean = false): Promise<{ name: string; content: string | Uint8Array } | null> {
  const files = await openFileDialog({ multiple: false, asBinary });
  if (!files || files.length === 0) return null;
  const file = files[0];
  if (asBinary) {
    const buffer = await file.arrayBuffer();
    return { name: file.name, content: new Uint8Array(buffer) };
  }
  return { name: file.name, content: await file.text() };
}
