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
    if (r.message) console.error('  addLabels error:', r.message)
    else console.log('  labels applied:', labels.join(', '))
}

async function requestReview(reviewers) {
    const r = await ghPost(`/repos/${REPO}/pulls/${PR_NUMBER}/requested_reviewers`, { reviewers })
    if (r.message) console.error('  requestReview error:', r.message)
    else console.log('  review requested from:', reviewers.join(', '))
}

async function requestChanges(body) {
    const r = await ghPost(`/repos/${REPO}/pulls/${PR_NUMBER}/reviews`, { event: 'REQUEST_CHANGES', body })
    if (r.message) console.error('  requestChanges error:', r.message)
    else console.log('  changes requested')
}

async function postComment(body) {
    const r = await ghPost(`/repos/${REPO}/issues/${PR_NUMBER}/comments`, { body })
    if (r.message) console.error('  postComment error:', r.message)
}

async function closePR() {
    const r = await ghPatch(`/repos/${REPO}/pulls/${PR_NUMBER}`, { state: 'closed' })
    if (r.message) console.error('  closePR error:', r.message)
    else console.log('  PR closed')
}

// get file content + sha from main (needed for github contents api update)
async function getFileOnMain(path) {
    const r = await ghGet(`/repos/${REPO}/contents/${path}?ref=main`)
    if (r.message) return null // file doesn't exist yet
    return { sha: r.sha, content: Buffer.from(r.content, 'base64').toString('utf8') }
}

// commit a single file directly to main via github contents api
async function commitFileToMain(path, content, message, existingSha) {
    const body = {
        message,
        content: Buffer.from(content).toString('base64'),
        branch: 'main',
    }
    if (existingSha) body.sha = existingSha // required for update

    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
        method: 'PUT',
        headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json', 'User-Agent': 'thatako-pr-bot' },
        body: JSON.stringify(body),
    })
    const r = await res.json()
    if (r.message) console.error('  commitFile error:', r.message)
    else console.log('  committed:', path)
    return r
}

// get changed files
function getChangedFiles() {
    const raw = execSync(`git diff --name-status ${BASE_SHA} ${HEAD_SHA}`, { encoding: 'utf8' })
    const files = []
    for (const line of raw.trim().split('\n').filter(Boolean)) {
        const [status, file] = line.split(/\s+/)
        files.push({ status, file })
    }
    return files
}

// utils helper
function isOwnerBase(file, authorId, baseSha) {
    try {
        const raw = execSync(`git show ${baseSha}:${file}`, { encoding: 'utf8' })
        const existingData = JSON.parse(raw)
        const isOwner = Array.isArray(existingData.owner) && existingData.owner.some(o => o['github-id'] === authorId)
        return { isOwner, existingData }
    } catch {
        // didn't exist in base (new file) ; that's OK
        return { isOwner: true, existingData: null }
    }
}

// main
; (async () => {
    const changedFiles = getChangedFiles()
    const domainFiles = changedFiles.filter(f => f.file.startsWith('domains/') && f.file.endsWith('.json'))
    const otherFiles = changedFiles.filter(f => !f.file.startsWith('domains/'))

    const allLabels = []
    const allReasons = []
    let needsMaintainer = false

    // edits outside domains/
    if (otherFiles.length > 0) {
        allLabels.push('reason: unauthorized')
        allReasons.push(`PR modifies files outside domains/: ${otherFiles.map(f => f.file).join(', ')}`)
        needsMaintainer = true
    }

    // each domain file
    for (const { status, file } of domainFiles) {
        if (status === 'D') {
            const { isOwner } = isOwnerBase(file, authorId, BASE_SHA)
            if (!isOwner) {
                allLabels.push('reason: unauthorized')
                allReasons.push(`@${PR_AUTHOR} is not an owner of ${file} and cannot delete it`)
                needsMaintainer = true
            }
            continue
        }

        let data
        try { data = JSON.parse(readFileSync(file, 'utf8')) }
        catch (e) {
            allLabels.push('reason: invalid file')
            allReasons.push(`${file}: could not parse JSON - ${e.message}`)
            continue
        }

        const isOwner = Array.isArray(data.owner) && data.owner.some(o => o['github-id'] === authorId && o.github === PR_AUTHOR)
        if (!isOwner) {
            allLabels.push('reason: unauthorized')
            allReasons.push(`@${PR_AUTHOR} (id:${authorId}) is not listed as an owner in ${file}`)
            needsMaintainer = true
            continue
        }

        if (status === 'M') {
            const { isOwner: wasOwner } = isOwnerBase(file, authorId, BASE_SHA)
            if (!wasOwner) {
                allLabels.push('reason: impersonation')
                allReasons.push(`@${PR_AUTHOR} added themselves as owner in ${file} ; cannot self-authorize`)
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
            allReasons.push(`${file}: ${errors.join('; ')}`)
            needsMaintainer = true
        }
        if (warnings.length > 0) for (const w of warnings) allReasons.push(`warning ${file}: ${w}`)
    }

    const uniqueLabels = [...new Set(allLabels)]

    // -- failed --
    if (needsMaintainer) {
        console.log('PR failed validation:', allReasons)

        try { if (uniqueLabels.length > 0) await addLabels(uniqueLabels) }
        catch (e) { console.error('addLabels threw:', e.message) }

        try { await requestReview(['aitji']) }
        catch (e) { console.error('requestReview threw:', e.message) }

        try {
            await requestChanges(
                `## [❌] Automated PR Validation Failed\n\n` +
                `**Labels applied:** ${uniqueLabels.map(l => `\`${l}\``).join(', ')}\n\n` +
                `**Issues found:**\n${allReasons.map(r => `- ${r}`).join('\n')}\n\n` +
                `This PR has been assigned to @aitji for manual review.`
            )
        } catch (e) { console.error('requestChanges threw:', e.message) }

        process.exit(1)
        return
    }

    // -- passed: commit each domain file directly to main, then close the PR --
    console.log(`PR validated successfully. ${domainFiles.length} domain file(s) OK. Committing to main...`)

    let commitFailed = false
    for (const { status, file } of domainFiles) {
        try {
            if (status === 'D') {
                // delete: need sha from main
                const existing = await getFileOnMain(file)
                if (existing) {
                    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${file}`, {
                        method: 'DELETE',
                        headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json', 'User-Agent': 'thatako-pr-bot' },
                        body: JSON.stringify({ message: `domains: remove ${file} by @${PR_AUTHOR} via PR #${PR_NUMBER} [bot]`, sha: existing.sha, branch: 'main' }),
                    })
                    const r = await res.json()
                    if (r.message) { console.error('  deleteFile error:', r.message); commitFailed = true }
                    else console.log('  deleted:', file)
                }
            } else {
                // add or update
                const content = readFileSync(file, 'utf8')
                const existing = await getFileOnMain(file)
                const action = existing ? 'update' : 'add'
                const result = await commitFileToMain(
                    file,
                    content,
                    `domains: ${action} ${file} by @${PR_AUTHOR} via PR #${PR_NUMBER} [bot]`,
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
        await postComment(`## [❌] Commit Failed\n\nValidation passed but committing to main failed. @aitji please check the action logs.`)
        process.exit(1)
        return
    }

    // close the PR with a comment
    try {
        await postComment(
            `## [✅] Automated Validation Passed\n\n` +
            `${domainFiles.length} domain file(s) validated and committed to [main] directly.\n` +
            `Closing this PR!`
        )
    } catch (e) { console.error('postComment threw:', e.message) }

    try { await closePR() }
    catch (e) { console.error('closePR threw:', e.message) }

    process.exit(0)
})().catch(e => {
    console.error('validate-pr.js crashed:', e)
    process.exit(1)
})