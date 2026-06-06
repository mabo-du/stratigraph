/**
 * paleoCoastline.ts — Fetches paleo-coastline data from the GPlates Web Service.
 *
 * GPlates Web Service: https://gws.gplates.org/reconstruct/coastlines/
 * Free, no API key required. Returns GeoJSON FeatureCollections of
 * reconstructed coastline polygons for a given time slice (Ma).
 *
 * exports: fetchCoastline(), clearCoastlineCache()
 */

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  data: GeoJSON.FeatureCollection;
  fetched: number;
}

let cache: Record<number, CacheEntry> = {};

/**
 * Fetch paleo-coastline GeoJSON for a given time slice.
 * @param timeKa — time in thousands of years before present (0 = modern, 26 = 26,000 BP)
 * @param model — tectonic plate model (default: ZAHIROVIC2022)
 */
export async function fetchCoastline(
  timeKa: number,
  model = 'ZAHIROVIC2022'
): Promise<GeoJSON.FeatureCollection> {
  // Convert ka to Ma for GPlates API
  const timeMa = timeKa / 1000;

  // Check cache
  const cached = cache[timeKa];
  if (cached && Date.now() - cached.fetched < CACHE_TTL) {
    return cached.data;
  }

  const url = `https://gws.gplates.org/reconstruct/coastlines/?time=${timeMa}&model=${model}`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`GPlates API error: ${res.status}`);
    const data: GeoJSON.FeatureCollection = await res.json();
    cache[timeKa] = { data, fetched: Date.now() };
    return data;
  } catch (err) {
    console.error('Failed to fetch paleo-coastline:', err);
    // Return empty feature collection on error
    return { type: 'FeatureCollection', features: [] };
  }
}

/** Clear the coastline cache to force fresh fetches. */
export function clearCoastlineCache(): void {
  cache = {};
}

/**
 * Check if a GeoJSON point is on land or underwater for a given coastline.
 * Uses a simple ray-casting algorithm.
 */
export function isOnLand(
  point: [number, number],
  coastline: GeoJSON.FeatureCollection
): boolean {
  // A point is on land if it's inside any land polygon feature
  for (const feature of coastline.features) {
    if (feature.geometry.type === 'Polygon') {
      if (pointInPolygon(point, feature.geometry.coordinates[0] as [number, number][])) {
        return true;
      }
    } else if (feature.geometry.type === 'MultiPolygon') {
      for (const polygon of feature.geometry.coordinates) {
        if (pointInPolygon(point, polygon[0] as [number, number][])) {
          return true;
        }
      }
    }
  }
  return false;
}

/** Ray-casting point-in-polygon test */
function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
