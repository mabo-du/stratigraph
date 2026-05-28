/**
 * crossMatrixQuery.ts — Load and query multiple .hmatrix.json projects.
 * All processing is client-side; no backend required.
 */

export interface LoadedProject {
  id: string;
  projectName: string;
  siteName: string;
  savedAt: string;
  contexts: any[];
  observations: any[];
  phases: any[];
  events: any[];
  positions: Record<string, any>;
}

export interface DashboardStats {
  totalProjects: number;
  totalContexts: number;
  totalObservations: number;
  totalPhases: number;
  perProject: Array<{
    id: string;
    name: string;
    siteName: string;
    contextCount: number;
    observationCount: number;
    phaseCount: number;
    savedAt: string;
  }>;
  byType: Record<string, number>;
  byPhase: Record<string, number>;
  contextsWithCoords: number;
}

/**
 * Load a project from a File object.
 */
export async function loadProjectFile(file: File): Promise<LoadedProject> {
  const text = await file.text();
  const data = JSON.parse(text);
  return {
    id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    projectName: data.projectName ?? file.name.replace(/\.hmatrix\.json$/, ''), 
    siteName: data.siteName ?? '',
    savedAt: data.savedAt ?? new Date().toISOString(),
    contexts: data.contexts ?? [],
    observations: data.observations ?? [],
    phases: data.phases ?? [],
    events: data.events ?? [],
    positions: data.positions ?? {},
  };
}

/**
 * Compute aggregate statistics across all loaded projects.
 */
export function computeStats(projects: LoadedProject[]): DashboardStats {
  const byType: Record<string, number> = {};
  const byPhase: Record<string, number> = {};
  let totalContexts = 0;
  let totalObservations = 0;
  let contextsWithCoords = 0;

  for (const proj of projects) {
    totalContexts += proj.contexts.length;
    totalObservations += proj.observations.length;

    for (const ctx of proj.contexts) {
      const t = ctx.type || 'unknown';
      byType[t] = (byType[t] || 0) + 1;

      const p = ctx.phase || 'unphased';
      byPhase[p] = (byPhase[p] || 0) + 1;

      if (ctx.spatial?.centroid) contextsWithCoords++;
    }
  }

  return {
    totalProjects: projects.length,
    totalContexts,
    totalObservations,
    totalPhases: projects.reduce((s, p) => s + p.phases.length, 0),
    perProject: projects.map(p => ({
      id: p.id,
      name: p.projectName,
      siteName: p.siteName,
      contextCount: p.contexts.length,
      observationCount: p.observations.length,
      phaseCount: p.phases.length,
      savedAt: p.savedAt,
    })),
    byType,
    byPhase,
    contextsWithCoords,
  };
}

/**
 * Query across all loaded projects for contexts matching a filter.
 */
export function queryContexts(
  projects: LoadedProject[],
  filters: { type?: string; phase?: string; siteName?: string; search?: string },
): Array<{ projectName: string; context: any }> {
  const results: Array<{ projectName: string; context: any }> = [];

  for (const proj of projects) {
    for (const ctx of proj.contexts) {
      if (filters.type && ctx.type !== filters.type) continue;
      if (filters.phase && ctx.phase !== filters.phase) continue;
      if (filters.siteName && proj.siteName !== filters.siteName) continue;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const desc = (ctx.description || '').toLowerCase();
        const id = (ctx.id || '').toLowerCase();
        if (!desc.includes(q) && !id.includes(q)) continue;
      }
      results.push({ projectName: proj.projectName, context: ctx });
    }
  }

  return results;
}

/**
 * Build a combined GeoJSON from all projects with spatial data.
 */
export function buildCombinedGeoJSON(projects: LoadedProject[]): string {
  const features: any[] = [];

  for (const proj of projects) {
    for (const ctx of proj.contexts) {
      const centroid = ctx.spatial?.centroid;
      if (!centroid) continue;

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [centroid.x, centroid.y, centroid.z ?? 0],
        },
        properties: {
          project: proj.projectName,
          site: proj.siteName,
          id: ctx.id,
          type: ctx.type ?? '',
          description: ctx.description ?? '',
          phase: ctx.phase ?? '',
          period: ctx.period ?? '',
        },
      });
    }
  }

  const collection = {
    type: 'FeatureCollection',
    metadata: {
      generatedAt: new Date().toISOString(),
      projects: projects.length,
      totalFeatures: features.length,
    },
    features,
  };

  return JSON.stringify(collection, null, 2);
}
