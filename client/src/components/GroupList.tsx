import type { GroupInfo } from "@chat/shared";

/** Every group with its member names, including groups `me` has not joined (R9). */
export function GroupList({
  groups,
  me,
  activeId,
  onOpen,
}: {
  groups: GroupInfo[];
  me: string;
  activeId?: string;
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
            <div className="avatar group">{g.name.slice(0, 1).toUpperCase()}</div>
            <div className="item-name">
              {g.name}
              <div className="sub" title={members}>
                {members}
              </div>
            </div>
            <span className="count">{g.members.length}</span>
          </button>
        );
      })}
    </>
  );
}
