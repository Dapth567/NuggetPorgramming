# แผนผังไฟล์ของโปรเจกต์

เอกสารนี้บอกว่าโปรเจกต์มีไฟล์อะไรบ้าง แต่ละไฟล์มีหน้าที่อะไร และไฟล์ไหนตอบ requirement ข้อไหน
มีไว้เพื่อไม่ให้สมาชิกสร้างไฟล์ที่ทำหน้าที่ซ้ำกัน

เอกสารที่ใช้คู่กัน
- [docs/API.md](docs/API.md): event, payload และรหัส error ที่ server กับ React ตกลงกันไว้
- [TODO.md](TODO.md): งานที่เหลือและผู้รับผิดชอบ

## กติกา

1. **ก่อนสร้างไฟล์ใหม่ให้หาในเอกสารนี้ก่อน** ถ้ามีไฟล์ที่ทำหน้าที่นั้นอยู่แล้ว ให้เขียนเพิ่มในไฟล์นั้น
2. **ถ้าต้องสร้างไฟล์ที่ไม่มีในนี้** ให้เพิ่มแถวในเอกสารนี้ใน PR เดียวกัน พร้อมบอกหน้าที่ให้ชัด
3. **ชื่อไฟล์ในตารางที่สถานะเป็น "ยังไม่มี" คือชื่อที่ตกลงกันแล้ว** ให้สร้างตามชื่อและตำแหน่งนี้ ห้ามตั้งชื่ออื่น
4. **ไฟล์หนึ่งมีคนแก้ทีละคน** ลงชื่อใน TODO.md ก่อนเริ่ม ถ้าต้องแก้ไฟล์ที่คนอื่นจองไว้ให้คุยกันก่อน
5. **type ของ event ประกาศที่ `shared/src/index.ts` ที่เดียว** ห้ามประกาศซ้ำใน server หรือ client
6. **โค้ดที่เรียก Supabase อยู่ใน `server/src/repo/` เท่านั้น** handler ห้ามเรียก `db` ตรง
7. **React ส่งและรับ event ผ่าน `client/src/useChat.ts` เท่านั้น** component ห้ามเรียก `socket.on` เอง

สถานะในตาราง
- **มีแล้ว**: ไฟล์มีอยู่และใช้งานได้
- **มีแล้ว (TODO)**: ไฟล์มีอยู่แต่ยังตอบ `NOT_IMPLEMENTED` หรือยังมีงานค้าง
- **ยังไม่มี**: ต้องสร้าง

## ภาพรวมโครงสร้าง

```text
TermProject/
├── README.md, TODO.md, FILES.md      เอกสารหลัก
├── docs/                             เอกสารประกอบการนำเสนอ
├── supabase/schema.sql               โครงสร้างตาราง
├── shared/src/index.ts               สัญญากลางระหว่าง server กับ client
├── server/src/
│   ├── index.ts, chat-server.ts      เปิด server และรับการเชื่อมต่อ
│   ├── state.ts, types.ts, db.ts     ข้อมูลกลางของ server
│   ├── validate.ts, password.ts      ตรวจ input และ hash รหัสผ่าน
│   ├── broadcast.ts                  ส่ง users:list และ groups:list
│   ├── repo/                         อ่านเขียน Supabase
│   └── handlers/                     รับ event จาก client
├── server/test/                      ชุดทดสอบ
└── client/src/
    ├── main.tsx, App.tsx, socket.ts  จุดเริ่มต้นของหน้าเว็บ
    ├── useChat.ts, errors.ts         state และข้อความ error
    ├── pages/                        หน้า login และหน้าแชต
    └── components/                   ส่วนย่อยของหน้าแชต
```

## ลำดับการเรียกใช้

```text
React component
  -> useChat.ts            (emitWithAck / socket.on)
  -> socket.ts             (การเชื่อมต่อเดียวของทั้งเว็บ)
  ~~ WebSocket ~~
  -> chat-server.ts        (รับ connection แล้วลงทะเบียน handler)
  -> handlers/*.ts         (ตรวจ login + input แล้วทำงาน)
       -> validate.ts      (ตรวจกฎข้อมูล)
       -> repo/*.ts        (อ่านเขียน Supabase)
       -> broadcast.ts     (ส่งรายการให้ client)
       -> state.ts         (ใครออนไลน์อยู่ socket ไหน)
```

---

## ไฟล์ทั้งหมด

### เอกสาร (โฟลเดอร์หลักและ `docs/`)

| ไฟล์ | สถานะ | หน้าที่ | Requirement |
| --- | --- | --- | --- |
| `README.md` | มีแล้ว | ภาพรวม วิธีรัน วิธีรันข้ามเครื่อง ตาราง protocol | R1 |
| `TODO.md` | มีแล้ว | รายการงานและคนรับผิดชอบ | - |
| `FILES.md` | มีแล้ว | เอกสารนี้ แผนผังไฟล์และหน้าที่ของแต่ละไฟล์ | - |
| `docs/API.md` | มีแล้ว | event, payload, error code ต้องแก้คู่กับ `shared/src/index.ts` | R2-R11 |
| `docs/ARCHITECTURE.md` | มีแล้ว | system architecture diagram (client 2 เครื่องขึ้นไป + server + Supabase) พร้อม IP และพอร์ตที่ใช้ตอน demo คำอธิบาย protocol ว่าใช้อะไร ทำไม ใช้อย่างไร และหลักฐาน R2 ใช้ทำสไลด์ R1, R2 | R1, R2 |
| `docs/SETUP_SUPABASE.md` | มีแล้ว | วิธีตั้งค่า Supabase และ `.env` (login ไม่ใช้ Supabase Auth ไม่ใช้อีเมล) | R3 |
| `docs/DATABASE.md` | ยังไม่มี | อธิบายตาราง `users`, `groups`, `group_members`, `messages` ว่าแต่ละคอลัมน์เก็บอะไร | R3, R7-R11 |
| `docs/SPECIAL_POINTS.md` | ยังไม่มี | special point ที่เลือก 4 ข้อ คำอธิบาย ชื่อโมเดล AI และแหล่งอ้างอิง (สไลด์บังคับให้มี) | Part 3 |
| `docs/DEMO.md` | ยังไม่มี | ขั้นตอน demo ทีละข้อ R1-R11 ว่าใครกดอะไรบนเครื่องไหน และ checklist ก่อนวัน demo | ทุกข้อ |
| `docs/PROMPTS.md` | ยังไม่มี | บันทึก prompt ของ Generative AI ที่ใช้เขียนโค้ด แยกตาม requirement สไลด์ทุกข้อมีช่อง "Generative AI Prompt (if use)" | ทุกข้อ |
| `docs/images/` | มีแล้ว | รูป diagram และ screenshot สำหรับสไลด์ ตั้งชื่อตาม requirement เช่น `r1-architecture.png`, `r7-dm.png` | - |
| `.env.example` | มีแล้ว | ตัวอย่างค่า env ถ้าเพิ่มตัวแปรใหม่ (เช่น key ของ AI) ต้องเพิ่มที่นี่ด้วย | - |

### ฐานข้อมูล

| ไฟล์ | สถานะ | หน้าที่ | Requirement |
| --- | --- | --- | --- |
| `supabase/schema.sql` | มีแล้ว | SQL สร้างตารางทั้ง 4 ตาราง ให้ตรงกับใน Supabase จริง ใช้สร้างใหม่ได้ถ้าโปรเจกต์ Supabase หาย | R3, R7-R11 |
| `supabase/delete_group.sql` | มีแล้ว | migration สำหรับลบกลุ่มและข้อความแบบ atomic รวมทั้งป้องกันการเพิ่มข้อความระหว่างลบกลุ่ม | - |
| `supabase/avatars.sql` | มีแล้ว | migration เพิ่มคอลัมน์ `users.avatar` สำหรับรูปโปรไฟล์ | Special |

คอลัมน์ที่คาดว่าต้องมี (คนตั้งตารางต้องตรวจกับ Supabase จริงแล้วแก้ให้ตรง)

| ตาราง | คอลัมน์ | ใช้ทำอะไร |
| --- | --- | --- |
| `users` | `name` (unique), `password_hash`, `created_at` | R3 ชื่อไม่ซ้ำ ใช้ unique constraint กันชื่อซ้ำที่ระดับฐานข้อมูลด้วย |
| `groups` | `id`, `name`, `created_by`, `created_at` | R8, R9 |
| `group_members` | `group_id`, `user_name`, `joined_at` (คู่ `group_id` + `user_name` ห้ามซ้ำ) | R8, R9, R10, R11 |
| `messages` | `id`, `room_id`, `sender`, `text`, `sent_at` | R5, R7, R11 และ `room:history` |

### `shared/` สัญญากลาง

| ไฟล์ | สถานะ | หน้าที่ | Requirement |
| --- | --- | --- | --- |
| `shared/src/index.ts` | มีแล้ว | type ของ event ทุกตัว, `ChatMessage`, `GroupInfo`, `ErrorCode`, `LIMITS`, `NAME_PATTERN`, `dmRoomId()`, `groupRoomId()` ใช้ร่วมกันทั้ง server และ client | R2-R11 |

ให้คงเป็นไฟล์เดียว ถ้าเพิ่ม event ของ special point ให้เพิ่มในไฟล์นี้และใน `docs/API.md` พร้อมกัน

### `server/` ฝั่ง server

| ไฟล์ | สถานะ | หน้าที่ | Requirement |
| --- | --- | --- | --- |
| `server/src/index.ts` | มีแล้ว | จุดเริ่มต้น เปิด server ที่ `0.0.0.0:3000` ให้เครื่องอื่นต่อเข้ามาได้ ไม่ต้องแก้ | R1 |
| `server/src/chat-server.ts` | มีแล้ว | สร้าง Socket.IO server แบบ websocket เท่านั้น และเรียก `register*Handlers` ทุกตัว ทิ้ง event ที่ไม่ได้ส่งมาเป็น (payload, callback) พอดี (กัน server ล่ม) ถ้าเพิ่ม handler ใหม่ให้มาลงทะเบียนที่นี่ ห้ามเขียน logic ของ event ในไฟล์นี้ | R1, R2 |
| `server/src/state.ts` | มีแล้ว | ข้อมูลในหน่วยความจำ ตอนนี้มี `onlineUsers` (ชื่อ -> socket id) และ `games` (เกม XO ที่ยังไม่จบ) ถ้าต้องเก็บสถานะที่ไม่ลงฐานข้อมูล (เช่น ใครกำลังพิมพ์) ให้เพิ่มที่นี่ | R3, R4 |
| `server/src/types.ts` | มีแล้ว | type `ChatServer`, `ChatSocket`, `SocketData` และค่า `NOT_IMPLEMENTED` | - |
| `server/src/db.ts` | มีแล้ว | สร้าง Supabase client ใช้ได้เฉพาะในโฟลเดอร์ `repo/` | - |
| `server/src/check-db.ts` | มีแล้ว | สคริปต์ `npm run check:db` ตรวจว่าต่อทุกตารางได้ | - |
| `server/src/validate.ts` | มีแล้ว | ฟังก์ชันตรวจข้อมูลตามกฎใน `LIMITS` และ `NAME_PATTERN` (ชื่อ, รหัสผ่าน, ชื่อกลุ่ม, ข้อความ) และ `requireLogin(socket)` ที่คืนชื่อผู้ใช้หรือบอกว่าต้องตอบ `NOT_LOGGED_IN` ทุก handler ใช้ไฟล์นี้ ห้ามเขียนตรวจเองในแต่ละ handler | R3, R6-R11 |
| `server/src/password.ts` | มีแล้ว | `hashPassword()` และ `verifyPassword()` ด้วย `node:crypto` (scrypt) ไม่ต้องลง library เพิ่ม ห้ามเก็บรหัสผ่านตรง ๆ | R3 |
| `server/src/broadcast.ts` | มีแล้ว | `sendUsersList(io)` ส่งรายชื่อออนไลน์ให้ทุกคนที่ login แล้ว, `sendGroupsList(target)` ส่งรายการกลุ่มทั้งหมดพร้อมสมาชิก, `sendAvatarsList(socket)` และ `sendAvatarUpdate(io, name, image)` ส่งรูปโปรไฟล์ ใช้ร่วมกันหลาย handler | R4, R9 |
| `server/src/handlers/profile.ts` | มีแล้ว | `profile:avatar` ตั้งหรือลบรูปโปรไฟล์ของคนที่ login อยู่ | Special |
| `server/src/repo/users.ts` | มีแล้ว | `createUser()`, `findUser()`, `userExists()`, `setAvatar()`, `listAvatars()` บนตาราง `users` แปลง `snake_case` เป็น `camelCase` | R3, R7 |
| `server/src/repo/groups.ts` | มีแล้ว | `createGroup()` (ใส่ผู้สร้างเป็นสมาชิกคนเดียว), `listGroups()` (รวมรายชื่อสมาชิก), `findGroup()`, `addMember()`, `isMember()`, `groupsOf(name)` บนตาราง `groups` และ `group_members` | R8-R11 |
| `server/src/repo/messages.ts` | มีแล้ว | `saveMessage()` และ `roomHistory(roomId, limit)` บนตาราง `messages` คืนเป็น `ChatMessage` | R5, R7, R11 |

### `server/src/handlers/` ตัวรับ event

ทุกไฟล์ export `register...Handlers(io, socket)` และตอบ ack ทุกครั้ง ทั้งตอนสำเร็จและตอน error

| ไฟล์ | สถานะ | Event ที่รับ | สิ่งที่ต้องทำ | Requirement |
| --- | --- | --- | --- | --- |
| `auth.ts` | มีแล้ว (R3, R4 เสร็จ) | `auth:register`, `auth:login`, `disconnect` | register: ตรวจ input, ชื่อซ้ำตอบ `NAME_TAKEN`, เก็บ hash<br>login: ตรวจรหัส (ผิดหรือไม่มีชื่อตอบ `WRONG_CREDENTIALS` เหมือนกัน), ชื่อออนไลน์อยู่แล้วตอบ `ALREADY_ONLINE`, ตั้ง `socket.data.name`, ใส่ `state.onlineUsers`, ให้ socket เข้าห้องทุกกลุ่มที่เป็นสมาชิก, ตอบ ack, `sendUsersList`, `sendGroupsList` ให้คนนี้<br>disconnect: ลบออกจาก `onlineUsers` แล้ว `sendUsersList` | R3, R4 |
| `room.ts` | มีแล้ว | `room:history` | ห้อง DM ต้องมีชื่อผู้ขอใน `roomId` ห้องกลุ่มผู้ขอต้องเป็นสมาชิก ไม่ผ่านตอบ `NOT_A_MEMBER` แล้วคืนข้อความล่าสุดไม่เกิน 100 ข้อความ เรียงเก่าไปใหม่ export `denyRoomAccess` ให้ `game.ts` ใช้ตรวจสิทธิ์ห้องแบบเดียวกัน | R5, R7, R11 |
| `dm.ts` | มีแล้ว | `dm:send` | ผู้รับต้องมีบัญชี (ไม่มีตอบ `USER_NOT_FOUND`) ออฟไลน์ก็ส่งได้ บันทึกด้วย `roomId = dmRoomId(ผู้ส่ง, ผู้รับ)` แล้วส่ง `message:new` ให้ socket ของผู้ส่งและผู้รับเท่านั้น (หา socket id จาก `state.onlineUsers`) | R5, R7 |
| `group.ts` | มีแล้ว | `group:create`, `group:join`, `group:send` | create: ผู้สร้างเป็นสมาชิกคนเดียว ห้ามรับรายชื่อคนอื่น, `socket.join(groupRoomId(id))`, `sendGroupsList` ให้ทุกคน<br>join: เพิ่มเฉพาะตัวผู้ขอเอง ไม่มีวิธีเพิ่มคนอื่น, เป็นสมาชิกแล้วตอบ `ALREADY_A_MEMBER`, `socket.join`, `sendGroupsList` ให้ทุกคน<br>send: ไม่ใช่สมาชิกตอบ `NOT_A_MEMBER`, บันทึก, ส่ง `message:new` เข้า room ของกลุ่มเท่านั้น | R5, R8-R11 |

ไฟล์ handler ของ special point (สร้างเมื่อเลือกข้อแล้ว ชื่อเป็นตัวอย่าง)

| ไฟล์ | สถานะ | หน้าที่ |
| --- | --- | --- |
| `server/src/handlers/ai.ts` | ยังไม่มี | รับ event ของฟีเจอร์ AI (เช่น `ai:summarize` สรุปบทสนทนาจาก `room:history`) ตรวจสิทธิ์ห้องแบบเดียวกับ `room.ts` |
| `server/src/ai/client.ts` | ยังไม่มี | เรียก API ของโมเดล AI จาก server เท่านั้น อ่าน key จาก `.env` ห้ามส่ง key ไปที่ React |
| `server/src/handlers/typing.ts` | ยังไม่มี | (ถ้าเลือก) แสดงว่ากำลังพิมพ์ ส่งต่อให้คนในห้องเดียวกันเท่านั้น |
| `server/src/handlers/game.ts` | มีแล้ว | เกม XO ในห้อง DM และกลุ่ม: `game:invite`, `game:respond`, `game:move`, `game:leave`, `game:list` server เป็นคนตัดสินทุกตา เก็บเกมใน `state.games` ส่ง `game:update` ให้คนในห้องนั้นเท่านั้น หลุดการเชื่อมต่อถือว่าออกจากเกม จบแล้วบันทึกผลเป็นข้อความแชต |

ถ้าเลือก special point อื่น ให้ตั้งชื่อ `server/src/handlers/<ชื่อฟีเจอร์>.ts` แล้วเพิ่มแถวในตารางนี้

### `server/test/` ชุดทดสอบ

ทดสอบผ่าน `socket.io-client` จริง (`npm test`) ไฟล์ทดสอบที่ใช้ฐานข้อมูลต้องมี `.env`

| ไฟล์ | สถานะ | ทดสอบอะไร | Requirement |
| --- | --- | --- | --- |
| `server/test/chat-server.test.ts` | มีแล้ว | ต่อได้ด้วย websocket, ปฏิเสธ polling, ack ทำงาน, event ที่ไม่มี callback, callback อยู่ผิดช่อง หรือ argument เกิน ไม่ทำให้ server ล่ม, `dmRoomId`, `NAME_PATTERN` | R2 |
| `server/test/helpers.ts` | มีแล้ว | เปิด server ชั่วคราว สร้าง client ที่ login แล้ว สุ่มชื่อผู้ใช้ทดสอบ ใช้ร่วมกันทุกไฟล์ทดสอบ | - |
| `server/test/auth.test.ts` | มีแล้ว | สมัครชื่อซ้ำ, รหัสผิด, login ซ้อน, `users:list` มีชื่อตัวเองและหายเมื่อหลุด | R3, R4 |
| `server/test/dm.test.ts` | มีแล้ว | ผู้ส่งและผู้รับได้ `message:new` แต่คนที่สามไม่ได้, ส่งหาตัวเองไม่ได้ | R5, R7 |
| `server/test/membership.test.ts` | มีแล้ว | เข้ากลุ่มได้เฉพาะตัวเอง (แนบชื่อคนอื่นมาก็ไม่ถูกเพิ่ม), เข้าซ้ำได้ `ALREADY_A_MEMBER`, ทุกเครื่องเห็นสมาชิกใหม่, เข้าแล้วได้รับข้อความและประวัติของกลุ่ม | R9, R10, R11 |
| `server/test/group.test.ts` | มีแล้ว (`group:join` ทดสอบใน `membership.test.ts`) | สร้างกลุ่มแล้วมีสมาชิกคนเดียว, ทุกคนเห็นกลุ่ม, เข้ากลุ่มเอง, คนนอกกลุ่มส่งและรับข้อความไม่ได้ | R8-R11 |
| `server/test/delete.test.ts` | มีแล้ว | สิทธิ์ลบข้อความและกลุ่ม การแจ้งเตือน และการลบประวัติ | - |
| `server/test/profile.test.ts` | มีแล้ว | ตรวจชนิดและขนาดรูปโปรไฟล์, แจ้งทุกคนเมื่อเปลี่ยนรูป, โหลดรูปตอน login | Special |
| `server/test/room.test.ts` | มีแล้ว | คนนอกห้องโหลดประวัติไม่ได้, ประวัติเรียงเก่าไปใหม่ | R5, R7, R11 |
| `server/test/game.test.ts` | มีแล้ว | เกม XO: คำชวนใน DM ถึงแค่ 2 คน, ปฏิเสธ, เล่นจนชนะและเสมอ, เดินผิดตาหรือช่องซ้ำไม่ได้, ในกลุ่มคนแรกที่รับได้เล่น คนนอกกลุ่มไม่เห็นอะไรเลย, อยู่ 2 เกมพร้อมกันไม่ได้, ยอมแพ้และหลุดแล้วแพ้ | special point |

### `client/` ฝั่ง React

| ไฟล์ | สถานะ | หน้าที่ | Requirement |
| --- | --- | --- | --- |
| `client/index.html` | มีแล้ว | หน้า HTML หลัก | - |
| `client/assets/nugget.png` | มีแล้ว | รูปนั้กเก็ตต้นฉบับสำหรับธีม Nugget Porgramming | - |
| `client/src/assets/nugget.png` | มีแล้ว | รูปนั้กเก็ตขนาดลดลงที่หน้าเว็บและ favicon ใช้ | - |
| `client/vite.config.ts` | มีแล้ว | ตั้งค่า Vite | - |
| `client/src/main.tsx` | มีแล้ว | render `<App />` ไม่ต้องแก้ นอกจาก import `styles.css` | - |
| `client/src/socket.ts` | มีแล้ว | การเชื่อมต่อ Socket.IO อันเดียวของทั้งเว็บ (websocket เท่านั้น) ห้ามสร้างการเชื่อมต่อใหม่ที่อื่น | R1, R2 |
| `client/src/App.tsx` | มีแล้ว (TODO) | เรียก `useChat()` แล้วเลือกหน้า: ยังไม่ login แสดง `LoginPage` login แล้วแสดง `ChatPage` ตอนนี้แสดงแค่สถานะการเชื่อมต่อ | - |
| `client/src/useChat.ts` | มีแล้ว (ครบทุกฟังก์ชัน ต่อ event ของ R5-R11 ไว้แล้ว) | hook กลาง ที่เดียวที่เรียก `socket.on` และ `emitWithAck` ลงทะเบียน listener `users:list`, `groups:list`, `message:new`, `game:update` ก่อน login เก็บ state `me`, `users`, `groups`, `messagesByRoom` (แยกตาม `roomId` เก็บทุกห้องแม้ไม่ได้เปิด), `activeRoomId` และมีฟังก์ชัน `register`, `login`, `logout`, `openRoom` (เรียก `room:history`), `sendDm`, `createGroup`, `joinGroup`, `sendGroup` แสดงข้อความจาก `message:new` เท่านั้น ไม่เพิ่มจาก ack แต่กลุ่มจาก ack ของ `group:create` และ `group:join` ใส่ใน `groups` ทันที ไม่ต้องรอ `groups:list` เกม XO: state `games` และฟังก์ชัน `inviteGame`, `respondGame`, `moveGame`, `leaveGame`, `dismissGame` (`openRoom` โหลด `game:list` มาด้วย) | R3-R11 |
| `client/src/avatar.ts` | มีแล้ว | `toAvatar(file)` ครอบรูปเป็นสี่เหลี่ยมจัตุรัสและย่อเป็น JPEG ก่อนส่งผ่าน socket | Special |
| `client/src/errors.ts` | ยังไม่มี | แปลง `ErrorCode` เป็นข้อความภาษาไทยที่แสดงให้ผู้ใช้ | - |
| `client/src/styles.css` | ยังไม่มี | style ทั้งเว็บ ไฟล์เดียว ถ้ายาวมากค่อยแยกตาม component | R6 |
| `client/src/pages/LoginPage.tsx` | ยังไม่มี | ฟอร์มชื่อและรหัสผ่าน ปุ่มสมัครและปุ่ม login แสดง error เช่นชื่อซ้ำ | R3 |
| `client/src/pages/ChatPage.tsx` | ยังไม่มี | layout หลังจาก login: แถบข้าง (`UserList`, `GroupList`, `CreateGroupForm`) และพื้นที่ห้องที่เปิด (`ChatRoom`) พร้อมปุ่ม logout | R4-R11 |
| `client/src/components/UserList.tsx` | ยังไม่มี | รายชื่อคนออนไลน์รวมชื่อตัวเอง (ทำเครื่องหมายว่า "คุณ") กดชื่อคนอื่นเพื่อเปิดห้อง DM | R4, R7 |
| `client/src/components/GroupList.tsx` | มีแล้ว (แสดงกลุ่มพร้อมชื่อสมาชิกในแถบข้างของ `App.tsx` ปุ่ม Join ยังอยู่ในหน้าแชต) | รายการทุกกลุ่มพร้อมรายชื่อสมาชิก ปุ่ม Join สำหรับกลุ่มที่ยังไม่ได้เข้า กดกลุ่มที่เป็นสมาชิกเพื่อเปิดห้อง | R9, R10, R11 |
| `client/src/components/CreateGroupForm.tsx` | ยังไม่มี | ช่องตั้งชื่อกลุ่มและปุ่มสร้าง ห้ามมีช่องเลือกสมาชิก | R8 |
| `client/src/components/ChatRoom.tsx` | ยังไม่มี | ห้องแชตหนึ่งห้อง ใช้ทั้ง DM และกลุ่ม แสดงชื่อห้องด้านบน `MessageList` ตรงกลาง `MessageInput` ด้านล่าง | R5, R6 |
| `client/src/components/MessageList.tsx` | ยังไม่มี | chat window แสดงข้อความที่ส่งไปและข้อความใหม่ที่เข้ามา พร้อมชื่อผู้ส่งและเวลา เลื่อนลงล่างสุดเมื่อมีข้อความใหม่ | R6 |
| `client/src/components/MessageInput.tsx` | ยังไม่มี | chat box ช่องพิมพ์และปุ่มส่ง กด Enter เพื่อส่ง ห้ามส่งข้อความว่าง | R6 |

| `client/src/components/XoGame.tsx` | มีแล้ว | เกม XO: ปุ่ม 🎮 ข้างช่องพิมพ์ (`XoInviteButton`), การ์ดเกมในห้องแชต (`XoGameCard`) ที่มีปุ่มรับ ปฏิเสธ ยกเลิก ยอมแพ้ เล่นอีกครั้ง และไอคอน 🎮 ในแถบข้างเมื่อมีคำชวนรออยู่ (`XoBadge`) | special point |
| `client/src/components/XoGame.css` | มีแล้ว | หน้าตาของเกม XO ใช้ตัวแปรสีจาก `styles.css` เท่านั้น | special point |

ไฟล์ React ของ special point ให้ตั้งชื่อ `client/src/components/<ชื่อฟีเจอร์>.tsx` เช่น `SummaryButton.tsx`, `TypingIndicator.tsx` แล้วเพิ่มแถวในตารางนี้

---

## Requirement แต่ละข้อใช้ไฟล์ไหน

สรุปจากโจทย์แบบละเอียด คอลัมน์ "ต้องพิสูจน์ตอน demo" คือสิ่งที่อาจารย์จะตรวจ

### Part 1 System Architecture Design (1.5 คะแนน)

ต้องครบ ไม่อย่างนั้น Part 2 จะไม่ถูกตรวจ

| ข้อ | คะแนน | โจทย์ | ต้องพิสูจน์ตอน demo | ไฟล์ |
| --- | --- | --- | --- | --- |
| R1 | 1.0 | นำเสนอ system architecture | client อย่างน้อย 2 ตัว แต่ละตัวอยู่บน **คอมคนละเครื่องจริง** server อยู่เครื่องเดียวกับ client หรือเครื่องที่สามก็ได้ อธิบายได้ว่าใช้ protocol อะไร ทำไมเลือก ใช้อย่างไรในโปรเจกต์ (cloud ไม่บังคับ ถ้าทำนับเป็น special point 1 ข้อ) | `docs/ARCHITECTURE.md`, `README.md`, `server/src/index.ts`, `client/src/socket.ts` |
| R2 | 0.5 | ข้อความแชตระหว่าง server กับ client ต้องใช้ socket programming เท่านั้น | ชี้โค้ดที่บังคับ websocket และให้ดูว่าไม่มี REST API สำหรับส่งข้อความ | `server/src/chat-server.ts`, `client/src/socket.ts`, `server/test/chat-server.test.ts` |

### Part 2 Fundamental implementation (7 คะแนน)

ต้องครบทุกข้อ ไม่อย่างนั้น Part 3 จะไม่ถูกตรวจ

| ข้อ | คะแนน | โจทย์ | ต้องพิสูจน์ตอน demo | Server | React |
| --- | --- | --- | --- | --- | --- |
| R3 | 0.5 | ทุก client ต้องมีชื่อไม่ซ้ำ | สมัครชื่อซ้ำไม่ได้ และ login ชื่อที่ออนไลน์อยู่จากอีกเครื่องไม่ได้ | `handlers/auth.ts`, `validate.ts`, `password.ts`, `repo/users.ts` | `pages/LoginPage.tsx` |
| R4 | 0.5 | เห็นรายชื่อ client ทุกคนที่เชื่อมต่ออยู่ **รวมชื่อตัวเอง** | รายชื่ออัปเดตทันทีเมื่อมีคนเข้าและออก และมีชื่อตัวเองในรายการ | `handlers/auth.ts`, `broadcast.ts`, `state.ts` | `components/UserList.tsx` |
| R5 | 0.5 | แชตแต่ละคู่และแต่ละกลุ่มต้องมีห้องของตัวเอง | ข้อความของห้องหนึ่งไม่ไปโผล่ในอีกห้อง สลับห้องแล้วประวัติยังอยู่ | `handlers/room.ts`, `repo/messages.ts`, `dmRoomId`/`groupRoomId` ใน `shared` | `components/ChatRoom.tsx`, `useChat.ts` |
| R6 | 0.5 | ทุกห้อง (ทั้ง DM และกลุ่ม) มี chat box สำหรับพิมพ์ และ chat window แสดงทั้งข้อความที่ส่งไปและข้อความใหม่ที่เข้ามา | ข้อความขึ้นทันทีทั้งฝั่งผู้ส่งและผู้รับโดยไม่ต้อง refresh | `message:new` ใน `handlers/dm.ts`, `handlers/group.ts` | `components/MessageList.tsx`, `components/MessageInput.tsx` |
| R7 | 1.0 | ส่ง DM ถึง client ใดก็ได้ในรายชื่อ **เห็นเฉพาะผู้ส่งและผู้รับ** | เปิด 3 เครื่อง ให้เครื่องที่สามดูว่าไม่เห็นข้อความ | `handlers/dm.ts`, `handlers/room.ts`, `repo/messages.ts`, `repo/users.ts` | `components/UserList.tsx`, `components/ChatRoom.tsx` |
| R8 | 1.0 | สร้างกลุ่มได้ (ได้หลายกลุ่ม) ตอนเริ่ม **มีแค่ผู้สร้างเป็นสมาชิก** | สร้างกลุ่มแล้วรายชื่อสมาชิกมีแค่ผู้สร้าง | `handlers/group.ts`, `repo/groups.ts` | `components/CreateGroupForm.tsx` |
| R9 | 1.0 | เห็น **ทุกกลุ่ม** ที่ใครก็ได้สร้าง พร้อมรายชื่อสมาชิก | เครื่องอื่นเห็นกลุ่มใหม่และรายชื่อสมาชิกอัปเดตทันที รวมกลุ่มที่ตัวเองไม่ได้อยู่ | `handlers/group.ts`, `broadcast.ts`, `repo/groups.ts` | `components/GroupList.tsx` |
| R10 | 1.0 | เข้ากลุ่มได้ **ด้วยตัวเองเท่านั้น** ผู้สร้างเพิ่มคนอื่นเข้ากลุ่มไม่ได้ | กด Join เองแล้วชื่อขึ้นในรายชื่อสมาชิก และไม่มีปุ่มหรือ event ให้เพิ่มคนอื่น | `handlers/group.ts` (`group:join` ใช้ `socket.data.name` เท่านั้น) | `components/GroupList.tsx` |
| R11 | 1.0 | ส่งข้อความในกลุ่มที่ตัวเองเข้าแล้ว **เห็นเฉพาะสมาชิกกลุ่ม** | คนที่ยังไม่ Join ไม่เห็นข้อความและส่งไม่ได้ | `handlers/group.ts`, `handlers/room.ts`, `repo/messages.ts` | `components/ChatRoom.tsx`, `components/GroupList.tsx` |

### Part 3 Special Points (4 คะแนน, ข้อละ 1)

- ต้องมีฟีเจอร์ AI อย่างน้อย 1 ข้อ เช่น speech-to-text, สรุปข้อความ, วิเคราะห์อารมณ์, chatbot
- สไลด์ของข้อ AI ต้องระบุชื่อโมเดลและแหล่งอ้างอิง
- cloud deployment นับเป็น 1 ข้อ
- รายละเอียดของข้อที่เลือกเขียนใน `docs/SPECIAL_POINTS.md` ไฟล์โค้ดดูได้จากตารางของ handler และ React ด้านบน

### สไลด์ "Implementation Explanation"

ทุกข้อ (R1-R11 และ special point) ต้องมี
- **Code snapshot** (บังคับ): ถ่ายจากไฟล์ในตาราง "Requirement แต่ละข้อใช้ไฟล์ไหน" ด้านบน
- **Generative AI Prompt** (ถ้าใช้): เก็บไว้ใน `docs/PROMPTS.md` ระหว่างทำงาน จะได้ไม่ต้องย้อนหาตอนทำสไลด์

หน้าแรกของสไลด์ต้องมีชื่อกลุ่มและรหัสนักศึกษาพร้อมชื่อของสมาชิกทุกคน
ตอน demo อาจารย์จะถามเรื่องโค้ดและ socket ทุกคนควรอธิบายไฟล์ของตัวเองได้
