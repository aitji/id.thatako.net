<!--
    เลือกอย่างใดอย่างหนึ่ง แล้วลบที่เหลือออก
    1. เพิ่ม Subdomain ใหม่
    2. แก้ไข Subdomain
    3. ลบ Subdomain
-->
---------------------------------------------------------------------------
# เพิ่ม Subdomain ใหม่

**Subdomain:** `[name].id.thatako.net`

## Provider

<!-- Vercel / GitHub Pages / Netlify / อื่น ๆ (ระบุชื่อ) -->

## Owner / Co-owners

Primary Owner:
```
GitHub  : @[username]
Contact : [username]@example.com
```

<!-- บอกหน่อยสิว่าใครเป็น owner, co-owners บ้าง -->

## Preview

<!-- แนบลิงก์ preview หรือ screenshot ของเว็บไซต์ที่จะชี้มา -->

---

## Terms of Service

- [ ] ชื่อ subdomain ใช้เฉพาะ `a-z`, `0-9`, `-` และไม่ขึ้นหรือลงท้ายด้วย `-`
- [ ] ไม่ใช่ชื่อที่สงวนไว้
- [ ] DNS records ไม่มี CNAME conflict
- [ ] `owner[].github-id` ถูกต้องและตรงกับ GitHub username
- [ ] เนื้อหาในเว็บไซต์ไม่ใช่เนื้อหา NSFW, ผิดกฎหมาย, หลอกลวง และอื่น ๆ
- [ ] subdomain นี้ประสงค์ที่จะใช้จริง และไม่ได้จอง namespace
- [ ] ไม่ได้ใช้ subdomain ในเชิงพาณิชย์ที่ไม่เหมาะสม
- [ ] ทำตามข้อกำหนดการให้บริการที่ https://dev.thatako.net/subdomain/tos

---------------------------------------------------------------------------

# แก้ไข Subdomain

**Subdomain:** `[name].id.thatako.net`

## สิ่งที่เปลี่ยนแปลง

<!-- เลือกที่เกี่ยวข้อง -->

- [ ] เพิ่ม DNS record
- [ ] แก้ไข DNS record
- [ ] ลบ DNS record
- [ ] เปลี่ยน provider
- [ ] เพิ่ม / ลบ co-owner

## รายละเอียด

<!-- อธิบายสั้น ๆ ว่าเปลี่ยนอะไรและทำไม -->

- [ ] ฉันเป็น owner หรือ co-owner ของ subdomain นี้
- [ ] DNS records ไม่มี CNAME conflict

---

## Terms of Service

- [ ] ชื่อ subdomain ใช้เฉพาะ `a-z`, `0-9`, `-` และไม่ขึ้นหรือลงท้ายด้วย `-`
- [ ] ไม่ใช่ชื่อที่สงวนไว้
- [ ] DNS records ไม่มี CNAME conflict
- [ ] `owner[].github-id` ถูกต้องและตรงกับ GitHub username
- [ ] เนื้อหาในเว็บไซต์ไม่ใช่เนื้อหา NSFW, ผิดกฎหมาย, หลอกลวง และอื่น ๆ
- [ ] subdomain นี้ประสงค์ที่จะใช้จริง และไม่ได้จอง namespace
- [ ] ไม่ได้ใช้ subdomain ในเชิงพาณิชย์ที่ไม่เหมาะสม
- [ ] ทำตามข้อกำหนดการให้บริการที่ https://dev.thatako.net/subdomain/tos

---------------------------------------------------------------------------

# ลบ Subdomain

**Subdomain:** `[name].id.thatako.net`

## เหตุผล

<!-- อธิบายสั้น ๆ ว่าลบเพราะอะไร เช่น ไม่ได้ใช้แล้ว, ย้าย provider, ฯลฯ
ไม่จำเป็นต้องบอกว่าย้ายไปไหน ;p -->

- [ ] ฉันเป็น primary owner ของ subdomain นี้
- [ ] เข้าใจว่าการกระทำนี้ไม่สามารถย้อนกลับได้ และ DNS record จะถูกลบออกจาก Cloudflare ทันทีที่ถูก commit
