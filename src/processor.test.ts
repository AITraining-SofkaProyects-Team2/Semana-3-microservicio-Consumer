import { describe, it, expect } from 'vitest';
import { determinePriority, determineStatus } from './processor';
import { IncidentType, Priority, IncidentStatus } from './types';

/**
 * Tests de criterios de aceptación - Worker de Priorización
 * Reglas según Contexto del Sistema:
 * incidentType            → priority
 * NO_SERVICE              → HIGH
 * INTERMITTENT_SERVICE    → MEDIUM
 * SLOW_CONNECTION         → MEDIUM
 * ROUTER_ISSUE            → LOW
 * BILLING_QUESTION        → LOW
 * OTHER                   → PENDING
 *
 * determineStatus: PENDING → RECEIVED, otros → IN_PROGRESS
 */
describe('Worker - Processor (Priorización)', () => {
  describe('determinePriority', () => {
    it('asigna HIGH cuando incidentType es NO_SERVICE', () => {
      expect(determinePriority(IncidentType.NO_SERVICE)).toBe(Priority.HIGH);
    });

    it('asigna MEDIUM cuando incidentType es INTERMITTENT_SERVICE', () => {
      expect(determinePriority(IncidentType.INTERMITTENT_SERVICE)).toBe(Priority.MEDIUM);
    });

    it('asigna MEDIUM cuando incidentType es SLOW_CONNECTION', () => {
      expect(determinePriority(IncidentType.SLOW_CONNECTION)).toBe(Priority.MEDIUM);
    });

    it('asigna LOW cuando incidentType es ROUTER_ISSUE', () => {
      expect(determinePriority(IncidentType.ROUTER_ISSUE)).toBe(Priority.LOW);
    });

    it('asigna LOW cuando incidentType es BILLING_QUESTION', () => {
      expect(determinePriority(IncidentType.BILLING_QUESTION)).toBe(Priority.LOW);
    });

    it('NO prioriza OTHER: mantiene PENDING', () => {
      expect(determinePriority(IncidentType.OTHER)).toBe(Priority.PENDING);
    });

    it('para tipo desconocido devuelve PENDING (default)', () => {
      expect(determinePriority('UNKNOWN' as IncidentType)).toBe(Priority.PENDING);
    });
  });

  describe('determineStatus', () => {
    it('cambia status a IN_PROGRESS solo cuando la prioridad fue asignada (no PENDING)', () => {
      expect(determineStatus(Priority.HIGH)).toBe(IncidentStatus.IN_PROGRESS);
      expect(determineStatus(Priority.MEDIUM)).toBe(IncidentStatus.IN_PROGRESS);
      expect(determineStatus(Priority.LOW)).toBe(IncidentStatus.IN_PROGRESS);
    });

    it('mantiene RECEIVED cuando priority es PENDING', () => {
      expect(determineStatus(Priority.PENDING)).toBe(IncidentStatus.RECEIVED);
    });
  });

  describe('Integración reglas de prioridad según tabla', () => {
    const expectedMapping: Array<{ incidentType: IncidentType; expectedPriority: Priority }> = [
      { incidentType: IncidentType.NO_SERVICE, expectedPriority: Priority.HIGH },
      { incidentType: IncidentType.INTERMITTENT_SERVICE, expectedPriority: Priority.MEDIUM },
      { incidentType: IncidentType.SLOW_CONNECTION, expectedPriority: Priority.MEDIUM },
      { incidentType: IncidentType.ROUTER_ISSUE, expectedPriority: Priority.LOW },
      { incidentType: IncidentType.BILLING_QUESTION, expectedPriority: Priority.LOW },
      { incidentType: IncidentType.OTHER, expectedPriority: Priority.PENDING },
    ];

    it.each(expectedMapping)(
      '$incidentType → $expectedPriority',
      ({ incidentType, expectedPriority }) => {
        const priority = determinePriority(incidentType);
        expect(priority).toBe(expectedPriority);

        const status = determineStatus(priority);
        if (expectedPriority === Priority.PENDING) {
          expect(status).toBe(IncidentStatus.RECEIVED);
        } else {
          expect(status).toBe(IncidentStatus.IN_PROGRESS);
        }
      }
    );
  });
});
