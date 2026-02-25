import { IncidentType } from '../types';

const VALID_INCIDENT_TYPES = new Set<string>(Object.values(IncidentType));

/**
 * Runtime type guard for IncidentType (LSP §3.5).
 * Validates that a value is a member of the IncidentType enum
 * without relying on unsafe `as` casts.
 */
export const isIncidentType = (value: unknown): value is IncidentType =>
  typeof value === 'string' && VALID_INCIDENT_TYPES.has(value);
