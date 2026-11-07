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
  FORBIDDEN: "You do not have permission to do that",
  MESSAGE_NOT_FOUND: "Message not found or you cannot delete it",
  SERVER_ERROR: "Server error",
  NOT_IMPLEMENTED: "This feature is not available yet",
  GAME_NOT_FOUND: "This game is no longer available",
  NOT_YOUR_TURN: "It's not your turn",
  ALREADY_IN_GAME: "Finish or cancel your current game first",
  USER_OFFLINE: "This user is offline",
};
