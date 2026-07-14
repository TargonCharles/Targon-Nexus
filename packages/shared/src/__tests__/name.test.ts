// Name normalization tests
import {
  normalizeChineseName,
  normalizeEnglishName,
  nameFingerprint,
  matchAlias,
  fuzzyMatchName,
  toPinyin,
  toPinyinArray,
} from '../name';

describe('name normalization', () => {
  describe('normalizeChineseName', () => {
    it('removes whitespace', () => {
      expect(normalizeChineseName('周 兴 江')).toBe('周兴江');
      expect(normalizeChineseName('  张三  ')).toBe('张三');
    });
  });

  describe('normalizeEnglishName', () => {
    it('collapses multiple spaces', () => {
      expect(normalizeEnglishName('Zhi-Xun   Shen')).toBe('Zhi-Xun Shen');
    });

    it('lowercases when option set', () => {
      expect(normalizeEnglishName('Zhi-Xun Shen', { lowercase: true })).toBe('zhi-xun shen');
    });

    it('trims whitespace', () => {
      expect(normalizeEnglishName('  Andrea Damascelli  ')).toBe('Andrea Damascelli');
    });
  });

  describe('nameFingerprint', () => {
    it('strips non-alpha and lowercases', () => {
      expect(nameFingerprint('Zhi-Xun Shen')).toBe('zhixunshen');
      expect(nameFingerprint("O'Brien")).toBe('obrien');
    });
  });

  describe('matchAlias', () => {
    it('exact fingerprint match', () => {
      const result = matchAlias('Zhi-Xun Shen', 'Zhixun Shen');
      expect(result.matched).toBe(true);
      expect(result.score).toBe(1.0);
    });

    it('fuzzy match on similar names', () => {
      const result = matchAlias('Zhixun Shen', 'Zhi Xun Shen');
      // fingerprints: 'zhixunshen' vs 'zhixunshen' — identical after normalization
      expect(result.matched).toBe(true);
    });

    it('rejects clearly different names', () => {
      const result = matchAlias('Andrea Damascelli', 'Zhi-Xun Shen');
      expect(result.matched).toBe(false);
    });
  });

  describe('fuzzyMatchName', () => {
    it('returns 1.0 for identical names', () => {
      expect(fuzzyMatchName('Zhi-Xun Shen', 'Zhi-Xun Shen')).toBeCloseTo(1.0);
    });

    it('returns 0 for completely different names', () => {
      expect(fuzzyMatchName('Alice', 'Bob')).toBeLessThan(0.5);
    });
  });
});

describe('pinyin', () => {
  describe('toPinyin', () => {
    it('passes through non-Chinese text', () => {
      expect(toPinyin('John Smith')).toBe('John Smith');
    });

    it('handles common Chinese surname using fallback', () => {
      const result = toPinyin('张');
      expect(result).toBe('zhang');
    });
  });

  describe('toPinyinArray', () => {
    it('returns array for non-Chinese', () => {
      expect(toPinyinArray('John')).toEqual(['John']);
    });
  });
});
