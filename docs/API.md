# Socket API

เอกสารนี้คือข้อตกลงกลางระหว่างคนทำ server กับคนทำ React ทั้งกลุ่มยึดตามนี้ที่เดียว

## กติกาการแก้ไข

- เอกสารนี้คู่กับ [`shared/src/index.ts`](../shared/src/index.ts) ถ้าแก้ต้องแก้ทั้งสองไฟล์ใน PR เดียวกัน
- แจ้งเพื่อนในกลุ่มก่อนแก้ เพราะกระทบทั้ง server และ React
- ห้ามประกาศ type ของ event เองในฝั่งใดฝั่งหนึ่ง ให้ import จาก `@chat/shared`

ทุก handler ตอนนี้ยังตอบ `NOT_IMPLEMENTED` จนกว่าจะเขียนเสร็จ ดูความคืบหน้าได้ที่ [`TODO.md`](../TODO.md)

## การเชื่อมต่อ

| รายการ | ค่า |
| --- | --- |
| Library | Socket.IO 4 |
| Transport | `websocket` เท่านั้น (ห้ามเปิด polling เพราะขัดกับ R2) |
| พอร์ต server | 3000 |
| ฝั่ง React | ใช้ `socket` จาก `client/src/socket.ts` ห้ามสร้างการเชื่อมต่อใหม่ |
| Supabase | เรียกจาก server เท่านั้น React ห้ามเรียกตรง |

เมื่อเกิด event `disconnect` server จะลืมการ login ของ socket นั้น ให้ React กลับไปหน้า login
และให้ผู้ใช้ login ใหม่ การ logout ใช้ `socket.disconnect()` แล้ว `socket.connect()`

## รูปแบบการตอบกลับ

ทุก event ที่ client ส่ง จะได้ ack กลับเสมอ ใน 2 รูปแบบนี้

```ts
{ ok: true, data: ... }
{ ok: false, error: "NAME_TAKEN" }
```

ต้องเช็ก `res.ok` ก่อนใช้ `res.data` เสมอ

```ts
const res = await socket.emitWithAck("group:create", { name: "Network" });
if (res.ok) {
  console.log(res.data.id);
} else {
  showError(res.error);
}
```

## ชนิดข้อมูล

```ts
interface ChatMessage {
  id: string;
  roomId: string;
  sender: string;
  text: string;
  sentAt: string; // ISO 8601 เช่น "2026-11-06T08:30:00.000Z" server เป็นคนกำหนด
}

interface GroupInfo {
  id: string;
  name: string;
  createdBy: string;
  members: string[];
}

// เกม XO (special point) server เป็นคนเก็บและตัดสิน client แค่แสดงผล
interface XoGame {
  id: string;
  roomId: string;               // ห้อง DM หรือกลุ่มที่เล่น
  x: string;                    // คนชวน เล่นเป็น X และเดินก่อน
  o: string | null;             // DM: คนที่ถูกชวน / กลุ่ม: null จนกว่าจะมีคนรับ
  status: "invited" | "playing" | "over" | "closed";  // over = จบรอบ โต๊ะยังเปิด / closed = ทุกคนออกแล้ว ให้ลบการ์ด
  board: ("X" | "O" | null)[];  // 9 ช่อง เรียงทีละแถว
  turn: "X" | "O";
  result: "win" | "draw" | "forfeit" | "declined" | "cancelled" | null;
  winner: string | null;
  winLine: number[] | null;     // 3 ช่องที่เรียงกันตอนชนะ
  invitees: string[];           // สมาชิกกลุ่มที่คนชวนเลือกเชิญ (DM ไม่ใช้)
  declined: string[];           // สมาชิกกลุ่มที่กดปฏิเสธ
  rematch: string[];            // ผู้เล่นที่กดเล่นอีกรอบแล้ว ครบ 2 คนรอบใหม่เริ่ม
  left: string[];               // ผู้เล่นที่ออกจากโต๊ะแล้ว (React ซ่อนการ์ดของคนนั้น)
}
```

ในโค้ดใช้ `camelCase` ส่วน Supabase ใช้ `snake_case` คนทำ server ต้องแปลงให้ตรง เช่น `sent_at` เป็น `sentAt`

### Room ID

ห้ามต่อ string เอง ให้ใช้ฟังก์ชันจาก `@chat/shared`

| ห้อง | ฟังก์ชัน | ตัวอย่างผลลัพธ์ |
| --- | --- | --- |
| แชตส่วนตัว | `dmRoomId("bob", "alice")` | `dm:alice\|bob` |
| กลุ่ม | `groupRoomId("1234")` | `group:1234` |

### กฎของข้อมูล

ค่าเหล่านี้อยู่ใน `LIMITS` และ `NAME_PATTERN` ของ `@chat/shared` ถ้าข้อมูลไม่ผ่านกฎ server ตอบ `INVALID_INPUT`
React ควรเช็กก่อนส่งด้วย แต่ server ต้องเช็กซ้ำเสมอ

| ข้อมูล | กฎ |
| --- | --- |
| ชื่อผู้ใช้ | 1-20 ตัวอักษร ใช้ตัวอักษร (รวมภาษาไทย), ตัวเลข และ `_` ตัวพิมพ์เล็กใหญ่นับเป็นคนละชื่อ |
| รหัสผ่าน | อย่างน้อย 6 ตัวอักษร |
| ชื่อกลุ่ม | 1-50 ตัวอักษร ชื่อซ้ำกันได้ เพราะแยกด้วย `id` |
| ข้อความ | 1-2000 ตัวอักษร ห้ามเป็นช่องว่างล้วน |
| รูปโปรไฟล์ | data URL แบบ base64 ของ JPEG, PNG หรือ WebP ยาวไม่เกิน 20000 ตัวอักษร ห้ามใช้ SVG |

## Client ส่งถึง server

ทุก event ยกเว้น `auth:register` และ `auth:login` ต้อง login ก่อน ไม่อย่างนั้นได้ `NOT_LOGGED_IN`
ทุก event อาจได้ `INVALID_INPUT` และ `SERVER_ERROR` ตารางด้านล่างจึงไม่เขียนซ้ำ

### `auth:register`

สมัครสมาชิก สำเร็จแล้วยังไม่ถือว่า login ต้องส่ง `auth:login` ต่อ
server ส่ง `users:all` ให้ทุกคนที่ login อยู่ เพื่อให้เห็นชื่อใหม่ในส่วน OFFLINE

| รายการ | ค่า |
| --- | --- |
| Payload | `{ name: string, password: string }` |
| สำเร็จ | `data` ว่าง |
| Error | `NAME_TAKEN` |
| Requirement | R3 |

### `auth:login`

| รายการ | ค่า |
| --- | --- |
| Payload | `{ name: string, password: string }` |
| สำเร็จ | `{ name: string }` |
| Error | `WRONG_CREDENTIALS`, `ALREADY_ONLINE` |
| Requirement | R3, R4 |

เมื่อสำเร็จ server จะ
1. ตอบ ack
2. ส่ง `users:list` ให้ทุกคน
3. ส่ง `users:all` และ `groups:list` ให้ client คนนี้
4. ให้ socket เข้าห้องของทุกกลุ่มที่เป็นสมาชิกอยู่

ไม่บอกว่าชื่อไม่มีอยู่หรือรหัสผิด ให้ตอบ `WRONG_CREDENTIALS` เหมือนกันทั้งสองกรณี

### `room:history`

โหลดข้อความล่าสุดไม่เกิน 100 ข้อความของห้อง เรียงจากเก่าไปใหม่ เรียกตอนเปิดห้อง

| รายการ | ค่า |
| --- | --- |
| Payload | `{ roomId: string }` |
| สำเร็จ | `ChatMessage[]` |
| Error | `GROUP_NOT_FOUND`, `NOT_A_MEMBER` |
| Requirement | R5, R7, R11 |

server ต้องตรวจสิทธิ์ทุกครั้ง ห้องส่วนตัวต้องมีชื่อผู้ขอใน `roomId` ห้องกลุ่มผู้ขอต้องเป็นสมาชิก
ถ้าไม่ผ่านให้ตอบ `NOT_A_MEMBER`

### `dm:send`

ส่งถึงผู้ใช้ที่มีบัญชีได้ แม้ออฟไลน์อยู่ ข้อความจะถูกเก็บไว้ให้เห็นตอนเปิดห้องครั้งถัดไป

| รายการ | ค่า |
| --- | --- |
| Payload | `{ to: string, text: string }` |
| สำเร็จ | `ChatMessage` |
| Error | `USER_NOT_FOUND` |
| Requirement | R5, R7 |

server บันทึกข้อความ แล้วส่ง `message:new` ให้ผู้ส่งและผู้รับเท่านั้น

### `group:create`

| รายการ | ค่า |
| --- | --- |
| Payload | `{ name: string }` |
| สำเร็จ | `GroupInfo` |
| Error | ไม่มีเพิ่ม |
| Requirement | R8, R9 |

ผู้สร้างเป็นสมาชิกคนเดียวตอนเริ่ม ห้ามรับรายชื่อคนอื่นเข้ามาด้วย จากนั้นส่ง `groups:list` ให้ทุกคน

### `group:join`

| รายการ | ค่า |
| --- | --- |
| Payload | `{ groupId: string }` |
| สำเร็จ | `GroupInfo` |
| Error | `GROUP_NOT_FOUND`, `ALREADY_A_MEMBER` |
| Requirement | R9, R10 |

เพิ่มได้เฉพาะตัวผู้ขอเอง ไม่มี event สำหรับเพิ่มคนอื่น จากนั้นส่ง `groups:list` ให้ทุกคน

### `group:send`

| รายการ | ค่า |
| --- | --- |
| Payload | `{ groupId: string, text: string }` |
| สำเร็จ | `ChatMessage` |
| Error | `GROUP_NOT_FOUND`, `NOT_A_MEMBER` |
| Requirement | R5, R11 |

server ตรวจสมาชิก บันทึกข้อความ แล้วส่ง `message:new` ให้สมาชิกกลุ่มเท่านั้น รวมผู้ส่ง

### เกม XO (special point)

เล่นได้ทั้งในห้อง DM และห้องกลุ่ม ตรวจสิทธิ์ห้องแบบเดียวกับ `room:history` (คนนอกห้องได้ `NOT_A_MEMBER`)
เกมเก็บใน memory ของ server ไม่ลงฐานข้อมูล ทุกครั้งที่เกมเปลี่ยน server ส่ง `game:update` ให้คนในห้องนั้นเท่านั้น
คนหนึ่งอยู่ได้ทีละ 1 เกม: ถ้ากำลังเล่นหรือมีคำชวนที่ยังค้างอยู่ จะได้ `ALREADY_IN_GAME`

| Event | Payload | สำเร็จ | Error เพิ่ม |
| --- | --- | --- | --- |
| `game:invite` | `{ roomId: string }` | `XoGame` (`invited`) | `USER_OFFLINE`, `ALREADY_IN_GAME` |
| `game:respond` | `{ gameId: string, accept: boolean }` | `XoGame` | `GAME_NOT_FOUND`, `ALREADY_IN_GAME` |
| `game:move` | `{ gameId: string, cell: number }` (0-8) | `XoGame` | `GAME_NOT_FOUND`, `NOT_YOUR_TURN` |
| `game:leave` | `{ gameId: string }` | `XoGame` (`over` หรือ `closed`) | `GAME_NOT_FOUND` |
| `game:rematch` | `{ gameId: string }` | `XoGame` (`over` รออีกคน หรือ `playing` รอบใหม่) | `GAME_NOT_FOUND` |
| `game:ask` | `{ gameId: string, names: string[] }` (กลุ่มเท่านั้น) | `XoGame` (`invitees` เพิ่มขึ้น) | `GAME_NOT_FOUND`, `USER_OFFLINE` |
| `game:list` | `{ roomId: string }` | `XoGame[]` โต๊ะที่ยังเปิดของห้องนั้น | - |

- **DM**: ชวนอีกฝั่งในห้องได้เมื่อเขาออนไลน์ เขากดรับเกมจะเริ่ม กดปฏิเสธคนชวนจะเหลือคนเดียวที่โต๊ะ (`declined`)
- **กลุ่ม**: `game:invite` เปิดโต๊ะก่อน แล้วคนชวนเลือกสมาชิกที่ออนไลน์ด้วย `game:ask` ได้ทีละหลายคน (เพิ่มทีหลังได้) ชื่อต้องเป็นสมาชิกคนอื่นในกลุ่ม ไม่อย่างนั้นได้ `INVALID_INPUT` ออฟไลน์ได้ `USER_OFFLINE`
  - กดรับ/ปฏิเสธได้เฉพาะคนใน `invitees` (คนอื่นได้ `INVALID_INPUT`) คนแรกที่รับได้เล่น คนอื่นได้ `GAME_NOT_FOUND` และดูเกมต่อได้
  - คนที่ปฏิเสธถูกใส่ใน `declined` คำชวนยังเปิดให้คนอื่น ถ้าถูก `game:ask` อีกครั้งจะได้คำชวนคืน
  - `game:update` ยังส่งเข้า room ของกลุ่ม (สมาชิกเท่านั้น) แต่ React แสดงการ์ดตอนรอรับเฉพาะคนชวนและคนที่ถูกเชิญ พอเริ่มเล่นสมาชิกทุกคนดูได้
- **จบรอบ** (`over`): โต๊ะยังเปิด การ์ดใบเดิมใช้ต่อ ผู้เล่น 2 คนเลือก `game:rematch` หรือ `game:leave` ต้องกด `game:rematch` ครบทั้ง 2 คน รอบใหม่จึงเริ่มบนโต๊ะเดิม (id เดิม)
- ถ้าอีกฝั่งออก (`left`) คนที่เหลือ `game:rematch` ไม่ได้แล้ว ให้ชวนใหม่ด้วย `game:invite` (โต๊ะเก่าจะปิด) หรือ `game:leave`
- ทุกคนออกจากโต๊ะแล้ว server ส่ง `game:update` สถานะ `closed` ครั้งสุดท้าย ให้ React ลบการ์ด
- ชวนหรือรับเกมใหม่ จะออกจากโต๊ะที่จบแล้วและคำชวนที่ตัวเองส่งไว้อัตโนมัติ (`cancelled` = `closed`) เพื่อไม่ให้อยู่ 2 เกมพร้อมกัน
- `game:leave`: คนชวนยกเลิกคำชวน (โต๊ะปิด), คนถูกชวนใน DM ปฏิเสธ, ผู้เล่นยอมแพ้ (`forfeit` อีกฝั่งชนะ), หรือออกหลังจบรอบ ถ้าหลุดการเชื่อมต่อจะเหมือนเรียก `game:leave`
- ลบกลุ่ม (`group:delete`) แล้วเกมที่ค้างในกลุ่มนั้นหายไปด้วย ไม่มี `game:update` ตามมา React ทิ้งเกมของกลุ่มนั้นเองเมื่อได้ `group:deleted`
- ทุกรอบที่จบแบบชนะ เสมอ หรือยอมแพ้ server บันทึกผลเป็นข้อความธรรมดา เช่น `🎮 XO: alice beat bob` แล้วส่ง `message:new` ในห้องนั้น

### การลบ

| Event | Payload | สิทธิ์และผล |
| --- | --- | --- |
| `message:delete` | `{ messageId }` | ผู้ส่งเท่านั้น ลบสำหรับทุกคน; ไม่มีข้อความหรือไม่ใช่ผู้ส่งตอบ `MESSAGE_NOT_FOUND` |
| `group:delete` | `{ groupId }` | ผู้สร้างเท่านั้น ลบกลุ่ม สมาชิก และข้อความทั้งหมดแบบถาวร; คนอื่นได้ `FORBIDDEN` |

ทั้งสอง event ตอบ ack ตามรูปแบบ `Ack<void>` ต้อง login และข้อมูลต้องเป็น UUID
การลบกลุ่มต้องติดตั้ง [`supabase/delete_group.sql`](../supabase/delete_group.sql) ใน Supabase ก่อน

### ผู้ช่วย AI (special point)

ไม่มี event ใหม่ ใช้ `dm:send` และ `group:send` เดิม ผู้ใช้ชื่อ `AI_NAME` (`"AI"`) จาก `@chat/shared` เป็นผู้ตอบ
server เป็นฝ่ายเรียก Google Gemini API ผ่าน HTTPS ด้วย `GEMINI_API_KEY` ใน `.env` React ไม่เคยเห็น key และไม่ได้ต่อ Gemini เอง

| วิธีเรียก | ทำอย่างไร | คนที่เห็นคำตอบ |
| --- | --- | --- |
| DM | `dm:send` `{ to: "AI", text }` | ผู้ถามคนเดียว |
| กลุ่ม | `group:send` ที่ข้อความมี `@AI` (เช็กด้วย `mentionsAi(text)`) | สมาชิกทุกคนในกลุ่ม |

- ack ของข้อความผู้ถามมาก่อนเหมือนปกติ จากนั้น server ส่ง `typing:update` (`name: "AI"`) ระหว่างรอ แล้วบันทึกคำตอบและส่งเป็น `message:new` ที่ `sender` เป็น `"AI"`
- AI อ่านข้อความล่าสุด 20 ข้อความของห้องนั้น จึงตอบตามบทสนทนาได้
- หน้าเว็บแสดงชื่อ `AI_DISPLAY_NAME` (`"Mash Kyrielight"`) และรูป `client/src/assets/ai-mash.jpg` แทน `"AI"` แต่ `sender` ในข้อมูลยังเป็น `"AI"` และเรียกในกลุ่มด้วย `@AI`
- AI ไม่เคย login ไม่อยู่ใน `users:list` และไม่เป็นสมาชิกกลุ่มไหน R4, R8 และ R9 จึงไม่เปลี่ยน
- ห้องหนึ่งถามได้ทีละคำถาม ถ้าถามซ้อนระหว่างรอ AI ตอบว่าให้รอสักครู่ server ลองโมเดลตามลำดับ (`gemini-3.5-flash` แล้ว `gemini-3.5-flash-lite` แล้ว `gemini-flash-lite-latest`, เปลี่ยนได้ด้วย `GEMINI_MODELS` ใน `.env`) รุ่นไหนโควตาฟรีหมด (429) จะถูกข้ามจนถึงเวลาที่ Gemini บอก ถ้าทุกรุ่นตอบไม่ได้ AI ตอบว่าตอบไม่ได้ ถ้าไม่ได้ตั้ง key AI ตอบว่ายังไม่ได้ตั้งค่า
- สมัครหรือ login ด้วยชื่อ `AI` (ตัวพิมพ์ใดก็ได้) ไม่ได้ ได้ `NAME_TAKEN` และ `WRONG_CREDENTIALS`

### `profile:avatar`

ตั้งหรือลบรูปโปรไฟล์ของคนที่ login อยู่เท่านั้น ส่ง `{ image: null }` เพื่อลบรูป ตอบ ack แบบ `Ack<void>`

```ts
const res = await socket.emitWithAck("profile:avatar", { image: "data:image/jpeg;base64,..." });
```

server ตรวจรูป บันทึก แล้วส่ง `avatar:updated` ให้ทุกคนที่ login แล้ว รวมผู้ส่ง
ฟีเจอร์นี้ต้องติดตั้ง [`supabase/avatars.sql`](../supabase/avatars.sql) ใน Supabase ก่อน

### `typing:set`

บอกคนอื่นในห้องว่ากำลังพิมพ์ (`typing: true`) หรือหยุดพิมพ์แล้ว (`typing: false`) ไม่บันทึกลงฐานข้อมูล

| รายการ | ค่า |
| --- | --- |
| Payload | `{ roomId: string, typing: boolean }` |
| สำเร็จ | `data` ว่าง |
| Error | `NOT_A_MEMBER` |
| Requirement | Special point (แสดงว่ากำลังพิมพ์) |

server ตรวจสิทธิ์ห้องโดยไม่ query ฐานข้อมูล: ห้องกลุ่มดูจากว่า socket อยู่ใน room ของกลุ่มหรือไม่ ห้อง DM ดูว่ามีชื่อผู้ส่งใน `roomId`
จากนั้นส่ง `typing:update` ให้คนอื่นในห้องเท่านั้น ไม่ส่งกลับหาผู้ส่ง และไม่ส่งให้คนนอกห้อง

React ส่ง `typing: true` ไม่เกิน 1 ครั้งทุก 2 วินาทีระหว่างพิมพ์ และส่ง `typing: false` เมื่อหยุดพิมพ์ 3 วินาที กด Send สลับห้อง หรือลบข้อความในช่องจนว่าง
ฝั่งผู้รับลบชื่อเองถ้าไม่มี `typing:update` ใหม่ภายใน 5 วินาที (กันชื่อค้างเมื่อผู้พิมพ์หลุดการเชื่อมต่อ) และลบทันทีเมื่อได้ `message:new` จากคนนั้น

## Server ส่งถึง client

| Event | ข้อมูล | ส่งเมื่อไหร่ | ส่งให้ใคร | Requirement |
| --- | --- | --- | --- | --- |
| `users:list` | `string[]` | มีคน login หรือหลุดการเชื่อมต่อ | ทุกคนที่ login แล้ว | R4 |
| `users:all` | `string[]` ทุกคนที่สมัครไว้ ไม่รวม AI | login (ให้คนที่เพิ่ง login), มีคนสมัครใหม่ (ให้ทุกคนที่ login แล้ว) | ดูช่องก่อนหน้า | ส่วนเสริม: React แสดงคนที่ไม่อยู่ใน `users:list` เป็น OFFLINE และ DM หาได้ ส่วน ONLINE ของ R4 ไม่เปลี่ยน |
| `groups:list` | `GroupInfo[]` | login, สร้างกลุ่ม, เข้ากลุ่ม | ดูที่ event ต้นทาง | R9 |
| `message:new` | `ChatMessage` | มีข้อความใหม่ | สมาชิกในห้องนั้นเท่านั้น | R6, R7, R11 |
| `game:update` | `XoGame` | เกม XO ถูกชวน รับ เดิน จบรอบ เริ่มรอบใหม่ มีคนออก หรือโต๊ะปิด | คนในห้องของเกมนั้นเท่านั้น | special point |
| `message:deleted` | `{ messageId, roomId }` | ข้อความถูกลบ | ผู้เข้าร่วม DM ที่ออนไลน์ หรือ socket ในกลุ่ม | - |
| `group:deleted` | `{ groupId }` | กลุ่มถูกลบ | ผู้ใช้ที่ login ทั้งหมด | - |
| `avatars:list` | `UserAvatar[]` | login | คนที่เพิ่ง login | Special |
| `avatar:updated` | `{ name, image }` (`image` เป็น `null` เมื่อลบรูป) | มีคนเปลี่ยนรูป | ผู้ใช้ที่ login ทั้งหมด | Special |
| `typing:update` | `{ roomId, name, typing }` | มีคนเริ่มหรือหยุดพิมพ์ | คนอื่นในห้องนั้น ไม่รวมผู้พิมพ์ | Special |

`users:list`, `users:all` และ `groups:list` ส่งรายการเต็มทุกครั้ง ให้ React แทนที่ของเดิมได้เลย

### ข้อควรระวังฝั่ง React

- **ลงทะเบียน listener ก่อนส่ง `auth:login`** ไม่อย่างนั้นจะพลาด `users:list` และ `groups:list` รอบแรก
- **แสดงข้อความจาก `message:new` เท่านั้น** ห้ามเพิ่มลงหน้าจอจาก ack ด้วย ไม่อย่างนั้นข้อความจะซ้ำ เพราะผู้ส่งได้ `message:new` เช่นกัน
- **แยกข้อความด้วย `roomId`** ข้อความของห้องที่ไม่ได้เปิดอยู่ต้องเก็บไว้ ห้ามทิ้ง

## รหัส error

React ใช้รหัสเหล่านี้เลือกข้อความที่จะแสดงให้ผู้ใช้เห็น

| รหัส | ความหมาย |
| --- | --- |
| `INVALID_INPUT` | ข้อมูลไม่ผ่านกฎ |
| `NOT_LOGGED_IN` | ยังไม่ได้ login |
| `NAME_TAKEN` | ชื่อนี้มีคนสมัครแล้ว |
| `WRONG_CREDENTIALS` | ชื่อหรือรหัสผ่านไม่ถูกต้อง |
| `ALREADY_ONLINE` | ชื่อนี้ login อยู่ที่อื่น |
| `USER_NOT_FOUND` | ไม่พบผู้รับ |
| `GROUP_NOT_FOUND` | ไม่พบกลุ่ม |
| `NOT_A_MEMBER` | ไม่มีสิทธิ์ในห้องนี้ |
| `ALREADY_A_MEMBER` | เป็นสมาชิกกลุ่มนี้อยู่แล้ว |
| `SERVER_ERROR` | server หรือฐานข้อมูลมีปัญหา |
| `NOT_IMPLEMENTED` | handler นี้ยังเขียนไม่เสร็จ |
| `GAME_NOT_FOUND` | ไม่มีเกมนี้ จบไปแล้ว หรือมีคนรับคำชวนไปก่อน |
| `NOT_YOUR_TURN` | ยังไม่ถึงตาเรา หรือเป็นคนดูไม่ใช่ผู้เล่น |
| `ALREADY_IN_GAME` | กำลังเล่นหรือมีคำชวนค้างอยู่แล้ว |
| `USER_OFFLINE` | คนที่ชวนใน DM ไม่ได้ออนไลน์ |

## ตัวอย่างลำดับการทำงาน

Alice ส่งข้อความส่วนตัวหา Bob

```text
Alice                      Server                       Bob
  | --- dm:send ------------> |                          |
  |                           | บันทึกลง Supabase         |
  | <-- message:new --------- | --- message:new -------> |
  | <-- ack { ok: true } ---- |                          |
```
