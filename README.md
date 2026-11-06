# Socket Chat

แอปแชตแบบ LINE สำหรับ Term Project วิชา Computer Network มีทั้ง direct message และ group chat
เขียนด้วย Python และใช้ `socket` บน TCP โดยตรง

## โครงสร้างโปรเจกต์

```text
common/protocol.py    รูปแบบ packet และชนิดของ message ที่ server กับ client ใช้ร่วมกัน
server/main.py        เปิด socket, รับการเชื่อมต่อ และแยก thread ให้แต่ละ client
server/connection.py  ตัวแทน client หนึ่งคนฝั่ง server
server/state.py       ข้อมูลในหน่วยความจำ: ผู้ใช้ออนไลน์ กลุ่ม ประวัติแชต
server/handlers.py    ตัวจัดการคำขอแต่ละชนิด (R3-R11)
client/connection.py  เชื่อมต่อ server และรับ packet ใน background thread
client/app.py         หน้าจอ GUI
tests/                ชุดทดสอบ
```

## วิธีรัน

ต้องมี Python 3.12 ขึ้นไป รันทุกคำสั่งจากโฟลเดอร์หลักของโปรเจกต์

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

python -m server.main                       # เปิด server ที่พอร์ต 5050
python -m client.app                        # เปิด client บนเครื่องเดียวกับ server
python -m client.app --host 192.168.1.10    # เปิด client จากอีกเครื่อง
python -m unittest discover -s tests -t .   # รันชุดทดสอบ
```

### รันข้ามเครื่อง

1. เปิด server แล้วอนุญาตพอร์ต TCP 5050 ใน firewall ของเครื่องนั้น
2. หา IP ของเครื่อง server ด้วย `ipconfig`
3. เปิด client ที่เครื่องอื่นด้วย `--host <IP>`

## Protocol ที่ใช้ (R1)

| Protocol | ทำไมถึงเลือก | ใช้อย่างไรในโปรเจกต์ |
| --- | --- | --- |
| IPv4 | ระบุที่อยู่เครื่องในเครือข่าย | client ระบุ IP ของ server ตอนเชื่อมต่อ |
| TCP | ข้อมูลครบและเรียงลำดับ ข้อความแชตจึงไม่หายหรือสลับกัน | ทุก client ถือการเชื่อมต่อ TCP ค้างไว้กับ server |
| Protocol ของเราเอง | TCP เป็นสายของ byte ไม่มีขอบเขตของข้อความ จึงต้องกำหนดเอง | `[ความยาว 4 byte][JSON]` ดูที่ `common/protocol.py` |

## รูปแบบ packet

```json
{ "type": "dm_send", "id": 1, "data": { "to": "bob", "text": "hello" } }
{ "type": "response", "id": 1, "ok": true, "data": {} }
{ "type": "response", "id": 2, "ok": false, "error": "name already taken" }
```

**Client ส่งถึง server** (server ตอบทุกคำขอด้วย `response` ที่มี `id` เดียวกัน)

| Type | Data | Requirement |
| --- | --- | --- |
| `login` | `{ name }` | R3 |
| `dm_send` | `{ to, text }` | R5, R7 |
| `group_create` | `{ name }` | R8 |
| `group_join` | `{ group_id }` | R10 |
| `group_send` | `{ group_id, text }` | R5, R11 |

**Server ส่งถึง client**

| Type | Data | Requirement |
| --- | --- | --- |
| `users_list` | `{ names }` | R4 |
| `groups_list` | `{ groups }` | R9 |
| `message_new` | `{ id, room_id, sender, text, sent_at }` | R6, R7, R11 |

รูปแบบ `room_id`: `dm:<nameA>|<nameB>` (เรียงชื่อตามตัวอักษร) หรือ `group:<group_id>`

## สถานะตาม requirement

| Requirement | สถานะ |
| --- | --- |
| R1 client-server ข้ามเครื่อง | วางโครงแล้ว ยังไม่ได้ทดสอบข้ามเครื่องจริง |
| R2 ใช้ socket เท่านั้น | วางโครงแล้ว |
| R3-R11 | ยังไม่ทำ (มี `TODO` ใน `server/handlers.py`) |
| Special points 1-4 | ยังไม่ได้เลือก (ต้องมี AI อย่างน้อย 1 ข้อ) |
