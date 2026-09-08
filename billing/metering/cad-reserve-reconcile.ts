/**
 * CAD quota reserve / reconcile / release facade.
 *
 * - reserveCadJob: before external CAD POST
 * - reconcileCadReservation: on successful job completion (actual Zoo cost)
 * - releaseCadReservation: job failed before execution (do not consume quota)
 */
export {
  reserveCadJob,
  reconcileCadReservation,
  releaseCadReservation,
  getCadReservation,
  resetMeteringStateForTests,
} from "./usage-meter";
