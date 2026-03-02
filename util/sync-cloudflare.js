const CF_BASE = 'https://api.cloudflare.com/client/v4'
const ALLOWED_ZONE = '.id.thatako.net'
const { CF_API_TOKEN, CF_ZONE_ID, CF_CHANGES } = process.env

if (!CF_API_TOKEN || !CF_ZONE_ID) {
    console.error('missing CF_API_TOKEN/CF_ZONE_ID')
    process.exit(1)
}

const changes = JSON.parse(CF_CHANGES || '[]')
if (changes.length === 0) {
    console.log('nothing to sync')
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
    const data = await res.json()
    if (!data.success && method !== 'DELETE') {
        console.error(`cf error [${method} ${path}]:`, JSON.stringify(data.errors))
        throw new Error(data.errors?.[0]?.message || 'cloudflare api error')
    }
    return data
}

// records
async function listRecords(name) {
    const r = await cfFetch(`/zones/${CF_ZONE_ID}/dns_records?name=${encodeURIComponent(name)}&per_page=100`, 'GET')
    return r.result || []
}
async function createRecord(type, name, content, proxied = false) {
    return cfFetch(`/zones/${CF_ZONE_ID}/dns_records`, 'POST', { type, name, content, proxied, ttl: 1 })
}
async function updateRecord(id, type, name, content) {
    return cfFetch(`/zones/${CF_ZONE_ID}/dns_records/${id}`, 'PATCH', { type, name, content, ttl: 1 })
}
async function deleteRecord(id) {
    return cfFetch(`/zones/${CF_ZONE_ID}/dns_records/${id}`, 'DELETE')
}


// record FQDN under the reg domain
// only allows @ (root)
function resolveRecordName(rawName, domainFqdn) {
    if (!rawName || rawName === '@') return domainFqdn
    if (rawName.includes('.')) throw new Error(`record name "${rawName}" contains dots, zone escape blocked`)

    const resolved = `${rawName}.${domainFqdn}`
    if (!resolved.endsWith(ALLOWED_ZONE) && !resolved.endsWith(ALLOWED_ZONE + '.')) throw new Error(`resolved record name "${resolved}" outside allowed zone`)

    return resolved
}

// flat list of {type, name, content} from domain payload
function flatRecord(records, domainName) {
    const domain = domainName.replace(/\.$/, '')
    if (!domain.endsWith(ALLOWED_ZONE)) throw new Error(`domain "${domain}" not in allowed zone ${ALLOWED_ZONE}`)

    const flat = []
    for (const [type, val] of Object.entries(records)) {
        const values = Array.isArray(val) ? val : [val]
        for (const v of values) {
            if (typeof v === 'object' && v !== null) {
                if (!v.value) continue
                const recordName = resolveRecordName(v.name || '@', domain)
                flat.push({ type, name: recordName, content: v.value })
            } else {
                if (!v) continue
                flat.push({ type, name: domain, content: v })
            }
        }
    }
    return flat
}

function checkConflicts(desired) {
    const byName = {}
    for (const r of desired) {
        if (!byName[r.name]) byName[r.name] = []
        byName[r.name].push(r.type)
    }
    for (const [name, types] of Object.entries(byName)) {
        const hasCNAME = types.includes('CNAME')
        const hasA = types.includes('A') || types.includes('AAAA')
        if (hasCNAME && hasA) {
            throw new Error(`conflict: CNAME + A/AAAA on "${name}" - remove one`)
        }
    }
}

async function processChange({ action, data }) {
    if (!data) return
    const domainName = data.domain
    console.log(`\n-- ${action.toUpperCase()} ${domainName}`)

    // domain-level zone check before touching cf
    if (!domainName.endsWith(ALLOWED_ZONE)) throw new Error(`domain "${domainName}" outside allowed zone - skipped`)

    if (action === 'delete') {
        const existing = await listRecords(domainName)
        for (const r of existing) {
            console.log(`  delete ${r.type} ${r.name} : ${r.content}`)
            await deleteRecord(r.id)
        }
        return
    }

    const desired = flatRecord(data.records || {}, domainName)
    checkConflicts(desired)

    const namesToCheck = [...new Set(desired.map(r => r.name))]
    const existing = []
    for (const n of namesToCheck) {
        // extra guard: each name query must stay in zone
        if (!n.endsWith(ALLOWED_ZONE) && !n.endsWith(ALLOWED_ZONE + '.')) throw new Error(`record name "${n}" outside allowed zone - abort`)
        existing.push(...await listRecords(n))
    }

    console.log(`  desired: ${desired.length} | existing: ${existing.length}`)

    // match by type+name
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

    // del records no longer in file
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
            console.error(`error: ${change?.data?.domain}:`, e.message)
            hasError = true
        }
    }
    process.exit(hasError ? 1 : 0)
})()