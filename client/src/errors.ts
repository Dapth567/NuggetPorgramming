import type { ErrorCode } from "@chat/shared";

export const ERROR_TEXT: Record<ErrorCode, string> = {
  INVALID_INPUT: "Invalid input",
  NOT_LOGGED_IN: "You are not logged in",
  NAME_TAKEN: "This name is already taken",
  WRONG_CREDENTIALS: "Wrong username or password",
  ALREADY_ONLINE: "This account is already online",
  USER_NOT_FOUND: "User not found",
  GROUP_NOT_FOUND: "Group not found",
  NOT_A_MEMBER: "You are not a member of this group",
  ALREADY_A_MEMBER: "You are already a member of this group",
  SERVER_ERROR: "Server error",
  NOT_IMPLEMENTED: "This feature is not available yet",
};
