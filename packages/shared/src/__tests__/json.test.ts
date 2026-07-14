import { describe, it, expect } from 'vitest';
import { extractJsonArray } from '../json';

describe('extractJsonArray', () => {
  it('parses a plain JSON array', () => {
    expect(extractJsonArray('[{"name":"test"}]')).toEqual([{ name: 'test' }]);
  });

  it('strips markdown code fences', () => {
    expect(extractJsonArray('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
  });

  it('strips markdown fences without language tag', () => {
    expect(extractJsonArray('```\n[1,2,3]\n```')).toEqual([1, 2, 3]);
  });

  it('handles leading/trailing text', () => {
    expect(extractJsonArray('Here is the result: [{"x":1}] thanks!')).toEqual([{ x: 1 }]);
  });

  it('returns null for empty input', () => {
    expect(extractJsonArray('')).toBeNull();
    expect(extractJsonArray(null as any)).toBeNull();
  });

  it('returns null when no brackets found', () => {
    expect(extractJsonArray('hello world')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(extractJsonArray('[not valid json')).toBeNull();
  });

  it('handles nested arrays', () => {
    expect(extractJsonArray('[[1,2],[3,4]]')).toEqual([[1, 2], [3, 4]]);
  });

  it('returns null for JSON objects (not arrays)', () => {
    expect(extractJsonArray('{"key": "value"}')).toBeNull();
  });
});
