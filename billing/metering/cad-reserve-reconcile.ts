/**
 * CAD quota reserve / reconcile / release facade.
 *
 * - reserveCadJob: before external CAD POST
 * - reconcileCadReservation: on successful job completion (actual Zoo cost)
 * - releaseCadReservation: job failed before execution (do not consume quota)
 * - *Locked variants: per-user mutex around zooCostAccrued updates
 */
export {
  reserveCadJob,
  reserveCadJobLocked,
  reconcileCadReservation,
  reconcileCadReservationLocked,
  releaseCadReservation,
  releaseCadReservationLocked,
  getCadReservation,
  withUserUsageLock,
  resetMeteringStateForTests,
} from "./usage-meter";
