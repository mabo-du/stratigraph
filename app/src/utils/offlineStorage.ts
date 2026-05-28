/**
 * offlineStorage.ts — IndexedDB-backed offline project persistence.
 *
 * Saves and loads .hmatrix.json projects in the browser's IndexedDB,
 * enabling offline fieldwork. Complements the file-based save/load
 * in fileUtils.ts for Tauri and browser environments.
 *
 * exports: saveProjectOffline, loadProjectOffline, listSavedProjects,
 *          deleteProjectOffline, getProjectCount
 */

const DB_NAME = 'StratiGraph';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('savedAt', 'savedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface SavedProject {
  id: string;
  name: string;
  siteName: string;
  savedAt: string;
  data: any;
}

/**
 * Save a project to IndexedDB.
 * Returns the project ID.
 */
export async function saveProjectOffline(
  name: string,
  siteName: string,
  data: any,
): Promise<string> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const entry: SavedProject = {
    id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    siteName,
    savedAt: new Date().toISOString(),
    data,
  };

  return new Promise((resolve, reject) => {
    const req = store.add(entry);
    req.onsuccess = () => resolve(entry.id);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Update an existing project in IndexedDB.
 */
export async function updateProjectOffline(
  id: string,
  name: string,
  siteName: string,
  data: any,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const entry: SavedProject = {
    id,
    name,
    siteName,
    savedAt: new Date().toISOString(),
    data,
  };

  return new Promise((resolve, reject) => {
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Load a saved project from IndexedDB by ID.
 */
export async function loadProjectOffline(id: string): Promise<SavedProject | null> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * List all saved projects (metadata only, no full data).
 */
export async function listSavedProjects(): Promise<{ id: string; name: string; siteName: string; savedAt: string }[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const results: { id: string; name: string; siteName: string; savedAt: string }[] = [];
    const req = store.openCursor();

    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const value = cursor.value as SavedProject;
        results.push({ id: value.id, name: value.name, siteName: value.siteName, savedAt: value.savedAt });
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Delete a project from IndexedDB.
 */
export async function deleteProjectOffline(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Get total number of saved projects.
 */
export async function getProjectCount(): Promise<number> {
  const list = await listSavedProjects();
  return list.length;
}
