import { groupRoomId, type GroupInfo } from "@chat/shared";
import { XoBadge } from "./XoGame";

/** Every group with its member names, including groups `me` has not joined (R9). */
export function GroupList({
  groups,
  me,
  activeId,
  invites,
  onOpen,
}: {
  groups: GroupInfo[];
  me: string;
  activeId?: string;
  /** Room ids with a game invite waiting for `me`. */
  invites?: Set<string>;
  onOpen: (groupId: string) => void;
}) {
  return (
    <>
      {groups.map((g) => {
        const members = g.members.map((m) => (m === me ? `${m} (you)` : m)).join(", ");
        return (
          <button
            key={g.id}
            className={g.id === activeId ? "item active" : "item"}
            onClick={() => onOpen(g.id)}
          >
            {/* Only phrasing content such as <span> is valid inside a <button>. */}
            <span className="avatar group">{g.name.slice(0, 1).toUpperCase()}</span>
            <span className="item-name">
              {g.name}
              <span className="sub" style={{ display: "block" }} title={members}>
                {members}
              </span>
            </span>
            {invites?.has(groupRoomId(g.id)) && <XoBadge />}
            <span className="count">{g.members.length}</span>
          </button>
        );
      })}
    </>
  );
}
