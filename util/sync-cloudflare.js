const CF_BASE = 'https://api.cloudflare.com/client/v4'
const { CF_API_TOKEN, CF_ZONE_ID } = process.env

if (!CF_API_TOKEN || !CF_ZONE_ID) {
    console.error('missing CF_API_TOKEN/CF_ZONE_ID')
    process.exit(1)
}

const changes = JSON.parse(process.argv[2] || '[]')
if (changes.length === 0) {
    console.log('nothing changes')
    process.exit(0)
}

async function cfFetch(path, method, body) {
    const res = await fetch(`${CF_BASE}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${CF_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    })

    return res.json()
}

// records
async function listRecords(name) {
    const r = await cfFetch(`/zones/${CF_ZONE_ID}/dns_records?name=${name}&per_page=100`, 'GET')
    return r.result || []
}
async function createRecord(type, name, content, proxied = false) { return cfFetch(`/zones/${CF_ZONE_ID}/dns_records`, 'POST', { type, name, content, proxied, ttl: 1 }) }
async function updateRecord(id, type, name, content) { return cfFetch(`/zones/${CF_ZONE_ID}/dns_records/${id}`, 'PATCH', { type, name, content, ttl: 1 }) }
async function deleteRecord(id) { return cfFetch(`/zones/${CF_ZONE_ID}/dns_records/${id}`, 'DELETE') }

// flat list {type, name, content} from domain payload
// CNAME/MX entries can be plain strings OR {name?, value} objects
// name is resolved to FQDN: "aitji.id" → "aitji.id.thatako.net"
function flatRecord(records, domainName) {
    const flat = []
    for (const [type, val] of Object.entries(records)) {
        const values = Array.isArray(val) ? val : [val]
        for (const v of values) {
            if (typeof v === 'object' && v !== null) {
                // {name?, value} — CNAME or MX from UI
                if (!v.value) continue // skip empty rows
                let recordName = domainName
                if (v.name) recordName = v.name.endsWith('.thatako.net') ? v.name : `${v.name}.thatako.net`
                flat.push({ type, name: recordName, content: v.value })
            } else {
                if (!v) continue
                flat.push({ type, name: domainName, content: v })
            }
        }
    }
    return flat
}

async function processChange({ action, data }) {
    if (!data) return
    const domainName = data.domain
    console.log(`\n-- ${action.toUpperCase()} ${domainName}`)

    if (action === 'delete') {
        const existing = await listRecords(domainName)
        for (const r of existing) {
            console.log(`  DELETE ${r.type} ${r.name} : ${r.content}`)
            await deleteRecord(r.id)
        }
        return
    }

    const desired = flatRecord(data.records || {}, domainName)
    const existing = await listRecords(domainName)

    // match by type+name+content
    const handled = new Set()
    for (const want of desired) {
        const match = existing.find(e => e.type === want.type && e.name === want.name && !handled.has(e.id))
        if (match) {
            if (match.content !== want.content) {
                console.log(`  UPDATE ${want.type} ${want.name} → ${want.content}`)
                await updateRecord(match.id, want.type, want.name, want.content)
            } else console.log(`  OK     ${want.type} ${want.name} ${want.content}`)
            handled.add(match.id)
        } else {
            console.log(`  CREATE ${want.type} ${want.name} → ${want.content}`)
            await createRecord(want.type, want.name, want.content)
        }
    }

    // del reocrds
    for (const ex of existing) {
        if (!handled.has(ex.id)) {
            console.log(`  REMOVE ${ex.type} ${ex.name} ${ex.content} (no longer in file)`)
            await deleteRecord(ex.id)
        }
    }
}

(async () => {
    let hasError = false
    for (const change of changes) {
        try { await processChange(change) }
        catch (e) {
            console.error(`Error processing ${change?.data?.domain}:`, e.message)
            hasError = true
        }
    }
    process.exit(hasError ? 1 : 0)
})()