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
  - [ตัวอย่างตาม Provider](#ตัวอย่างตาม-provider)
    - [Vercel](#vercel)
    - [Netlify](#netlify)
    - [GitHub Pages](#github-pages)
    - [Custom Server (A Record)](#custom-server-a-record)
    - [IPv6 (AAAA)](#ipv6-aaaa)
    - [Email (MX)](#email-mx)
  - [หลาย records บนชื่อเดียวกัน](#หลาย-records-บนชื่อเดียวกัน)
  - [CNAME Conflict Rule](#cname-conflict-rule)
  - [ข้อควรระวังเรื่อง record name](#ข้อควรระวังเรื่อง-record-name)
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

ไม่ต้องแตะ GitHub repository เลย ทำทุกอย่างผ่านหน้าเว็บได้เลย

1. เข้า [thatako.net/subdomain/register](https://thatako.net/subdomain/register)
2. เข้าสู่ระบบด้วยบัญชี GitHub _(ใช้แค่ยืนยันตัวตน)_
3. ระบุชื่อ subdomain และเพิ่ม DNS records ตาม provider ที่ใช้
4. กด _"ลงทะเบียนโดเมน"_ ระบบจะ deploy DNS เข้า Cloudflare ทันที

> การ**แก้ไข**และ**ลบ**ก็ทำได้ผ่านหน้าเดียวกัน โดย owner และ co-owner สามารถเข้าจัดการโดเมนที่ตัวเองเป็นเจ้าของได้

### แก้ไขผ่าน GitHub โดยตรง (ขั้นสูง)

ทางเลือกนี้ไม่มี UI แก้ไข JSON เองและจัดการกับ _GitHub Actions bot_
แต่ถ้าไม่มี error ระบบจะ commit เข้า main และ deploy ให้อัตโนมัติเช่นกัน

> [!WARNING]
> แนะนำให้ใช้หน้าเว็บแทน วิธีนี้เหมาะสำหรับผู้ที่คุ้นเคยกับ git workflow เท่านั้น

1. Fork repository นี้แล้ว clone ลงเครื่อง
   ```bash
   git clone https://github.com/aitji/id.thatako.net.git
   ```
2. สร้างไฟล์ที่ `domains/[myname].id.thatako.net.json` ตาม format ด้านล่าง
3. เปิด Pull Request พร้อมระบุชื่อ subdomain ใน title เช่น `เพิ่ม: myname.id.thatako.net`
4. GitHub Actions จะตรวจสอบ ownership & JSON format อัตโนมัติ
5. ถ้าผ่าน bot จะ commit เข้า main, deploy DNS, แล้วปิด PR ให้เอง
   ถ้าไม่ผ่าน bot จะ request changes พร้อมระบุสาเหตุ แก้ไขแล้ว push ใหม่ได้เลย

## โครงสร้างไฟล์

```
id.thatako.net/
├── domains/
│   ├── myname.id.thatako.net.json    ← ไฟล์ subdomain แต่ละโดเมน
│   ├── portfolio.id.thatako.net.json
│   └── ...
└── README.md
```

ไฟล์แต่ละ subdomain เก็บอยู่ที่ `domains/[name].id.thatako.net.json`
โดย `name` ต้องตรงกับชื่อ subdomain ที่ต้องการ และต้องตรงกับ field `domain` ในไฟล์ด้วย

## DNS Record Format

ไฟล์ JSON มี schema ดังนี้

```jsonc
{
  "domain": "myname.id.thatako.net", // ชื่อ subdomain เต็ม
  "host": ["vercel"], // provider ที่ใช้
  "owner": [
    {
      // primary owner - คนแรก, มีอีเมลติดต่อ
      "github": "username",
      "github-id": 12345678, // หา id ได้ที่ api.github.com/users/<username>
      "email": "username@example.com",
    },
    // co-owners เพิ่มได้ไม่จำกัด, ไม่ต้องมี email
    // { "github": "...", "github-id": ..., "email": "" }
  ],
  "records": {
    // DNS records แยกตาม type ดูตัวอย่างแต่ละ provider ด้านล่าง
  },
}
```

| Field               | Type     | Description                                                        |
| ------------------- | -------- | ------------------------------------------------------------------ |
| `domain`            | string   | ชื่อ subdomain เต็ม เช่น `myname.id.thatako.net`                   |
| `host`              | string[] | provider ที่ใช้ เช่น `["vercel"]`                                  |
| `owner`             | object[] | รายชื่อ owner คนแรกคือ primary owner                               |
| `owner[].github`    | string   | GitHub username                                                    |
| `owner[].github-id` | number   | GitHub user ID (ตัวเลข) หาได้จาก `api.github.com/users/<username>` |
| `owner[].email`     | string   | Email ติดต่อ (optional สำหรับ co-owner)                            |
| `records`           | object   | DNS records แยกตาม type                                            |

> **หา GitHub ID:** เปิด `https://api.github.com/users/<username>` แล้วดูค่า `"id"`

## ตัวอย่างตาม Provider

### Vercel

Vercel ใช้ CNAME ชี้ไปที่ค่า `vercel-dns` ที่ได้จาก dashboard

**วิธีหาค่า CNAME จาก Vercel:**

1. เข้า Vercel dashboard → Project → Settings → Domains
2. กด Add → พิมพ์ `myname.id.thatako.net`
3. Vercel จะแสดงค่า CNAME ให้ เช่น `xxxxxxxxxxxxxxxx.vercel-dns-017.com.`

```jsonc
{
  "domain": "myname.id.thatako.net",
  "host": ["vercel"],
  "owner": [
    {
      "github": "username",
      "github-id": 12345678,
      "email": "username@example.com",
    },
  ],
  "records": {
    "CNAME": [
      {
        "name": "@",
        "value": "xxxxxxxxxxxxxxxx.vercel-dns-017.com.", // ค่าจาก Vercel dashboard (ต้องมี . ท้าย)
      },
    ],
  },
}
```

> [!TIP]
> ค่า CNAME ของแต่ละ project ไม่เหมือนกัน, ห้ามลอกจากตัวอย่างนี้
> ต้องเอาค่าจาก Vercel dashboard ของตัวเองเท่านั้น

### Netlify

Netlify ใช้ CNAME ชี้ไปที่ `<site-name>.netlify.app`

**วิธีหาค่า CNAME จาก Netlify:**

1. เข้า Netlify dashboard → Site → Domain management → Add custom domain
2. พิมพ์ `myname.id.thatako.net`
3. Netlify จะแสดง CNAME target ให้, ปกติคือ `<site-name>.netlify.app`

```jsonc
{
  "domain": "myname.id.thatako.net",
  "host": ["netlify"],
  "owner": [
    {
      "github": "username",
      "github-id": 12345678,
      "email": "username@example.com",
    },
  ],
  "records": {
    "CNAME": [
      {
        "name": "@",
        "value": "your-site-name.netlify.app.", // ชื่อ site ใน Netlify (ต้องมี . ท้าย)
      },
    ],
  },
}
```

> [!TIP]
> ชื่อ site ใน Netlify มักเป็น random เช่น `brave-curie-12345.netlify.app`, เช็คได้ที่ Site settings → General → Site details

### GitHub Pages

GitHub Pages ใช้ CNAME ชี้ไปที่ `<username>.github.io`

**วิธี setup:**

1. เปิด repository ที่จะ deploy → Settings → Pages → Custom domain
2. พิมพ์ `myname.id.thatako.net` แล้ว Save
3. GitHub จะสร้างไฟล์ `CNAME` ใน repository ให้อัตโนมัติอย่าลบไฟล์นี้

```jsonc
{
  "domain": "myname.id.thatako.net",
  "host": ["github-pages"],
  "owner": [
    {
      "github": "username",
      "github-id": 12345678,
      "email": "username@example.com",
    },
  ],
  "records": {
    "CNAME": [
      {
        "name": "@",
        "value": "username.github.io.", // GitHub username ของเจ้าของ repository (ต้องมี . ท้าย)
      },
    ],
  },
}
```

> [!TIP]
> ถ้า deploy จาก repository ชื่อ `username/project` ไม่ใช่ `username/username.github.io`
> ค่า CNAME ยังคงเป็น `username.github.io.` เหมือนเดิม, ไม่ต้องใส่ชื่อ repo

> [!WARNING]
> หลัง DNS propagate แล้ว ต้องกลับไปที่ Settings → Pages แล้วเปิด **Enforce HTTPS** ด้วย
> ถ้า GitHub ยังไม่ออก certificate ให้รอสักครู่แล้วลอง remove & re-add domain

### Custom Server (A Record)

ใช้เมื่อ deploy บนเซิร์ฟเวอร์ของตัวเอง มี IP address แน่นอน

```jsonc
{
  "domain": "myname.id.thatako.net",
  "host": ["custom"],
  "owner": [
    {
      "github": "username",
      "github-id": 12345678,
      "email": "username@example.com",
    },
  ],
  "records": {
    "A": [
      {
        "name": "@",
        "value": "1.2.3.4", // IP จริงของเซิร์ฟเวอร์
      },
    ],
  },
}
```

> [!TIP]
> ถ้าต้องการ verification token เพิ่ม (เช่น Google Search Console) ใส่ TXT record เพิ่มได้เลยในไฟล์เดียวกัน

### IPv6 (AAAA)

ใช้คู่กับ A record หรือใช้เดี่ยวก็ได้ถ้าเซิร์ฟเวอร์รองรับ IPv6

```jsonc
{
  // ...
  "records": {
    "AAAA": [
      {
        "name": "@",
        "value": "2001:db8::1", // IPv6 address ของเซิร์ฟเวอร์
      },
    ],
  },
}
```

### Email (MX)

ใช้เมื่อต้องการรับอีเมลที่ `@myname.id.thatako.net`

```jsonc
{
  // ...
  "records": {
    "MX": [
      {
        "name": "@",
        "value": "mail.example.com.", // mail server hostname (ต้องมี . ท้าย)
      },
    ],
  },
}
```

> [!CAUTION]
> MX record ต้องไม่อยู่ร่วมกับ CNAME บน `@` เดียวกัน เลือกอย่างใดอย่างหนึ่ง

## หลาย records บนชื่อเดียวกัน

สามารถใส่หลาย records ในไฟล์เดียวกันได้ โดยเพิ่ม object เข้าไปใน array

```jsonc
{
  // ...
  "records": {
    "A": [
      { "name": "@", "value": "1.2.3.4" },
      { "name": "www", "value": "1.2.3.4" }, // sub-label เช่น www.myname.id.thatako.net
    ],
    "TXT": [
      {
        "name": "@",
        "value": "v=spf1 include:example.com ~all",
      },
    ],
  },
}
```

## CNAME Conflict Rule

> [!CAUTION]
> CNAME **ไม่สามารถ**อยู่ร่วมกับ `A`, `AAAA` หรือ `MX` บน name เดียวกันได้
> ตามมาตรฐาน RFC 1912 ; GitHub Actions จะ fail validation ทันที

```jsonc
// [ผิด ❌] CNAME และ A บน "@" เดียวกัน
{
  "records": {
    "CNAME": [{ "name": "@", "value": "cname.example.com." }],
    "A":     [{ "name": "@", "value": "1.2.3.4" }] // conflict!
  }
}

// [ถูก ✅] แยก name ออกจากกัน
{
  "records": {
    "CNAME": [{ "name": "www", "value": "cname.example.com." }],
    "A":     [{ "name": "@",   "value": "1.2.3.4" }]
  }
}
```

## ข้อควรระวังเรื่อง record name

field `"name"` ใช้ได้แค่ **`@`** (root) หรือ **single label** (ไม่มีจุด) เท่านั้น
zone `.id.thatako.net` จะถูกเติมต่อท้ายให้อัตโนมัติ

| name ที่ใส่             | resolves เป็น                                 | ถูก/ผิด      |
| ----------------------- | --------------------------------------------- | ------------ |
| `@`                     | `myname.id.thatako.net`                       | ✅           |
| `www`                   | `www.myname.id.thatako.net`                   | ✅           |
| `api`                   | `api.myname.id.thatako.net`                   | ✅           |
| `myname.id`             | `myname.id.myname.id.thatako.net`             | ❌ zone ซ้อน |
| `myname.id.thatako.net` | `myname.id.thatako.net.myname.id.thatako.net` | ❌ zone ซ้อน |

> [!WARNING]
> ถ้า Vercel (หรือ provider อื่น) บอกให้ใส่ชื่อ record เป็น `myname.id` หรือ `myname.id.thatako.net`
> ให้ใส่เป็น `@` แทน, เพราะ subdomain นี้คือ root ของ zone อยู่แล้ว

## GitHub Actions Validation

เมื่อมี PR เข้ามา GitHub Actions จะตรวจสอบอัตโนมัติก่อน merge

### สิ่งที่ตรวจสอบ

| การตรวจสอบ      | รายละเอียด                                                 |
| --------------- | ---------------------------------------------------------- |
| JSON format     | ไฟล์ต้องเป็น valid JSON ตาม schema                         |
| ชื่อโดเมน       | ต้องตรงกับชื่อไฟล์ และลงท้ายด้วย `.id.thatako.net`         |
| ชื่อ subdomain  | ใช้ได้เฉพาะ `a-z`, `0-9`, `-` - ห้ามขึ้นหรือลงท้ายด้วย `-` |
| Reserved names  | ชื่อที่สงวนไว้จะไม่ผ่าน validation                         |
| Owner field     | ต้องมี `github` & `github-id` ครบ                          |
| Ownership check | ผู้แก้ไขต้องเป็น owner หรือ co-owner ของโดเมนนั้น          |
| CNAME conflict  | CNAME ต้องไม่อยู่ร่วมกับ A/AAAA/MX บน name เดียวกัน        |
| Record name     | name ต้องเป็น `@` หรือ single label - ไม่มีจุด             |

### กรณีที่ maintainer ต้อง review เอง

- [x] ผู้แก้ไขผ่าน GitHub **ไม่ใช่** owner หรือ co-owner ของโดเมนที่แก้ไข → ระบบ tag `@aitji` อัตโนมัติ
- [x] มีการแก้ไขไฟล์นอก `domains/` directory

## ชื่อที่สงวนไว้ (Reserved Names)

ชื่อต่อไปนี้ไม่สามารถลงทะเบียนได้ เนื่องจากถูกใช้งานโดยระบบหรือสงวนไว้สำหรับอนาคต

```
council, pr, go, api, status, www, mail, ftp, admin, root,
dev, staging, test, beta, help, docs, support, abuse, tos,
static, cdn, assets, img, media, ns, dns, demo, example
```

หากต้องการชื่อที่ไม่อยู่ในรายการแต่อาจ conflict กับระบบ ให้ติดต่อ maintainer ก่อน

## ข้อกำหนดการใช้งาน

อ่านรายละเอียดเต็มได้ที่ [thatako.net/subdomain/tos](https://thatako.net/subdomain/tos)

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

| Template                                                                                 | ใช้เมื่อ                                           |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------- |
| [รายงาน Abuse](https://github.com/aitji/id.thatako.net/issues/new?template=abuse.md)     | พบ subdomain ที่ใช้งานไม่เหมาะสม                   |
| [รายงานปัญหาระบบ](https://github.com/aitji/id.thatako.net/issues/new?template=bug.md)    | หน้าเว็บ register, DNS ไม่ deploy, หรือระบบผิดปกติ |
| [อุทธรณ์การระงับ](https://github.com/aitji/id.thatako.net/issues/new?template=appeal.md) | subdomain ถูกระงับโดยไม่มีเหตุผล                   |

## ติดต่อ / Maintainer

- GitHub: [aitji](https://github.com/aitji)
- Email: [aitji@duck.com](mailto:aitji@duck.com) `แนะนำ`
- Discord: [aitji](https://aitji.is-a.dev/discord)

```
©2026 thatako.net™ Licensed under the Mozilla Public License 2.0 (MPL-2.0).

Service      : id.thatako.net
Part of      : thatako.net infrastructure
Maintainer   : aitji
Last updated : Mar 2026
```
