/**
 * Thin chat metering facade — idempotent token + modelUsage updates.
 */
export {
  recordChatUsage,
  resetMeteringStateForTests,
} from "./usage-meter";
