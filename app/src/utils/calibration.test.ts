import { describe, it, expect } from 'vitest';
import { calibrateDate, calibrateSequence } from './calibration';
import type { CurvePoint } from './calibration';

// Minimal test curve: 10 years of data
const TEST_CURVE: CurvePoint[] = [
  { calBP: 2000, c14BP: 2000, error: 20 },
  { calBP: 1990, c14BP: 1995, error: 20 },
  { calBP: 1980, c14BP: 1990, error: 20 },
  { calBP: 1970, c14BP: 1985, error: 20 },
  { calBP: 1960, c14BP: 1980, error: 20 },
  { calBP: 1950, c14BP: 1975, error: 20 },
  { calBP: 1940, c14BP: 1970, error: 20 },
  { calBP: 1930, c14BP: 1965, error: 20 },
  { calBP: 1920, c14BP: 1960, error: 20 },
  { calBP: 1910, c14BP: 1955, error: 20 },
];

describe('Calibration Engine', () => {
  it('produces a calibrated result with density', () => {
    const result = calibrateDate(TEST_CURVE, 1980, 25);
    expect(result.density.length).toBeGreaterThan(0);
    expect(result.median).toBeGreaterThan(1900);
    expect(result.median).toBeLessThan(2010);
    expect(result.mean).toBeGreaterThan(1900);
  });

  it('extracts 2σ HPD ranges', () => {
    const result = calibrateDate(TEST_CURVE, 1980, 25);
    expect(result.range2σ.length).toBeGreaterThanOrEqual(1);
    for (const r of result.range2σ) {
      expect(r.from).toBeGreaterThan(r.to);
    }
  });

  it('extracts 1σ HPD ranges narrower than 2σ', () => {
    const result = calibrateDate(TEST_CURVE, 1980, 25);
    const width1σ = result.range1σ.reduce((s, r) => s + (r.from - r.to), 0);
    const width2σ = result.range2σ.reduce((s, r) => s + (r.from - r.to), 0);
    expect(width1σ).toBeLessThanOrEqual(width2σ);
  });

  it('handles value matching the curve range', () => {
    const result = calibrateDate(TEST_CURVE, 1975, 20);
    expect(result.median).toBeGreaterThan(1900);
    expect(result.median).toBeLessThan(2000);
    expect(result.range1σ.length).toBeGreaterThanOrEqual(1);
  });

  it('handles far-off dates with wide error', () => {
    const result = calibrateDate(TEST_CURVE, 5000, 100);
    expect(result.median).toBe(5000);
    expect(result.range2σ.length).toBeGreaterThanOrEqual(1);
  });

  it('normalizes probability density to sum ~1', () => {
    const result = calibrateDate(TEST_CURVE, 1980, 25);
    const totalProb = result.density.reduce((s, p) => s + p.prob, 0);
    expect(totalProb).toBeCloseTo(1.0, 1);
  });

  it('mean is close to median for symmetric distributions', () => {
    const result = calibrateDate(TEST_CURVE, 1980, 25);
    expect(Math.abs(result.mean - result.median)).toBeLessThan(20);
  });
});

describe('Sequence Calibration', () => {
  // Wider curve for constraint testing
  const SEQ_CURVE: CurvePoint[] = Array.from({ length: 201 }, (_, i) => ({
    calBP: 2100 - i, c14BP: 2100 - i, error: 20,
  }));

  const events = new Map([
    ['event-A', { c14BP: 1950, sigma: 20, contextId: 'young' }],
    ['event-B', { c14BP: 2050, sigma: 20, contextId: 'old' }],
  ]);
  const constraints = [{ older: 'old', younger: 'young' }];
  const contextEvents = new Map([['young', ['event-A']], ['old', ['event-B']]]);

  it('younger event knows it is constrained by older event', () => {
    const results = calibrateSequence(SEQ_CURVE, events, constraints, contextEvents);
    const a = results.get('event-A')!;
    expect(a.constrainedByOlder).toContain('event-B');
  });

  it('older event knows it is constrained by younger event', () => {
    const results = calibrateSequence(SEQ_CURVE, events, constraints, contextEvents);
    const b = results.get('event-B')!;
    expect(b.constrainedByYounger).toContain('event-A');
  });

  it('handles events with no constraints', () => {
    const isolated = new Map([['event-C', { c14BP: 1950, sigma: 20, contextId: 'x' }]]);
    const r = calibrateSequence(SEQ_CURVE, isolated, [], new Map());
    expect(r.get('event-C')!.constrained).toBe(false);
  });

  it('marks which contexts constrain each event', () => {
    const results = calibrateSequence(SEQ_CURVE, events, constraints, contextEvents);
    expect(results.get('event-A')!.constrainedByOlder).toContain('event-B');
    expect(results.get('event-B')!.constrainedByYounger).toContain('event-A');
  });
});
