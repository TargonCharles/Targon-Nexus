// Deterministic ID generator for knowledge-graph entities.
// Generates a stable UUID-v5-style identifier from (entityType, uniqueKey)
// using a SHA-256-based hash so the same (type, key) always produces the
// same ID — essential for idempotent graph updates.

import { createHash } from "node:crypto";
import { generateUUID } from "./uuid";

/**
 * Generate a stable, deterministic ID from an entity type and unique key.
 * Uses SHA-256 to produce a namespace-scoped UUID-like string.
 *
 * @example
 *   generateId('Person', 'Zhi-Xun Shen')  // always returns the same ID
 *   generateId('Source', 'https://example.com/lab')  // idempotent
 */
export function generateId(entityType: string, uniqueKey: string): string {
  const hash = createHash("sha256")
    .update(`${entityType.toLowerCase()}:${uniqueKey.trim().toLowerCase()}`)
    .digest("hex")
    .substring(0, 32);

  // Format as UUID-like: 8-4-4-4-12
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    "4" + hash.substring(13, 16), // version 4 marker
    "8" + hash.substring(17, 20), // variant marker
    hash.substring(20, 32),
  ].join("-");
}

/**
 * Generate a random (non-deterministic) ID. Wraps generateUUID for
 * cases where determinism is not desired.
 */
export function generateRandomId(): string {
  return generateUUID();
}
