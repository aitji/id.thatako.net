# ศูนย์รวมโดเมน id.thatako.net

> [!NOTE]
> บริการ subdomain ฟรีสำหรับนักเรียนและครูโรงเรียนท่าตะโกพิทยาคม ในรูปแบบ `[name].id.thatako.net`
> จัดการผ่าน GitHub PR & DNS deploy อัตโนมัติผ่าน GitHub Actions เข้า Cloudflare ทันทีที่ commit

## สารบัญ

- [ศูนย์รวมโดเมน id.thatako.net](#ศูนย์รวมโดเมน-idthatakonet)
  - [สารบัญ](#สารบัญ)
  - [วิธีใช้งาน](#วิธีใช้งาน)
    - [ลงทะเบียนผ่านหน้าเว็บ (แนะนำ)](#ลงทะเบียนผ่านหน้าเว็บ-แนะนำ)
    - [แก้ไขผ่าน GitHub โดยตรง (ขั้นสูง)](#แก้ไขผ่าน-github-โดยตรง-ขั้นสูง)
  - [โครงสร้างไฟล์](#โครงสร้างไฟล์)
  - [DNS Record Format](#dns-record-format)
    - [ตัวอย่าง CNAME (GitHub Pages)](#ตัวอย่าง-cname-github-pages)
    - [ตัวอย่าง A + TXT (Cloudflare/Custom Server)](#ตัวอย่าง-a--txt-cloudflarecustom-server)
    - [ตัวอย่าง AAAA (IPv6)](#ตัวอย่าง-aaaa-ipv6)
    - [ตัวอย่าง MX (email)](#ตัวอย่าง-mx-email)
    - [หลาย records บนชื่อเดียวกัน](#หลาย-records-บนชื่อเดียวกัน)
    - [CNAME Conflict Rule](#cname-conflict-rule)
  - [GitHub Actions Validation](#github-actions-validation)
    - [สิ่งที่ตรวจสอบ](#สิ่งที่ตรวจสอบ)
    - [กรณีที่ maintainer ต้อง review เอง](#กรณีที่-maintainer-ต้อง-review-เอง)
  - [ชื่อที่สงวนไว้ (Reserved Names)](#ชื่อที่สงวนไว้-reserved-names)
  - [ข้อกำหนดการใช้งาน](#ข้อกำหนดการใช้งาน)
  - [รายงาน Abuse](#รายงาน-abuse)
  - [Issue Templates](#issue-templates)
  - [ติดต่อ / Maintainer](#ติดต่อ--maintainer)

## วิธีใช้งาน

### ลงทะเบียนผ่านหน้าเว็บ (แนะนำ)

ไม่ต้องแตะ GitHub repository เลยทำทุกอย่างผ่านหน้าเว็บได้เลย

1. เข้า [thatako.net/subdomain/register](thatako.net/subdomain/register)
2. เข้าสู่ระบบด้วยบัญชี GitHub _(ใช้แค่ยืนยันตัวตน)_
3. ระบุชื่อ subdomain และเพิ่ม DNS records ตาม provider ที่ใช้
4. กด _"ลงทะเบียนโดเมน"_ ระบบจะ deploy DNS เข้า Cloudflare ทันที

> การ**แก้ไข**และ**ลบ**ก็ทำได้ผ่านหน้าเดียวกัน โดย owner และ co-owner สามารถเข้าจัดการโดเมนที่เป็นเจ้าของได้

### แก้ไขผ่าน GitHub โดยตรง (ขั้นสูง)

ทางเลือกนี้ไม่มี UI แก้ไข JSON เองและจัดการกับ _GitHub Actions bot_
แต่ถ้าไม่มี error ระบบจะ commit เข้า main และ deploy ให้อัตโนมัติเช่นกัน

> [!WARNING]
> แนะนำให้ใช้หน้าเว็บแทน วิธีนี้เหมาะสำหรับผู้ที่คุ้นเคยกับ git workflow เท่านั้น

1. Fork repository นี้
   ```
   git clone https://github.com/aitji/id.thatako.net.git
   ```
2. สร้างหรือแก้ไขไฟล์ที่ `domains/[your-name].json` ตาม format ด้านล่าง
3. เปิด Pull Request พร้อมระบุชื่อ subdomain ใน title เช่น `เพิ่ม: myname.id.thatako.net`
4. GitHub Actions จะตรวจสอบ ownership และ JSON format อัตโนมัติ
5. ถ้าไม่มี error, bot จะปิด PR, commit และ deploy ให้เอง, ถ้ามี error ต้องแก้ไขก่อนแล้วบอทจะตรวจสอบให้อีกรอบ

## โครงสร้างไฟล์

```
id.thatako.net/
├── domains/
│   ├── myname.id.thatako.net.json    ← ไฟล์ subdomain แต่ละโดเมน
│   ├── portfolio.json
│   └── ...
└── README.md
```

ไฟล์แต่ละ subdomain เก็บอยู่ใน `domains/[name].id.thatako.net.json` โดย `name` ต้องตรงกับชื่อ subdomain ที่ต้องการ

## DNS Record Format

ไฟล์ JSON มี schema ดังนี้

> ตัวอย่างไฟล์จาก `domains/aitji.id.thatako.net`

```jsonc
{
  "domain": "aitji.id.thatako.net",
  "host": ["vercel"],
  "owner": [
    // primary owner คือคนแรกมีอีเมลติดต่อและมีคนเดียว
    {
      "github": "aitji",
      "github-id": 100911929,
      "email": "ait.suriya@gmail.com" // สำคัญ*
    },
    // co-owners
    {
      "github": "PickerTH-12",
      "github-id": 131840709,
      "email": "" // co-owners ไม่จำเป็นต้องมีอีเมล
    },
    {
      // สามารถมี co-owners กี่คนก็ได้
      "github": "t4nluxz7-bot",
      "github-id": 236544355,
      "email": ""
    } //, {...} เพิ่ม co-owners ได้
  ],
  "records": {
    // ตัวอย่าง records สำหรับ vercel
    "CNAME": [
      {
        "name": "aitji.id",
        "value": "0a8082110cc04770.vercel-dns-017.com."
      }
    ]
  }
}
```

| Field               | Type     | Description                                      |
| ------------------- | -------- | ------------------------------------------------ |
| `domain`            | string   | ชื่อ subdomain เต็ม เช่น `myname.id.thatako.net` |
| `host`              | string[] | provider ที่ใช้ เช่น `["vercel"]`                |
| `owner`             | object[] | รายชื่อ owner ; คนแรกคือ primary owner           |
| `owner[].github`    | string   | GitHub username                                  |
| `owner[].github-id` | number   | GitHub user ID (ตัวเลข)                          |
| `owner[].email`     | string   | Email (optional)                                 |
| `records`           | object   | DNS records แยกตาม type                          |

### ตัวอย่าง CNAME (GitHub Pages)

```jsonc
{
  "domain": "myname.id.thatako.net",
  "host": ["github-pages"],
  "owner": [
    {
      "github": "username",
      "github-id": 12345678,
      "email": "username@example.com"
    } //, {...} เพิ่ม co-owners ได้
  ],
  "records": {
    "CNAME": [
      {
        "name": "@",
        "value": "username.github.io" // ลิงก์ที่ github ให้มาปกติแล้วจะเป็น [username].github.io
      }
    ]
  }
}
```

> หลังจาก merge แล้วต้องไปเพิ่มโดเมนใน Repository → Settings → Pages ด้วย

### ตัวอย่าง A + TXT (Cloudflare/Custom Server)

```jsonc
{
  "domain": "myname.id.thatako.net",
  "host": ["cloudflare"],
  "owner": [
    {
      "github": "username",
      "github-id": 12345678,
      "email": "username@example.com"
    } //, {...} เพิ่ม co-owners ได้
  ],
  "records": {
    "A": [
      {
        "name": "@",
        "value": "1.2.3.4"
        // *นี่เป็นเพียงตัวอย่างกรุณากรอกข้อมูลให้ถูกต้อง
      }
    ],
    "TXT": [
      {
        "name": "@",
        "value": "v=spf1 include:example.com ~all"
        // *นี่เป็นเพียงตัวอย่างกรุณากรอกข้อมูลให้ถูกต้อง
      }
    ]
  }
}
```

<hr>

### ตัวอย่าง AAAA (IPv6)

```jsonc
{
  // ...ข้อมูลก่อนหน้า
  "records": {
    "AAAA": [
      {
        "name": "@",
        "value": "2001:db8::1"
        // *นี่เป็นเพียงตัวอย่างกรุณากรอกข้อมูลให้ถูกต้อง
      }
    ]
  }
}
```

<hr>

### ตัวอย่าง MX (email)

```jsonc
{
  // ...ข้อมูลก่อนหน้า
  "records": {
    "MX": [
      {
        "name": "@",
        "value": "mail.example.com"
        // *นี่เป็นเพียงตัวอย่างกรุณากรอกข้อมูลให้ถูกต้อง
      }
    ]
  }
}
```

<hr>

### หลาย records บนชื่อเดียวกัน

สามารถใส่หลาย records ในชื่อเดียวกันได้ โดยเพิ่ม object เข้าไปใน array

```jsonc
{
  // ...ข้อมูลก่อนหน้า
  "records": {
    "A": [
      { "name": "@", "value": "1.2.3.4" },
      { "name": "www", "value": "1.2.3.4" }
      // *นี่เป็นเพียงตัวอย่างกรุณากรอกข้อมูลให้ถูกต้อง
    ],
    "TXT": [
      {
        "name": "@",
        "value": "some-verification-token"
        // *นี่เป็นเพียงตัวอย่างกรุณากรอกข้อมูลให้ถูกต้อง
      }
    ]
  }
}
```

<hr>

### CNAME Conflict Rule

> [!CAUTION]
> CNAME **ไม่สามารถ**อยู่ร่วมกับ ``A``, ``AAAA`` หรือ ``MX`` บนชื่อ (name) เดียวกันได้
> ตามมาตรฐาน RFC 1912, GitHub Actions จะ fail validation ทันที

```jsonc
// [ผิด ❌] CNAME และ A บน "@" เดียวกัน
{
  "records": {
    "CNAME": [{ "name": "@", "value": "cname.example.com." }],
    "A":     [{ "name": "@", "value": "1.2.3.4" }]
  }
}

// [ถูก ✅] CNAME บน "@", A บน "www"
{
  "records": {
    "CNAME": [{ "name": "www", "value": "cname.example.com." }],
    "A":     [{ "name": "@",   "value": "1.2.3.4" }]
  }
}
```

<hr>

## GitHub Actions Validation

เมื่อมี PR เข้ามา GitHub Actions จะตรวจสอบอัตโนมัติก่อน maintainer review

### สิ่งที่ตรวจสอบ

| การตรวจสอบ      | รายละเอียด                                                           |
| --------------- | ------------------------------------------------------------------ |
| JSON format     | ไฟล์ต้องเป็น valid JSON ตาม schema                                    |
| ชื่อโดเมน         | ต้องตรงกับชื่อไฟล์ และลงท้ายด้วย ``.id.thatako.net` `                    |
| ชื่อ subdomain    | ใช้ได้เฉพาะ ``a-z``, ``0-9``, ``-`` และห้ามขึ้นหรือลงท้ายด้วย ``-``        |
| Reserved names  | ชื่อที่สงวนไว้จะไม่ผ่าน validation                                        |
| Owner field     | ต้องมี ``github``, ``github-id`` ครบ                                 |
| Ownership check | ผู้แก้ไขผ่าน GitHub ต้องเป็น owner หรือ co-owner ของโดเมนที่แก้ไข           |
| CNAME conflict  | CNAME ต้องไม่อยู่ร่วมกับ A/AAAA/MX บนชื่อเดียวกัน                            |

### กรณีที่ maintainer ต้อง review เอง

- [x] ผู้แก้ไขผ่าน GitHub **ไม่ใช่** owner หรือ co-owner ของโดเมนที่แก้ไข
    > ระบบจะ tag ``@aitji`` อัตโนมัติ
- [x] มีการแก้ไขไฟล์นอก ``domains/`` directory
- [ ] มีการแก้ไขหลาย ``domains``

## ชื่อที่สงวนไว้ (Reserved Names)

ชื่อต่อไปนี้ไม่สามารถลงทะเบียนได้ เนื่องจากถูกใช้งานโดยระบบหรือสงวนไว้สำหรับอนาคต

```
council, pr, go, api, status, www, mail, ftp, admin, root,
dev, staging, test, beta, help, docs, support, abuse, tos,
static, cdn, assets, img, media, ns, dns, demo, example
```

หากต้องการชื่อที่ไม่อยู่ในรายการแต่อาจเกิด conflict กับระบบ ให้ติดต่อ maintainer ก่อน

## ข้อกำหนดการใช้งาน

อ่านรายละเอียดเต็มได้ที่ [thatako.net/subdomain/tos](https://thatako.net/subdomain/tos)

สรุปสั้น ๆ:

- [x] ใช้สำหรับโปรเจกต์ส่วนตัว พอร์ตโฟลิโอ งานการเรียน
- [x] ใช้งานได้จากที่ไหนก็ได้
- [ ] **ห้าม**เนื้อหา NSFW, ผิดกฎหมาย, Phishing, Malware
- [ ] **ห้าม**แก้ไข subdomain ของผู้อื่นโดยไม่ได้รับอนุญาต

## รายงาน Abuse

พบการใช้งานที่ไม่เหมาะสม?

- หน้า Abuse: [thatako.net/subdomain/abuse](https://thatako.net/subdomain/abuse)
- GitHub Issues: [เปิด Abuse Report](https://github.com/aitji/id.thatako.net/issues/new?template=abuse.md)
- Email: [aitji@duck.com](mailto:aitji@duck.com)


## Issue Templates

| Template | ใช้เมื่อ |
| -------- | ----- |
| [รายงาน Abuse](https://github.com/aitji/id.thatako.net/issues/new?template=abuse.md) | พบ subdomain ที่ใช้งานไม่เหมาะสม                   |
| [รายงานปัญหาระบบ](https://github.com/aitji/id.thatako.net/issues/new?template=bug.md) | หน้าเว็บ register, DNS ไม่ deploy, หรือระบบผิดปกติ |
| [อุทธรณ์การระงับ](https://github.com/aitji/id.thatako.net/issues/new?template=appeal.md) | subdomain ถูกระงับโดยไม่มีเหตุผล |


## ติดต่อ / Maintainer

- GitHub: [aitji](https://github.com/aitji)
- Email: [aitji@duck.com](mailto:aitji@duck.com) ``แนะนำ``
- Discord: [aitji](https://aitji.is-a.dev/discord)

```
©2026 thatako.net™ Licensed under the Mozilla Public License 2.0 (MPL-2.0).

Service      : id.thatako.net
Part of      : thatako.net infrastructure
Maintainer   : aitji
Last updated : Mar 2026
```
