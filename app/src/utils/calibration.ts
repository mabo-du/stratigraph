/**
 * calibration.ts — In-browser radiocarbon calibration engine.
 *
 * Pure TypeScript implementation of calibration curve interpolation,
 * probability density computation, HPD interval extraction,
 * and stratigraphic sequence calibration (Dye & Buck algorithm).
 *
 * exports: loadCurve, calibrateDate, calibrateSequence,
 *          CalibratedResult, CalibratedRange, ConstrainedResult
 */

// ── Data types ──────────────────────────────────────────────────────────────

/** A single point on the calibration curve. */
export interface CurvePoint {
  calBP: number;
  c14BP: number;
  error: number;
}

/** A calibrated HPD (Highest Posterior Density) interval. */
export interface CalibratedRange {
  from: number;   // cal BP (older)
  to: number;     // cal BP (younger)
}

/** Full calibrated result for one C14 determination. */
export interface CalibratedResult {
  /** Calendar age BP */
  calBP: number;
  /** Median calibrated age */
  median: number;
  /** Mean calibrated age */
  mean: number;
  /** 1σ HPD ranges (~68.2% confidence) */
  range1σ: CalibratedRange[];
  /** 2σ HPD ranges (~95.4% confidence) */
  range2σ: CalibratedRange[];
  /** Full probability density (for plotting) */
  density: { calBP: number; prob: number }[];
}

// ── Curve management ─────────────────────────────────────────────────────────

let _curveCache: CurvePoint[] | null = null;

/**
 * Load the IntCal20 calibration curve.
 * Fetches from the bundled JSON and caches in memory.
 */
export async function loadCurve(): Promise<CurvePoint[]> {
  if (_curveCache) return _curveCache;

  try {
    const resp = await fetch('/curves/intcal20.json');
    const data = await resp.json();
    _curveCache = data.rows.map((r: number[]) => ({
      calBP: r[0],
      c14BP: r[1],
      error: r[2],
    }));
    return _curveCache!;
  } catch (err) {
    throw new Error(`Failed to load calibration curve: ${err}`);
  }
}

/**
 * Clear the curve cache (useful for testing with different curves).
 */
export function clearCurveCache(): void {
  _curveCache = null;
}

// ── Interpolation ───────────────────────────────────────────────────────────

/**
 * Linear interpolation on the calibration curve.
 * Given a calendar year, returns the interpolated C14 age and error.
 */
function interpolateCurve(curve: CurvePoint[], calBP: number): { c14BP: number; error: number } {
  if (calBP <= curve[curve.length - 1].calBP) {
    return { c14BP: curve[curve.length - 1].c14BP, error: curve[curve.length - 1].error };
  }
  if (calBP >= curve[0].calBP) {
    return { c14BP: curve[0].c14BP, error: curve[0].error };
  }

  let lo = 0;
  let hi = curve.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (curve[mid].calBP > calBP) lo = mid;
    else hi = mid;
  }

  const pLo = curve[lo];
  const pHi = curve[hi];
  const t = (calBP - pLo.calBP) / (pHi.calBP - pLo.calBP);

  return {
    c14BP: pLo.c14BP + t * (pHi.c14BP - pLo.c14BP),
    error: pLo.error + t * (pHi.error - pLo.error),
  };
}

// ── Calibration algorithm ───────────────────────────────────────────────────

/**
 * Calibrate a single radiocarbon determination.
 *
 * @param curve - Calibration curve points (must be sorted descending by calBP)
 * @param c14BP - Radiocarbon age in BP
 * @param sigma - Laboratory error (1σ)
 * @param resolution - Step size in cal BP years (default 1)
 * @returns CalibratedResult with PDF, median, mean, and HPD intervals
 */
export function calibrateDate(
  curve: CurvePoint[],
  c14BP: number,
  sigma: number,
  resolution: number = 1,
): CalibratedResult {
  const minCal = Math.max(
    curve[curve.length - 1].calBP,
    Math.min(c14BP - 5 * sigma - 200, curve[0].calBP),
  );
  const maxCal = Math.min(
    curve[0].calBP,
    Math.max(c14BP + 5 * sigma + 200, curve[curve.length - 1].calBP),
  );

  if (minCal >= maxCal) {
    // Date is completely outside the curve range
    return {
      calBP: c14BP,
      median: c14BP,
      mean: c14BP,
      range1σ: [{ from: c14BP + sigma, to: c14BP - sigma }],
      range2σ: [{ from: c14BP + 2 * sigma, to: c14BP - 2 * sigma }],
      density: [{ calBP: c14BP, prob: 1 }],
    };
  }

  // Build the PDF
  const density: { calBP: number; prob: number }[] = [];
  let totalProb = 0;

  for (let cal = Math.round(minCal / resolution) * resolution; cal <= Math.round(maxCal / resolution) * resolution; cal += resolution) {
    const { c14BP: curveAge, error: curveError } = interpolateCurve(curve, cal);
    const combinedSigma = Math.sqrt(sigma * sigma + curveError * curveError);
    const lnProb = -0.5 * Math.pow((c14BP - curveAge) / combinedSigma, 2);
    const prob = Math.exp(lnProb);

    density.push({ calBP: cal, prob });
    totalProb += prob;
  }

  // Normalize
  for (const p of density) {
    p.prob /= totalProb;
  }

  // Mean
  let mean = 0;
  for (const p of density) {
    mean += p.calBP * p.prob;
  }

  // Median and HPD
  const sortedByProb = [...density].sort((a, b) => b.prob - a.prob);
  const sortedByCal = [...density].sort((a, b) => a.calBP - b.calBP);

  const range1σ = extractHpdRanges(sortedByCal, sortedByProb, 0.682);
  const range2σ = extractHpdRanges(sortedByCal, sortedByProb, 0.954);

  // Median: find calBP where CDF crosses 0.5
  let cumsum = 0;
  let median = density[0]?.calBP ?? 0;
  for (const p of density) {
    cumsum += p.prob;
    if (cumsum >= 0.5) {
      median = p.calBP;
      break;
    }
  }

  // CalBP = median
  const calBP = median;

  return { calBP, median, mean, range1σ, range2σ, density };
}

// ── HPD range extraction ────────────────────────────────────────────────────

function extractHpdRanges(
  sortedByCal: { calBP: number; prob: number }[],
  sortedByProb: { calBP: number; prob: number }[],
  confidence: number,
): CalibratedRange[] {
  if (sortedByCal.length === 0) return [];

  // Find the probability threshold
  let cumsum = 0;
  let threshold = 0;
  for (const p of sortedByProb) {
    cumsum += p.prob;
    if (cumsum >= confidence) {
      threshold = p.prob;
      break;
    }
  }

  // Extract contiguous segments above threshold
  const ranges: CalibratedRange[] = [];
  let i = 0;
  while (i < sortedByCal.length) {
    if (sortedByCal[i].prob >= threshold) {
      const from = sortedByCal[i].calBP;
      while (i < sortedByCal.length && sortedByCal[i].prob >= threshold) {
        i++;
      }
      const to = sortedByCal[i - 1].calBP;
      ranges.push({ from: Math.max(from, to), to: Math.min(from, to) });
    } else {
      i++;
    }
  }

  return ranges;
}

// ── Sequence calibration (Dye & Buck stratigraphic constraints) ────────────

/**
 * A calibrated result with optional stratigraphic constraint info.
 */
export interface ConstrainedResult extends CalibratedResult {
  /** Unconstrained result for comparison */
  unconstrained: CalibratedResult;
  /** Whether stratigraphic constraints were applied */
  constrained: boolean;
  /** IDs of younger contexts that constrain this one */
  constrainedByYounger: string[];
  /** IDs of older contexts that constrain this one */
  constrainedByOlder: string[];
}

/**
 * Calibrate multiple C14 events with stratigraphic constraints.
 *
 * Implements the Dye & Buck algorithm: stratigraphic relationships
 * (younger context above older context) act as Bayesian priors,
 * truncating probability densities where they violate superposition.
 *
 * @param curve - Calibration curve
 * @param events - Map of eventId → { c14BP, sigma, contextId }
 * @param constraints - Array of { older: contextId, younger: contextId }
 * @param contextEvents - Map of contextId → eventId[]
 * @returns Map of eventId → ConstrainedResult
 */
export function calibrateSequence(
  curve: CurvePoint[],
  events: Map<string, { c14BP: number; sigma: number; contextId: string }>,
  constraints: { older: string; younger: string }[],
  contextEvents: Map<string, string[]>,
): Map<string, ConstrainedResult> {
  const results = new Map<string, ConstrainedResult>();

  // Phase 1: Calculate unconstrained PDFs for all events
  const unconstrained = new Map<string, CalibratedResult>();
  for (const [eventId, ev] of events) {
    unconstrained.set(eventId, calibrateDate(curve, ev.c14BP, ev.sigma));
  }

  // Phase 2: Apply constraints iteratively until convergence
  // Build a graph of context constraints: contextId → { older: contextId[], younger: contextId[] }
  const constraintGraph = new Map<string, { older: Set<string>; younger: Set<string> }>();
  for (const { older, younger } of constraints) {
    if (!constraintGraph.has(older)) constraintGraph.set(older, { older: new Set(), younger: new Set() });
    if (!constraintGraph.has(younger)) constraintGraph.set(younger, { older: new Set(), younger: new Set() });
    constraintGraph.get(younger)!.older.add(older);
    constraintGraph.get(older)!.younger.add(younger);
  }

  // Phase 3: For each event, apply constraints from older/younger neighbors
  for (const [eventId, ev] of events) {
    const ucResult = unconstrained.get(eventId)!;
    const ctxId = ev.contextId;
    const ctxConstraints = constraintGraph.get(ctxId);

    const constrainedByYounger: string[] = [];
    const constrainedByOlder: string[] = [];

    if (!ctxConstraints || (!ctxConstraints.older.size && !ctxConstraints.younger.size)) {
      // No constraints — return unconstrained
      results.set(eventId, {
        ...ucResult,
        unconstrained: ucResult,
        constrained: false,
        constrainedByYounger: [],
        constrainedByOlder: [],
      });
      continue;
    }

    // Find the most constraining older and younger boundaries
    let oldestBoundary = 0;       // cal BP — younger must be BELOW this (lower cal BP = older)
    let youngestBoundary = 50000; // cal BP — older must be ABOVE this

    for (const olderCtxId of ctxConstraints.older) {
      const olderEvents = contextEvents.get(olderCtxId) || [];
      for (const oeId of olderEvents) {
        const oeResult = unconstrained.get(oeId);
        if (!oeResult) continue;
        // Older context's 2σ earliest is the boundary: younger must be <= this
        for (const r of oeResult.range2σ) {
          if (r.from > oldestBoundary) oldestBoundary = r.from;
        }
        constrainedByOlder.push(oeId);
      }
    }

    for (const youngerCtxId of ctxConstraints.younger) {
      const youngerEvents = contextEvents.get(youngerCtxId) || [];
      for (const yeId of youngerEvents) {
        const yeResult = unconstrained.get(yeId);
        if (!yeResult) continue;
        // Younger context's 2σ latest is the boundary: older must be >= this
        for (const r of yeResult.range2σ) {
          if (r.to < youngestBoundary) youngestBoundary = r.to;
        }
        constrainedByYounger.push(yeId);
      }
    }

    // Apply truncation to the PDF
    const constrainedDensity = ucResult.density.filter(p =>
      p.calBP <= oldestBoundary && p.calBP >= youngestBoundary
    );

    if (constrainedDensity.length === 0) {
      // Constraint too tight — return unconstrained as fallback
      results.set(eventId, {
        ...ucResult,
        unconstrained: ucResult,
        constrained: false,
        constrainedByYounger,
        constrainedByOlder,
      });
      continue;
    }

    // Renormalize
    const totalProb = constrainedDensity.reduce((s, p) => s + p.prob, 0);
    for (const p of constrainedDensity) p.prob /= totalProb;

    // Recompute statistics on constrained density
    const byProb = [...constrainedDensity].sort((a, b) => b.prob - a.prob);
    const byCal = [...constrainedDensity].sort((a, b) => a.calBP - b.calBP);

    const cRange1σ = extractHpdRanges(byCal, byProb, 0.682);
    const cRange2σ = extractHpdRanges(byCal, byProb, 0.954);

    let cMean = 0;
    for (const p of constrainedDensity) cMean += p.calBP * p.prob;

    let cCumsum = 0;
    let cMedian = constrainedDensity[0]?.calBP ?? 0;
    for (const p of constrainedDensity) {
      cCumsum += p.prob;
      if (cCumsum >= 0.5) { cMedian = p.calBP; break; }
    }

    results.set(eventId, {
      calBP: cMedian,
      median: cMedian,
      mean: cMean,
      range1σ: cRange1σ,
      range2σ: cRange2σ,
      density: constrainedDensity,
      unconstrained: ucResult,
      constrained: true,
      constrainedByYounger,
      constrainedByOlder,
    });
  }

  return results;
}
