import { expect, test, describe } from 'vitest';
import { applyContextMapping, applyObservationMapping } from './csvParser';
import type { ContextMapping, ObservationMapping } from './csvParser';
import { ContextType, RelationshipType } from '../models/hmdp';

describe('csvParser', () => {
  // ── applyContextMapping ──────────────────────────────────────────────────

  describe('applyContextMapping', () => {
    const baseMapping: ContextMapping = {
      idColumn: 'id',
      typeColumn: 'type',
      descriptionColumn: 'desc',
    };

    test('maps basic rows to Context objects', () => {
      const rows = [
        { id: 'SU001', type: 'Positive', desc: 'Topsoil layer' },
        { id: 'SU002', type: 'Negative', desc: 'Pit cut' },
      ];
      const result = applyContextMapping(rows, baseMapping);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'SU001',
        type: ContextType.Positive,
        description: 'Topsoil layer',
      });
      expect(result[1]).toEqual({
        id: 'SU002',
        type: ContextType.Negative,
        description: 'Pit cut',
      });
    });

    test('normalises context types from messy field data', () => {
      const rows = [
        { id: '1', type: 'cut', desc: '' },
        { id: '2', type: 'PIT', desc: '' },
        { id: '3', type: 'layer', desc: '' },
        { id: '4', type: 'FILL', desc: '' },
        { id: '5', type: 'deposit', desc: '' },
        { id: '6', type: 'masonry', desc: '' },
        { id: '7', type: 'interface', desc: '' },
        { id: '8', type: 'something weird', desc: '' },
      ];
      const result = applyContextMapping(rows, baseMapping);
      expect(result[0].type).toBe(ContextType.Negative);     // cut
      expect(result[1].type).toBe(ContextType.Negative);     // PIT
      expect(result[2].type).toBe(ContextType.Positive);     // layer
      expect(result[3].type).toBe(ContextType.Positive);     // FILL
      expect(result[4].type).toBe(ContextType.Positive);     // deposit
      expect(result[5].type).toBe(ContextType.Positive);     // masonry
      expect(result[6].type).toBe(ContextType.Negative);     // interface
      expect(result[7].type).toBe(ContextType.Unknown);      // unrecognised
    });

    test('trims whitespace from IDs', () => {
      const rows = [{ id: '  SU001  ', type: 'Positive', desc: '' }];
      const result = applyContextMapping(rows, baseMapping);
      expect(result[0].id).toBe('SU001');
    });

    test('filters out rows with empty IDs', () => {
      const rows = [
        { id: 'SU001', type: 'Positive', desc: '' },
        { id: '', type: 'Positive', desc: '' },
        { id: '   ', type: 'Positive', desc: '' },
      ];
      const result = applyContextMapping(rows, baseMapping);
      expect(result).toHaveLength(1);
    });

    test('defaults to Unknown type when typeColumn is not mapped', () => {
      const mapping: ContextMapping = { idColumn: 'id' };
      const rows = [{ id: 'SU001' }];
      const result = applyContextMapping(rows, mapping);
      expect(result[0].type).toBe(ContextType.Unknown);
    });
  });

  // ── applyObservationMapping ──────────────────────────────────────────────

  describe('applyObservationMapping', () => {
    test('maps basic rows to Observation objects', () => {
      const mapping: ObservationMapping = {
        sourceColumn: 'above',
        targetColumn: 'below',
        defaultRelationship: RelationshipType.Above,
      };
      const rows = [
        { above: 'SU001', below: 'SU002' },
        { above: 'SU002', below: 'SU003' },
      ];
      const result = applyObservationMapping(rows, mapping);
      expect(result).toHaveLength(2);
      expect(result[0].source).toBe('SU001');
      expect(result[0].target).toBe('SU002');
      expect(result[0].relationshipType).toBe(RelationshipType.Above);
    });

    test('normalises relationship types from messy data', () => {
      const mapping: ObservationMapping = {
        sourceColumn: 'unit_a',
        targetColumn: 'unit_b',
        relationshipColumn: 'rel',
        defaultRelationship: RelationshipType.Above,
      };
      const rows = [
        { unit_a: 'A', unit_b: 'B', rel: 'over' },
        { unit_a: 'C', unit_b: 'D', rel: 'under' },
        { unit_a: 'E', unit_b: 'F', rel: 'same as' },
        { unit_a: 'G', unit_b: 'H', rel: 'bonded' },
        { unit_a: 'I', unit_b: 'J', rel: 'cuts' },
        { unit_a: 'K', unit_b: 'L', rel: 'cut by' },
        { unit_a: 'M', unit_b: 'N', rel: 'unknown_rel' },
      ];
      const result = applyObservationMapping(rows, mapping);
      expect(result[0].relationshipType).toBe(RelationshipType.Above);        // over
      expect(result[1].relationshipType).toBe(RelationshipType.Below);        // under
      expect(result[2].relationshipType).toBe(RelationshipType.Equals);       // same as
      expect(result[3].relationshipType).toBe(RelationshipType.Contemporary); // bonded
      expect(result[4].relationshipType).toBe(RelationshipType.Above);        // cuts
      expect(result[5].relationshipType).toBe(RelationshipType.Below);        // cut by
      expect(result[6].relationshipType).toBe(RelationshipType.Above);        // fallback
    });

    test('filters out rows with missing source or target', () => {
      const mapping: ObservationMapping = {
        sourceColumn: 'from',
        targetColumn: 'to',
      };
      const rows = [
        { from: 'SU001', to: 'SU002' },
        { from: '', to: 'SU003' },
        { from: 'SU004', to: '' },
      ];
      const result = applyObservationMapping(rows, mapping);
      expect(result).toHaveLength(1);
    });

    test('generates unique IDs for each observation', () => {
      const mapping: ObservationMapping = {
        sourceColumn: 'from',
        targetColumn: 'to',
      };
      const rows = [
        { from: 'A', to: 'B' },
        { from: 'C', to: 'D' },
      ];
      const result = applyObservationMapping(rows, mapping);
      expect(result[0].id).toBeTruthy();
      expect(result[1].id).toBeTruthy();
      expect(result[0].id).not.toBe(result[1].id);
    });
  });
});
