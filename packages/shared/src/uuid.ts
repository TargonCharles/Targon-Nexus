// UUID utilities
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';

export type UUID = string;
export type UUIDVersion = 4 | 5;

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const UUID_PATTERN = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

export function generateUUID(): UUID {
  return uuidv4();
}

export function generateUUIDv4(): UUID {
  return uuidv4();
}

export function isValidUUID(value: unknown): value is UUID {
  return typeof value === 'string' && uuidValidate(value);
}

export function normalizeUUID(value: string): UUID {
  return value.toLowerCase().trim();
}
