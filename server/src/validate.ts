import { LIMITS, NAME_PATTERN, type Ack } from "@chat/shared";
import type { ChatSocket } from "./types.js";

export const INVALID_INPUT: Ack<never> = { ok: false, error: "INVALID_INPUT" };
export const NOT_LOGGED_IN: Ack<never> = { ok: false, error: "NOT_LOGGED_IN" };

export function isValidName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= LIMITS.nameMaxLength &&
    NAME_PATTERN.test(value)
  );
}

export function isValidPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= LIMITS.passwordMinLength;
}

export function isValidGroupName(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= LIMITS.groupNameMaxLength;
}

export function isValidText(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= LIMITS.textMaxLength
  );
}

/** The logged-in name, or `null` when the handler must answer NOT_LOGGED_IN. */
export function requireLogin(socket: ChatSocket): string | null {
  return socket.data.name ?? null;
}

/** Payloads come from the network, so treat them as untrusted until checked. */
export function asRecord(payload: unknown): Record<string, unknown> {
  return typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
}
