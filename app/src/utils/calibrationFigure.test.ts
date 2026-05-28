import { describe, it, expect } from 'vitest';
import { generateCalibrationFigureSvg } from './calibrationFigure';
import { calibrateDate } from './calibration';
import type { CurvePoint } from './calibration';

const TEST_CURVE: CurvePoint[] = Array.from({ length: 201 }, (_, i) => ({
  calBP: 2100 - i, c14BP: 2100 - i, error: 20,
}));

describe('Calibration Figure SVG', () => {
  const result = calibrateDate(TEST_CURVE, 1950, 25);

  it('produces valid SVG with expected elements', () => {
    const svg = generateCalibrationFigureSvg('Charcoal Sample', 'Beta-123', 1950, 25, TEST_CURVE, result);

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('Charcoal Sample');
    expect(svg).toContain('Beta-123');
    expect(svg).toContain('1950');
    expect(svg).toContain('25');
  });

  it('includes HPD range indicators', () => {
    const svg = generateCalibrationFigureSvg('Test', 'L-1', 1950, 25, TEST_CURVE, result);

    expect(svg).toContain('95.4%');
    expect(svg).toContain('68.2%');
  });

  it('includes median marker', () => {
    const svg = generateCalibrationFigureSvg('Test', 'L-1', 1950, 25, TEST_CURVE, result);

    expect(svg).toContain('BP');
    expect(svg).toContain('stroke-dasharray');
  });

  it('includes axis label', () => {
    const svg = generateCalibrationFigureSvg('Test', 'L-1', 1950, 25, TEST_CURVE, result);

    expect(svg).toContain('Calibrated date');
  });
});
