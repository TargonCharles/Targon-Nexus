import { describe, it, expect } from 'vitest';
import { paginate } from '../pagination';

describe('paginate', () => {
  it('returns defaults when no opts provided', () => {
    const result = paginate();
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.skip).toBe(0);
    expect(result.limit).toBe(20);
  });

  it('respects custom page and pageSize', () => {
    const result = paginate({ page: 3, pageSize: 10 });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(10);
    expect(result.skip).toBe(20);
    expect(result.limit).toBe(10);
  });

  it('clamps page to minimum 1', () => {
    const result = paginate({ page: 0, pageSize: 10 });
    expect(result.page).toBe(1);
    expect(result.skip).toBe(0);
  });

  it('clamps pageSize to minimum 1', () => {
    const result = paginate({ pageSize: 0 });
    expect(result.pageSize).toBe(1);
  });

  it('clamps pageSize to custom max', () => {
    const result = paginate({ pageSize: 500 }, 50);
    expect(result.pageSize).toBe(50);
  });

  it('clamps pageSize to default max of 100', () => {
    const result = paginate({ pageSize: 500 });
    expect(result.pageSize).toBe(100);
  });

  it('handles undefined opts gracefully', () => {
    const result = paginate(undefined);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });
});
