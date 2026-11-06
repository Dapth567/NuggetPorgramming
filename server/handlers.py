from collections.abc import Callable
from typing import Any

from common import protocol
from server.connection import ClientConnection

Data = dict[str, Any]
Response = dict[str, Any]


def error(message: str) -> Response:
    return {"ok": False, "error": message}


def not_implemented(requirement: str) -> Response:
    return error(f"{requirement} is not implemented yet")


def handle_login(conn: ClientConnection, data: Data) -> Response:
    # TODO(R3): reject a name that is already in state.users.
    # TODO(R4): broadcast USERS_LIST after login and on disconnect.
    return not_implemented("R3")


def handle_dm_send(conn: ClientConnection, data: Data) -> Response:
    # TODO(R5, R7): send MESSAGE_NEW to the sender and receiver only.
    return not_implemented("R7")


def handle_group_create(conn: ClientConnection, data: Data) -> Response:
    # TODO(R8, R9): the creator is the only initial member; broadcast GROUPS_LIST.
    return not_implemented("R8")


def handle_group_join(conn: ClientConnection, data: Data) -> Response:
    # TODO(R10): only the requesting client joins; nobody can add another client.
    return not_implemented("R10")


def handle_group_send(conn: ClientConnection, data: Data) -> Response:
    # TODO(R5, R11): check membership, then send MESSAGE_NEW to group members only.
    return not_implemented("R11")


HANDLERS: dict[str, Callable[[ClientConnection, Data], Response]] = {
    protocol.LOGIN: handle_login,
    protocol.DM_SEND: handle_dm_send,
    protocol.GROUP_CREATE: handle_group_create,
    protocol.GROUP_JOIN: handle_group_join,
    protocol.GROUP_SEND: handle_group_send,
}


def dispatch(conn: ClientConnection, packet: dict[str, Any]) -> None:
    packet_type = packet.get("type")
    handler = HANDLERS.get(packet_type)
    if handler is None:
        response = error(f"unknown packet type: {packet_type}")
    else:
        response = handler(conn, packet.get("data", {}))

    conn.send({"type": protocol.RESPONSE, "id": packet.get("id"), **response})
