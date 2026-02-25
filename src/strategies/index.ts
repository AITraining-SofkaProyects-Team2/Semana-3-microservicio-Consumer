/**
 * Strategy Pattern — Priority calculation.
 *
 * Each strategy handles a subset of IncidentTypes and returns
 * the corresponding Priority. PriorityResolver acts as the
 * context that delegates to the correct strategy.
 */
export type { IPriorityStrategy } from './IPriorityStrategy';
export { CriticalServiceStrategy } from './CriticalServiceStrategy';
export { DegradedServiceStrategy } from './DegradedServiceStrategy';
export { MinorIssuesStrategy } from './MinorIssuesStrategy';
export { DefaultPriorityStrategy } from './DefaultPriorityStrategy';
export { PriorityResolver } from './PriorityResolver';
