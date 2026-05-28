/**
 * calibration.ts — In-browser radiocarbon calibration engine.
 *
 * Pure TypeScript implementation of calibration curve interpolation,
 * probability density computation, and HPD interval extraction.
 *
 * exports: loadCurve, calibrateDate, CalibratedResult, CalibratedRange
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
