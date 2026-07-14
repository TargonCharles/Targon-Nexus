// ---------------------------------------------------------------------------
// Shared pagination helper — used by entity services to compute skip/limit
// and clamp page/pageSize to safe bounds.
// ---------------------------------------------------------------------------

export interface PaginationOpts {
  page?: number;
  pageSize?: number;
}

export interface PaginationResult {
  page: number;
  pageSize: number;
  skip: number;
  limit: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Compute safe pagination parameters from optional user input.
 *
 * Rules:
 *  - page is clamped to ≥1
 *  - pageSize is clamped to [1, maxPageSize] (default: 100)
 *  - skip = (page - 1) × pageSize
 */
export function paginate(
  opts: PaginationOpts = {},
  maxPageSize: number = MAX_PAGE_SIZE,
): PaginationResult {
  const page = Math.max(1, opts.page ?? DEFAULT_PAGE);
  const pageSize = Math.min(maxPageSize, Math.max(1, opts.pageSize ?? DEFAULT_PAGE_SIZE));
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip, limit: pageSize };
}
