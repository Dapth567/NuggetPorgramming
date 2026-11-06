# ตั้งค่า Supabase สำหรับ login

ระบบ login ของโปรเจกต์นี้ **ไม่ใช้ Supabase Auth และไม่ใช้อีเมล** ผู้ใช้สมัครด้วย username กับรหัสผ่านเท่านั้น

- server เก็บ `name` (ไม่ซ้ำ) และ `password_hash` (scrypt ไม่เก็บรหัสผ่านจริง) ในตาราง `users`
- ชื่อซ้ำถูกกันที่ระดับฐานข้อมูลด้วย primary key ถ้าสองคนสมัครชื่อเดียวกันพร้อมกัน คนที่สองได้ `NAME_TAKEN`
- Supabase ถูกใช้เป็นแค่ฐานข้อมูล และเรียกจาก server เท่านั้น (React ไม่รู้จัก Supabase)

**ต้องมี Supabase** เพื่อเก็บบัญชีผู้ใช้ กลุ่ม และประวัติแชต ถ้าไม่มี `.env` server จะไม่เริ่มทำงาน
ทำขั้นตอนนี้ครั้งเดียวต่อโปรเจกต์ (คนรัน server เท่านั้น)

## ขั้นตอน

1. สมัครและเข้า [supabase.com](https://supabase.com) แล้วกด **New project** (เลือก region ใกล้ ๆ เช่น Singapore)
2. รอโปรเจกต์สร้างเสร็จ แล้วไปที่ **SQL Editor** > **New query**
3. คัดลอกเนื้อหาไฟล์ [`supabase/schema.sql`](../supabase/schema.sql) ไปวาง แล้วกด **Run**
   (รันซ้ำได้ ตารางที่มีอยู่แล้วจะไม่ถูกลบ)
4. เอาค่า 2 อย่างมาใส่ในไฟล์ `.env`
   - **Project URL**: **Project Settings** > **Data API** (หรือ **API**) ช่อง Project URL
   - **Secret key**: **Project Settings** > **API Keys** เลือก key ที่ขึ้นต้นด้วย `sb_secret_` (ถ้าโปรเจกต์เก่า ให้ใช้ `service_role` key)
5. สร้างไฟล์ `.env` ที่โฟลเดอร์หลัก (ดูตัวอย่างใน `.env.example`)

   ```text
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_xxxx
   ```

6. ตรวจว่าต่อได้ครบทุกตาราง

   ```powershell
   npm run check:db
   ```

   ต้องเห็น `users: OK`, `groups: OK`, `group_members: OK`, `messages: OK`

## ข้อควรระวัง

- **ห้าม commit `.env`** และห้ามส่ง secret key ให้ React เพราะ key นี้ข้าม row level security ทั้งหมด
- ถ้าโปรเจกต์ Supabase มีตารางอยู่แล้วและชนิดคอลัมน์ต่างจาก `schema.sql` ให้ยึดของจริงและแก้ไฟล์ให้ตรง
- Supabase แบบฟรีจะ pause โปรเจกต์ที่ไม่ได้ใช้งานนานราว 1 สัปดาห์ ก่อนวัน demo ให้เข้า dashboard ไปกด Restore ถ้าถูก pause

## ลองใช้งาน

```powershell
npm run dev:server    # terminal 1
npm run dev:client    # terminal 2
```

เปิด http://localhost:5173 สมัครสมาชิก (Sign up) แล้วเปิดอีกแท็บสมัครอีกชื่อหนึ่ง จะเห็นชื่อกันและกันในรายชื่อออนไลน์
ทดสอบอัตโนมัติ: `npm test` (ต้องมี `.env` เพราะทดสอบกับฐานข้อมูลจริง และจะสร้างผู้ใช้ชื่อ `t_xxxxxxxx` ค้างไว้)
