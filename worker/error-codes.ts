// Maps collector and probe errors to fixed diagnostic codes so raw Playwright or SDK exceptions
// (which can include form input values such as portal credentials) are never written to logs or shared in alerts.
import { SessionExpired } from "./adapter";
import { LoginBlocked, LoginFailed } from "./portal-login";

const KNOWN_ERROR_CODES = new Set([
  "UNTRUSTED_SOURCE_URL",
  "HYWEP_SCHEDULES_INVALID",
  "CURRENT_SCHEDULE_NOT_FOUND",
  "SCHEDULE_PARAM_MISSING",
  "LIST_STRUCTURE_CHANGED",
  "LIST_NOT_CONFIRMED_EMPTY",
  "DETAIL_LABEL_VALUE_MISMATCH",
  "DETAIL_DUPLICATE_LABEL",
  "DETAIL_STRUCTURE_CHANGED",
  "DETAIL_REQUIRED_FIELDS_MISSING",
  "SOURCE_ID_NOT_FOUND",
  "SOURCE_ID_INVALID",
  "TEMPLATE_VALUE_MISSING",
  "ATTACHMENT_LINK_CHANGED",
  "ATTACHMENT_TOO_LARGE",
  "ATTACHMENT_UNREADABLE",
  "COLLECTOR_LEASE_LOST",
  "PAGINATION_LOOP",
  "LIST_EMPTY",
  "INVALID_ATTACHMENT_ARG",
]);

const ATTACHMENT_HTTP_CODE = /^ATTACHMENT_HTTP_\d{3}$/;

/**
 * Returns a fixed code for known collector errors, or `fallback` for anything else.
 * Never returns arbitrary exception messages or stack traces.
 */
export function safeCollectorErrorCode(error: unknown, fallback = "COLLECTION_FAILED"): string {
  if (error instanceof LoginBlocked) return "LOGIN_BLOCKED";
  if (error instanceof LoginFailed) return `LOGIN_FAILED:${error.reason}`;
  if (error instanceof SessionExpired) return "SESSION_EXPIRED";
  if (error instanceof Error) {
    const message = error.message;
    if (KNOWN_ERROR_CODES.has(message) || ATTACHMENT_HTTP_CODE.test(message)) return message;
    if (message.startsWith("ATTACHMENT_NOT_PDF")) return "ATTACHMENT_NOT_PDF";
    if (message.startsWith("SELECTORS_NOT_VERIFIED")) return "SELECTORS_NOT_VERIFIED";
  }
  return fallback;
}
