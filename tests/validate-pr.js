import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { validateDomainFile } from '../util/validate-domain.js'

const {
    GITHUB_TOKEN,
    PR_AUTHOR,
    PR_AUTHOR_ID,
    BASE_SHA,
    HEAD_SHA,
    PR_NUMBER,
    REPO,
} = process.env

const authorId = Number(PR_AUTHOR_ID)
// hoping i'm the only maintainer, so i don't need to touch this again ;p
const MAINTAINER_ID = 100911929
const MAINTAINER = 'aitji'

// only domains/[sub].id.thatako.net.json - no traversal
const VALID_FILE_RE = /^domains\/[a-z0-9][a-z0-9\-]{0,61}[a-z0-9]?\.id\.thatako\.net\.json$/

// bot-managed labels, cleared on each re-run
const REASON_LABELS = new Set([
    'reason: unauthorized',
    'reason: invalid file',
    'reason: impersonation',
    'reason: invalid records',
    'reason: incomplete pr',
    'pending: owner vote',
    'maintainer-bypass',
])

// github utils
async function ghPost(path, body) {
    const res = await fetch(`https://api.github.com${path}`, {
        method: 'POST',
        headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json', 'User-Agent': 'thatako-pr-bot' },
        body: JSON.stringify(body),
    })
    return res.json()
}

async function ghPatch(path, body) {
    const res = await fetch(`https://api.github.com${path}`, {
        method: 'PATCH',
        headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json', 'User-Agent': 'thatako-pr-bot' },
        body: JSON.stringify(body),
    })
    return res.json()
}

async function ghGet(path) {
    const res = await fetch(`https://api.github.com${path}`, {
        headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'thatako-pr-bot' },
    })
    return res.json()
}

async function addLabels(labels) {
    const r = await ghPost(`/repos/${REPO}/issues/${PR_NUMBER}/labels`, { labels })
    if (r.message) console.error('addLabels err:', r.message)
    else console.log('labels:', labels.join(', '))
}

async function clearBotLabels() {
    const current = await ghGet(`/repos/${REPO}/issues/${PR_NUMBER}/labels`)
    if (!Array.isArray(current)) { console.error('clearBotLabels: unexpected response', current); return }
    const toRemove = current.map(l => l.name).filter(n => REASON_LABELS.has(n))
    await Promise.all(toRemove.map(async label => {
        const res = await fetch(`https://api.github.com/repos/${REPO}/issues/${PR_NUMBER}/labels/${encodeURIComponent(label)}`, {
            method: 'DELETE',
            headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'thatako-pr-bot' },
        })
        if (res.status === 200 || res.status === 204) console.log('cleared label:', label)
        else console.error('clearBotLabels err for', label, res.status)
    }))
}

// rate limit
async function checkRateLimit() {
    if (authorId === MAINTAINER_ID) return { blocked: false, bypass: true }
    const prs = await ghGet(`/repos/${REPO}/pulls?state=open&per_page=100`)
    if (!Array.isArray(prs)) return { blocked: false }
    const existing = prs.filter(p => Number(p.user.id) === authorId && String(p.number) !== String(PR_NUMBER))
    if (existing.length > 0) return { blocked: true, prNumbers: existing.map(p => p.number) }
    return { blocked: false }
}

// post or edit the vote comment; found by sentinel
const VOTE_SENTINEL = '<!-- thatako-vote -->'
async function upsertVoteComment(body) {
    const comments = await ghGet(`/repos/${REPO}/issues/${PR_NUMBER}/comments?per_page=100`)
    if (Array.isArray(comments)) {
        const existing = comments.find(c => c.body && c.body.includes(VOTE_SENTINEL))
        if (existing) {
            await fetch(`https://api.github.com/repos/${REPO}/issues/comments/${existing.id}`, {
                method: 'PATCH',
                headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json', 'User-Agent': 'thatako-pr-bot' },
                body: JSON.stringify({ body }),
            })
            return
        }
    }
    await ghPost(`/repos/${REPO}/issues/${PR_NUMBER}/comments`, { body })
}

async function requestReview(reviewers) {
    const r = await ghPost(`/repos/${REPO}/pulls/${PR_NUMBER}/requested_reviewers`, { reviewers })
    if (r.message) console.error('requestReview err:', r.message)
}

async function requestChanges(body) {
    const r = await ghPost(`/repos/${REPO}/pulls/${PR_NUMBER}/reviews`, { event: 'REQUEST_CHANGES', body })
    if (r.message) console.error('requestChanges err:', r.message)
}

async function postComment(body) {
    const r = await ghPost(`/repos/${REPO}/issues/${PR_NUMBER}/comments`, { body })
    if (r.message) console.error('postComment err:', r.message)
}

async function closePR() {
    const r = await ghPatch(`/repos/${REPO}/pulls/${PR_NUMBER}`, { state: 'closed' })
    if (r.message) console.error('closePR err:', r.message)
    else console.log('pr closed')
}

async function getFileOnMain(path) {
    const r = await ghGet(`/repos/${REPO}/contents/${path}?ref=main`)
    if (r.message) return null
    return { sha: r.sha, content: Buffer.from(r.content, 'base64').toString('utf8') }
}

async function commitFileToMain(path, content, message, existingSha) {
    const body = {
        message,
        content: Buffer.from(content).toString('base64'),
        branch: 'main',
    }
    if (existingSha) body.sha = existingSha
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
        method: 'PUT',
        headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json', 'User-Agent': 'thatako-pr-bot' },
        body: JSON.stringify(body),
    })
    const r = await res.json()
    if (r.message) console.error('commitFile err:', r.message)
    else console.log('committed:', path)
    return r
}



function getChangedFiles() {
    const raw = execSync(`git diff --name-status ${BASE_SHA} ${HEAD_SHA}`, { encoding: 'utf8' })
    return raw.trim().split('\n').filter(Boolean).map(line => {
        const parts = line.split(/\s+/)
        const statusRaw = parts[0]

        // (Rename) treat as A
        if (statusRaw.startsWith('R')) return {
            status: 'A',
            file: parts[2],
            oldFile: parts[1],
            renamed: true
        }

        // (Copy) treat as A
        if (statusRaw.startsWith('C')) return {
            status: 'A',
            file: parts[2],
            oldFile: parts[1],
            copied: true
        }

        return { status: statusRaw, file: parts[1] }
    })
}

function isOwnerBase(file, authorId, baseSha) {
    try {
        const raw = execSync(`git show ${baseSha}:${file}`, { encoding: 'utf8' })
        const data = JSON.parse(raw)
        const isOwner = Array.isArray(data.owner) && data.owner.some(o => Number(o['github-id']) === authorId)
        return { isOwner, existingData: data }
    } catch {
        return { isOwner: true, existingData: null } // new file - ok
    }
}

// hint for common file-mistakes
function getFilenameHint(file) {
    const hints = []

    if (!file.endsWith('.json'))
        hints.push(`missing \`.json\` extension, it should end with \`.json\``)
    if (!file.startsWith('domains/'))
        hints.push(`file must be inside the \`domains/\` folder`)
    if (!file.includes('.id.thatako.net'))
        hints.push(`domain zone must be \`.id.thatako.net\`, e.g. \`domains/yourname.id.thatako.net.json\``)
    if (/[A-Z]/.test(file))
        hints.push(`filename must be all lowercase`)
    if (file.includes('..') || file.includes('/./'))
        hints.push(`path traversal detected`)

    return hints.length > 0 ? ` (hint: ${hints.join('; ')})` : ''
}

// main
; (async () => {
    await clearBotLabels()

    // rate limit check
    const rateLimit = await checkRateLimit()
    if (rateLimit.blocked) {
        await addLabels(['reason: unauthorized'])
        await requestChanges(
            `## [❌] rate limited\n\n` +
            `@${PR_AUTHOR} you already have open pr(s): ${rateLimit.prNumbers.map(n => `#${n}`).join(', ')}\n\n` +
            `please close your existing pr before opening a new one.`
        )
        process.exit(1)
        return
    }
    if (rateLimit.bypass) {
        // maintainer bypass - warn but continue
        try { await addLabels(['maintainer-bypass']) } catch { }
        try { await postComment(`> ⚠️ maintainer bypass: @${MAINTAINER} has multiple open prs, proceeding anyway`) } catch { }
    }

    const changedFiles = getChangedFiles()

    // strict: only domains/*.id.thatako.net.json allowed; everything else = unauthorized
    const domainFiles = changedFiles.filter(f => VALID_FILE_RE.test(f.file))
    const otherFiles = changedFiles.filter(f => !VALID_FILE_RE.test(f.file))

    const allLabels = []
    const allReasons = []
    let needsMaintainer = false

    // collect impersonation
    const impersonationTargets = {}

    if (otherFiles.length > 0) {
        allLabels.push('reason: unauthorized')
        for (const f of otherFiles) {
            const hint = getFilenameHint(f.file)
            allReasons.push(`invalid file path: \`${f.file}\`${hint}`)
        }
        needsMaintainer = true
    }

    // warn if pr touches files from multiple distinct owner sets
    const ownerSets = []
    for (const { file, status } of domainFiles) {
        if (status === 'D') continue
        try {
            const data = JSON.parse(readFileSync(file, 'utf8'))
            if (Array.isArray(data.owner)) ownerSets.push({ file, ids: data.owner.map(o => o['github-id']) })
        } catch { }
    }
    if (ownerSets.length > 1) {
        const allIds = ownerSets.map(s => s.ids.join(','))
        const distinct = new Set(allIds)
        if (distinct.size > 1) allReasons.push(`⚠️ warning: this pr touches files owned by different users - each file should be in its own pr`)
    }

    for (const { status, file, renamed, oldFile } of domainFiles) {
        if (renamed) allReasons.push(`warning \`${file}\`: file was renamed from \`${oldFile}\`, make sure the \`domain\` field inside matches the new filename`)

        if (status === 'D') {
            const { isOwner } = isOwnerBase(file, authorId, BASE_SHA)
            if (!isOwner) {
                // is file has owners on base to trigger vote
                const { existingData } = isOwnerBase(file, -1, BASE_SHA)
                if (existingData && Array.isArray(existingData.owner) && existingData.owner.length > 0) {
                    impersonationTargets[file] = { owners: existingData.owner, fileData: existingData }
                } else {
                    allLabels.push('reason: unauthorized')
                    allReasons.push(`@${PR_AUTHOR} is not owner of \`${file}\`; cannot delete`)
                    needsMaintainer = true
                }
            }
            continue
        }

        let data
        try { data = JSON.parse(readFileSync(file, 'utf8')) }
        catch (e) {
            allLabels.push('reason: invalid file')
            allReasons.push(`\`${file}\`: json parse failed, ${e.message}`)
            needsMaintainer = true
            continue
        }

        const isOwner = Array.isArray(data.owner) && data.owner.some(o => Number(o['github-id']) === authorId && o.github === PR_AUTHOR)
        if (!isOwner) {
            // not listed as owner - trigger owner vote
            const { existingData } = isOwnerBase(file, -1, BASE_SHA)
            const owners = existingData?.owner || data.owner || []
            if (Array.isArray(owners) && owners.length > 0) {
                impersonationTargets[file] = { owners, fileData: existingData || data }
            } else {
                allLabels.push('reason: unauthorized')
                allReasons.push(`@${PR_AUTHOR} (id:${authorId}) not listed as owner in \`${file}\` - make sure your \`github\` username and \`github-id\` are correct`)
                needsMaintainer = true
            }
            continue
        }

        if (status === 'M') {
            const { isOwner: wasOwner } = isOwnerBase(file, authorId, BASE_SHA)
            if (!wasOwner) {
                allLabels.push('reason: impersonation')
                allReasons.push(`@${PR_AUTHOR} added themselves as owner in \`${file}\`, self-authorization on existing files is not allowed`)
                needsMaintainer = true
                continue
            }
        }

        const { errors, warnings } = validateDomainFile(data, file)
        if (errors.length > 0) {
            for (const err of errors) {
                const match = err.match(/reason: ([\w\s:]+)/)
                if (match) allLabels.push(match[1].trim())
            }
            allReasons.push(`\`${file}\`:\n${errors.map(e => `  - ${e}`).join('\n')}`)
            needsMaintainer = true
        }
        for (const w of warnings) allReasons.push(`warning \`${file}\`: ${w}`)
    }

    // -- owner vote required --
    if (Object.keys(impersonationTargets).length > 0 && !needsMaintainer) {
        console.log('impersonation detected - triggering owner vote')

        // collect all unique real owners across affected files (excluding the pr author)
        const ownerMap = {}
        for (const { owners } of Object.values(impersonationTargets)) {
            for (const o of owners) {
                const id = Number(o['github-id'])
                if (id !== authorId) ownerMap[id] = o.github
            }
        }
        const ownerMentions = Object.values(ownerMap).map(u => `@${u}`)
        const fileList = Object.keys(impersonationTargets).map(f => `\`${f}\``)
        const expiresDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

        // embed owner ids in sentinel for vote-check.js to read - do not remove
        const ownerData = JSON.stringify(Object.entries(ownerMap).map(([id, login]) => ({ id: Number(id), login })))

        const voteBody =
            `${VOTE_SENTINEL}\n` +
            `<!-- owner-data:${Buffer.from(ownerData).toString('base64')} -->\n` +
            `<!-- pr-author:${PR_AUTHOR} -->\n\n` +
            `## [⚠️] unauthorized edit - owner approval required\n\n` +
            `@${PR_AUTHOR} is not listed as an owner of the following file(s):\n` +
            `${fileList.map(f => `- ${f}`).join('\n')}\n\n` +
            `${ownerMentions.join(', ')} - your domain file(s) were edited by @${PR_AUTHOR}. do you approve this change?\n\n` +
            `**reply with one of:**\n` +
            `- \`yes\` - approve & merge the change\n` +
            `- \`no\` - reject & close this pr\n\n` +
            `> only verified owners (by github id) can vote. this pr will auto-close on **${expiresDate}** if no response.`

        try { await addLabels(['pending: owner vote']) } catch (e) { console.error('addLabels threw:', e.message) }
        try { await requestReview([MAINTAINER]) } catch (e) { console.error('requestReview threw:', e.message) }
        try { await requestChanges(`awaiting owner vote - see comment below`) } catch (e) { console.error('requestChanges threw:', e.message) }
        try { await upsertVoteComment(voteBody) } catch (e) { console.error('upsertVoteComment threw:', e.message) }

        process.exit(1)
        return
    }

    const uniqueLabels = [...new Set(allLabels)]

    // -- failed --
    if (needsMaintainer) {
        console.log('pr failed:', allReasons)

        try { if (uniqueLabels.length > 0) await addLabels(uniqueLabels) } catch (e) { console.error('addLabels threw:', e.message) }
        try { await requestReview([MAINTAINER]) } catch (e) { console.error('requestReview threw:', e.message) }
        try {
            await requestChanges(
                `## [❌] automated validation failed\n\n` +
                `**labels:** ${uniqueLabels.map(l => `\`${l}\``).join(', ')}\n\n` +
                `**issues:**\n${allReasons.map(r => `- ${r}`).join('\n')}\n\n` +
                `assigned @${MAINTAINER} for manual review.`
            )
        } catch (e) { console.error('requestChanges threw:', e.message) }

        process.exit(1)
        return
    }

    // -- pass: commit each domain file to main; close pr --
    console.log(`pr valid; ${domainFiles.length} file(s) - committing to main`)

    const syncChanges = []
    for (const { status, file } of domainFiles) {
        let action
        if (status === 'A') action = 'create'
        else if (status === 'M') action = 'update'
        else if (status === 'D') action = 'delete'
        else continue

        let data = null
        if (action !== 'delete') {
            try { data = JSON.parse(readFileSync(file, 'utf8')) } catch { continue }
        } else {
            data = { domain: file.replace('domains/', '').replace('.json', '') }
        }

        syncChanges.push({ action, file, data })
    }

    let commitFailed = false
    for (const { status, file } of domainFiles) {
        try {
            if (status === 'D') {
                const existing = await getFileOnMain(file)
                if (existing) {
                    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${file}`, {
                        method: 'DELETE',
                        headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json', 'User-Agent': 'thatako-pr-bot' },
                        body: JSON.stringify({ message: `domains: remove ${file} by @${PR_AUTHOR} via pr #${PR_NUMBER} [bot]`, sha: existing.sha, branch: 'main' }),
                    })
                    const r = await res.json()
                    if (r.message) { console.error('deleteFile err:', r.message); commitFailed = true }
                    else console.log('deleted:', file)
                }
            } else {
                const content = readFileSync(file, 'utf8')
                const existing = await getFileOnMain(file)
                const action = existing ? 'update' : 'add'
                const result = await commitFileToMain(
                    file,
                    content,
                    `domains: ${action} ${file} by @${PR_AUTHOR} via pr #${PR_NUMBER} [bot]`,
                    existing?.sha
                )
                if (!result.content) commitFailed = true
            }
        } catch (e) {
            console.error(`commit threw for ${file}:`, e.message)
            commitFailed = true
        }
    }

    if (commitFailed) {
        await postComment(`## [❌] commit failed\n\nvalidation passed but commit to main failed. @aitji check action logs.`)
        process.exit(1)
        return
    }

    if (syncChanges.length > 0) {
        const output = process.env.GITHUB_OUTPUT
        if (output) {
            const { appendFileSync } = await import('fs')
            appendFileSync(output, `sync_changes=${JSON.stringify(syncChanges)}\n`)
            console.log('sync_changes written to output:', syncChanges.length, 'change(s)')
        }
    }

    try {
        await postComment(
            `## [✅] automated validation passed\n\n` +
            `${domainFiles.length} file(s) validated & committed to main.\n` +
            `closing pr!`
        )
    } catch (e) { console.error('postComment threw:', e.message) }

    try { await closePR() } catch (e) { console.error('closePR threw:', e.message) }

    process.exit(0)
})().catch(e => {
    console.error('validate-pr.js crashed:', e)
    process.exit(1)
})