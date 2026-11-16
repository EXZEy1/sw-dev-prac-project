# Dentist Booking API

SW Dev Practice · Final Project #4 · กลุ่ม SAKA

REST API สำหรับจองนัดทันตแพทย์ ใช้ Express 5 และ MongoDB (Mongoose 9) พัฒนาต่อจาก Assignment 7 (VacQ)

| สมาชิก | GitHub | รับผิดชอบ |
|---|---|---|
| ตุลยวัต เวียงทอง 6631317921 | EXZEy1 | Core 1–6 · Additional 1, 4 |
| ศิวะราช อาจารีพิพัฒน์ 6632218621 | Nykhanomjan | Core 7–9 · Additional 2, 3 |

## Requirements

**Core**

1. Register ด้วย name, tel, email, password
2. Login ด้วย email และ password และ logout
3. ดูรายชื่อหมอ (ชื่อ, ประสบการณ์, ความเชี่ยวชาญ) และจองได้ **หนึ่งนัด** โดยระบุหมอและวัน
4. User ดูนัดของตัวเอง
5. User แก้นัดของตัวเอง
6. User ยกเลิกนัดของตัวเอง
7. Admin ดูนัดทุกคน
8. Admin แก้นัดทุกคน
9. Admin ยกเลิกนัดทุกคน

**Additional (extra credit)**

1. แบบสอบถามก่อนนัด: อ่านได้เฉพาะเจ้าของนัดกับ admin (0.5)
2. คิวหน้างาน: admin บันทึกการมาถึงและเปลี่ยนสถานะ waiting → called → completed (0.5)
3. รายการรอ: user ลงชื่อหรือออกจากรายการรอของหมอและวันที่เลือก admin ดูผู้รอตามลำดับ (1)
4. QR ของนัด: QR ที่มี booking reference ไม่ซ้ำกัน (1)

## Getting started

ต้องใช้ Node.js 22 ขึ้นไป

```bash
npm install
npm run setup:local
```

`setup:local` สร้าง `config/config.env` (มี `JWT_SECRET` และ `DEMO_PASSWORD` แบบสุ่ม) และ `postman/localhost.environment.local.json` ทั้งสองไฟล์อยู่ใน `.gitignore` ถ้าจะใช้ MongoDB Atlas ให้แก้ `MONGO_URI` ใน `config/config.env` โดยใช้ชื่อฐานข้อมูล `dentist_booking_demo` (ดูตัวอย่างใน `config/config.env.example`)

ถ้าใช้ฐานข้อมูลในเครื่อง ให้เปิด MongoDB ค้างไว้ใน terminal หนึ่ง:

```bash
npm run db:demo
```

ใส่ข้อมูลตัวอย่าง (ลบข้อมูลเดิมใน `dentist_booking_demo` ก่อน) แล้วเปิดเซิร์ฟเวอร์:

```bash
npm run seed:demo
npm start
```

API จะอยู่ที่ `http://127.0.0.1:5003/api/v1` บัญชีจาก seed ใช้รหัสผ่าน `DEMO_PASSWORD` ใน `config/config.env` เช่น `admin@example.test` (admin) และ `extra-owner@example.test` (user) ส่วนบัญชี admin สร้างผ่าน register ไม่ได้

## Endpoints

ทุก endpoint อยู่ใต้ `/api/v1` ยกเว้น `/health` route ที่ต้องล็อกอินจะใช้ header `Authorization: Bearer <token>`

| Method | Path | สิทธิ์ | Requirement |
|---|---|---|---|
| POST | `/auth/register` | public | Core 1 |
| POST | `/auth/login` | public | Core 2 |
| GET | `/auth/me` | login | Core 2 |
| GET | `/auth/logout` | public | Core 2 |
| GET | `/dentists`, `/dentists/:id` | login | Core 3 |
| GET, POST | `/appointments` | user | Core 3, 4 |
| GET, PATCH, DELETE | `/appointments/:id` | user (เจ้าของนัด) | Core 4, 5, 6 · Additional 4 |
| GET, PUT | `/appointments/:id/questionnaire` | เจ้าของนัด (GET ได้ทั้ง admin) | Additional 1 |
| GET | `/admin/appointments` | admin | Core 7 |
| GET, PATCH, DELETE | `/admin/appointments/:id` | admin | Core 7, 8, 9 |
| GET, POST | `/queues` | admin | Additional 2 |
| PATCH | `/queues/:id` | admin | Additional 2 |
| GET, POST | `/waiting-list` | user (GET ได้ทั้ง admin) | Additional 3 |
| DELETE | `/waiting-list/:id` | user | Additional 3 |

หมายเหตุ

- การยกเลิกนัดใช้ `DELETE` แต่ไม่ได้ลบ document จะเปลี่ยน `status` เป็น `cancelled` และบันทึก `cancelledAt` ไว้
- จำกัดหนึ่งนัดต่อคนด้วย partial unique index บน `user` (เฉพาะ `status: 'booked'`) ถ้าจองซ้ำจะได้ `409 BOOKING_LIMIT_REACHED`
- การแก้นัดเปลี่ยนได้เฉพาะ `dentist` และ `bookingDate` (รูปแบบ `YYYY-MM-DD` และต้องไม่ก่อนวันนี้ตามเวลาไทย)
- JWT เป็นแบบ stateless การ logout จึงให้ client ลบ token ทิ้ง ไม่ได้เพิกถอน token ฝั่ง server

## Testing

```bash
npm test
```

ทดสอบกับ MongoDB ในหน่วยความจำ ไม่แตะฐานข้อมูลใน `config.env` การรันครั้งแรกจะดาวน์โหลด MongoDB ประมาณ 700 MB ไปไว้ใน `.local/`

## Postman demo

เปิดเซิร์ฟเวอร์และ seed ข้อมูลก่อน แล้วรัน:

```bash
npm run demo:all
```

| Command | Folder |
|---|---|
| `npm run demo:core` | `00 Setup`, `Core R1-R6 - User`, `Core R7-R9 - Admin` |
| `npm run demo:extras` | `Extra 1 and 4 - Questionnaire and QR`, `Extra 2 and 3 - Queue and Waiting List` |

ชื่อ request ขึ้นต้นด้วยเลข requirement เช่น `R6 Delete own booking` คือ Core 6 ถ้าจะ import เข้า Postman ให้ใช้ `postman/dentist-booking.collection.json` คู่กับ `postman/localhost.environment.local.json` ชุด Extra 2 and 3 จะยกเลิกนัดหนึ่งนัด ถ้าจะรันซ้ำให้ `npm run seed:demo` ก่อน

## Diagrams

ไฟล์ทั้งหมดอยู่ใน [`docs/diagrams`](docs/diagrams) (PlantUML `.puml` พร้อม `.svg` และ `.png`)

- Use case: `use-case-core`
- Class (REST UML Profile): `class-rest-auth-core`, `class-rest-booking-core`, `class-rest-admin-core`
- Sequence: `sequence-core-create-booking`, `sequence-core-admin-edit-cancel`
