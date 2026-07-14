// UUID utility tests
import { generateUUID, generateUUIDv4, isValidUUID, normalizeUUID } from '../uuid';

describe('uuid', () => {
  describe('generateUUID / generateUUIDv4', () => {
    it('generates a valid UUID v4 string', () => {
      const uuid = generateUUID();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('generateUUIDv4 is an alias for generateUUID', () => {
      const a = generateUUID();
      const b = generateUUIDv4();
      expect(typeof a).toBe('string');
      expect(typeof b).toBe('string');
      // Both are valid UUIDs but randomly different
      expect(a).not.toBe(b);
    });

    it('generates unique values', () => {
      const set = new Set(Array.from({ length: 100 }, () => generateUUID()));
      expect(set.size).toBe(100);
    });
  });

  describe('isValidUUID', () => {
    it('accepts valid UUID v4', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('rejects non-string', () => {
      expect(isValidUUID(null)).toBe(false);
      expect(isValidUUID(undefined)).toBe(false);
      expect(isValidUUID(123)).toBe(false);
    });

    it('rejects malformed strings', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID('')).toBe(false);
      expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false);
    });

    it('accepts generated UUIDs', () => {
      expect(isValidUUID(generateUUID())).toBe(true);
    });
  });

  describe('normalizeUUID', () => {
    it('lowercases and trims', () => {
      expect(normalizeUUID('  ABCD1234-ABCD-ABCD-ABCD-ABCD1234ABCD  ')).toBe(
        'abcd1234-abcd-abcd-abcd-abcd1234abcd',
      );
    });
  });
});
