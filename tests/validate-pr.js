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

// only domains/[sub].id.thatako.net.json - no traversal
const VALID_FILE_RE = /^domains\/[a-z0-9][a-z0-9\-]{0,61}[a-z0-9]?\.id\.thatako\.net\.json$/

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
        hints.push(`missing \`.json\` extension, it should be end with \`.json\``)
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
    const changedFiles = getChangedFiles()

    // strict: only domains/*.id.thatako.net.json allowed; everything else = unauthorized
    const domainFiles = changedFiles.filter(f => VALID_FILE_RE.test(f.file))
    const otherFiles = changedFiles.filter(f => !VALID_FILE_RE.test(f.file))

    const allLabels = []
    const allReasons = []
    let needsMaintainer = false

    if (otherFiles.length > 0) {
        allLabels.push('reason: unauthorized')
        for (const f of otherFiles) {
            const hint = getFilenameHint(f.file)
            allReasons.push(`invalid file path: \`${f.file}\`${hint}`)
        }
        needsMaintainer = true
    }

    for (const { status, file, renamed, oldFile } of domainFiles) {
        // surface rename, visible in review
        if (renamed) allReasons.push(`warning \`${file}\`: file was renamed from \`${oldFile}\`, make sure the \`domain\` field inside matches the new filename`)

        if (status === 'D') {
            const { isOwner } = isOwnerBase(file, authorId, BASE_SHA)
            if (!isOwner) {
                allLabels.push('reason: unauthorized')
                allReasons.push(`@${PR_AUTHOR} is not owner of \`${file}\`; cannot delete`)
                needsMaintainer = true
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
            allLabels.push('reason: unauthorized')
            allReasons.push(`@${PR_AUTHOR} (id:${authorId}) not listed as owner in \`${file}\` - make sure your \`github\` username and \`github-id\` are correct`)
            needsMaintainer = true
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
            allReasons.push(`\`${file}\`: ${errors.join('; ')}`)
            needsMaintainer = true
        }
        for (const w of warnings) allReasons.push(`warning \`${file}\`: ${w}`)
    }

    const uniqueLabels = [...new Set(allLabels)]

    // -- failed --
    if (needsMaintainer) {
        console.log('pr failed:', allReasons)

        try { if (uniqueLabels.length > 0) await addLabels(uniqueLabels) } catch (e) { console.error('addLabels threw:', e.message) }
        try { await requestReview(['aitji']) } catch (e) { console.error('requestReview threw:', e.message) }
        try {
            await requestChanges(
                `## [❌] automated validation failed\n\n` +
                `**labels:** ${uniqueLabels.map(l => `\`${l}\``).join(', ')}\n\n` +
                `**issues:**\n${allReasons.map(r => `- ${r}`).join('\n')}\n\n` +
                `assigned @aitji for manual review.`
            )
        } catch (e) { console.error('requestChanges threw:', e.message) }

        process.exit(1)
        return
    }

    // -- pass: commit each domain file to main; close pr --
    console.log(`pr valid; ${domainFiles.length} file(s) - committing to main`)

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