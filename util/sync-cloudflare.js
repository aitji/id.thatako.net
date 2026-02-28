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

// flat list {type, content} ; domain payload
function flatRecord(records) {
    const flat = []
    for (const [type, val] of Object.entries(records)) {
        if (Array.isArray(val)) for (const v of val) flat.push({ type, content: v })
        else flat.push({ type, content: val })
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

    const desired = flatRecord(data.records || {})
    const existing = await listRecords(domainName)

    // match by type+content
    const handled = new Set()
    for (const want of desired) {
        const match = existing.find(e => e.type === want.type && !handled.has(e.id))
        if (match) {
            if (match.content !== want.content) {
                console.log(`  UPDATE ${want.type} → ${want.content}`)
                await updateRecord(match.id, want.type, domainName, want.content)
            } else console.log(`  OK     ${want.type} ${want.content}`)
            handled.add(match.id)
        } else {
            console.log(`  CREATE ${want.type} → ${want.content}`)
            await createRecord(want.type, domainName, want.content)
        }
    }

    // del reocrds
    for (const ex of existing) {
        if (!handled.has(ex.id)) {
            console.log(`  REMOVE ${ex.type} ${ex.content} (no longer in file)`)
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