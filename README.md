# Nugget Porgramming

Nugget Porgramming โดยกลุ่ม CARTOON NETWORK เป็นเว็บแอปแชตสำหรับ Term Project วิชา Computer Network มีทั้ง direct message และ group chat
ข้อความแชตระหว่าง client กับ server ทั้งหมดวิ่งผ่าน WebSocket

## เอกสารของกลุ่ม

- [docs/API.md](docs/API.md): รูปแบบ event และข้อมูลระหว่าง server กับ React
- [TODO.md](TODO.md): งานที่เหลือและผู้รับผิดชอบ
- [FILES.md](FILES.md): ไฟล์ทั้งหมดและหน้าที่ของแต่ละไฟล์ อ่านก่อนสร้างไฟล์ใหม่

## Tech stack

| ส่วน | เทคโนโลยี |
| --- | --- |
| Server | Node.js, TypeScript, Socket.IO |
| Client | React, TypeScript, Vite, socket.io-client |
| ฐานข้อมูล | Supabase (เข้าถึงจาก server เท่านั้น) |

```text
Browser <-- WebSocket --> Server <-- HTTPS --> Supabase
```

## โครงสร้างโปรเจกต์

```text
docs/API.md                  ข้อตกลงของ socket API
shared/src/index.ts          event, type และฟังก์ชันที่ server กับ client ใช้ร่วมกัน
server/src/index.ts          จุดเริ่มต้นของ server
server/src/chat-server.ts    เปิด socket และรับการเชื่อมต่อ
server/src/state.ts          รายชื่อ client ที่ออนไลน์
server/src/db.ts             การเชื่อมต่อ Supabase
server/src/handlers/         ตัวจัดการ event: auth, room, dm, group
server/test/                 ชุดทดสอบ
client/src/socket.ts         การเชื่อมต่อฝั่ง client
client/src/App.tsx           หน้าเว็บหลัก
```

## วิธีรัน

ต้องมี Node.js 22.9 ขึ้นไป

```bash
npm install
npm run dev:server   # server ที่พอร์ต 3000
npm run dev:client   # หน้าเว็บที่พอร์ต 5173
npm test             # รันชุดทดสอบ
npm run check:db     # ทดสอบการเชื่อมต่อ Supabase
```

เครื่องที่รัน server ต้องมีไฟล์ `.env` คัดลอกจาก `.env.example` แล้วใส่ค่าจริง ห้าม commit ไฟล์นี้

สำหรับการลบกลุ่ม ให้รัน `supabase/delete_group.sql` ใน Supabase SQL Editor หลังตั้งตาราง ดู [วิธีตั้งค่า Supabase](docs/SETUP_SUPABASE.md) ผู้สร้างกลุ่มเท่านั้นที่ลบกลุ่มและข้อความทั้งหมดได้ และผู้ส่งเท่านั้นที่ลบข้อความของตัวเองได้

### รันข้ามเครื่องใน LAN

1. เปิด server และ client บนเครื่องหนึ่ง แล้วอนุญาตพอร์ต TCP 3000 และ 5173 ใน firewall
2. หา IP ของเครื่องนั้นด้วย `ipconfig`
3. เครื่องอื่นเปิด `http://<IP>:5173`

ถ้า server อยู่คนละเครื่องกับหน้าเว็บ ให้ตั้ง `VITE_SERVER_URL` ฝั่ง client เช่น
`VITE_SERVER_URL=http://192.168.1.10:3000`

## Protocol ที่ใช้ (R1)

| Protocol | ทำไมถึงเลือก | ใช้อย่างไรในโปรเจกต์ |
| --- | --- | --- |
| IPv4 | ระบุที่อยู่เครื่องในเครือข่าย | browser ใช้ IP เพื่อต่อไปยัง server |
| TCP | ข้อมูลครบและเรียงลำดับ ข้อความแชตจึงไม่หายหรือสลับกัน | ชั้น transport ใต้ HTTP และ WebSocket |
| HTTP | เป็นวิธีมาตรฐานในการโหลดหน้าเว็บและเริ่ม WebSocket | ส่งไฟล์หน้าเว็บ และ handshake แบบ `Upgrade` |
| WebSocket | full-duplex server ส่งข้อความเข้า client ได้ทันทีโดยไม่ต้อง poll | เส้นทางของ event และข้อความแชตทั้งหมด |
| Socket.IO | มี rooms, ack และ reconnect ให้ในตัว | แยกห้องแชตและตอบผลของแต่ละคำขอ |
| HTTPS | เข้ารหัสข้อมูลระหว่าง server กับฐานข้อมูล | server เรียก Supabase |

## สถานะตาม requirement

| Requirement | สถานะ |
| --- | --- |
| R1 สถาปัตยกรรม client-server ข้ามเครื่อง | ทดสอบ 3 เครื่องผ่าน Tailscale แล้ว ยังเหลือ diagram |
| R2 ใช้ socket เท่านั้น | เสร็จแล้ว (บังคับ `transports: ["websocket"]`) ยังเหลือ code snapshot ในสไลด์ |
| R3-R11 | เสร็จแล้ว ทดสอบบนหน้าเว็บจริงแล้ว |
| Special points 1-4 | มีแล้ว 1 ข้อ: เกม XO ในแชต DM และกลุ่ม ยังต้องมีฟีเจอร์ AI อย่างน้อย 1 ข้อ |

# i love nugget
