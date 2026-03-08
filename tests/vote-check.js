import { readFileSync } from 'fs'

const {
    GITHUB_TOKEN,
    REPO,
    PR_NUMBER,
    COMMENT_AUTHOR,
    COMMENT_AUTHOR_ID,
    COMMENT_BODY,
} = process.env

const commentAuthorId = Number(COMMENT_AUTHOR_ID)

const MAINTAINER_ID = 100911929
const MAINTAINER = 'aitji'
const VOTE_SENTINEL = '<!-- thatako-vote -->'

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

async function postComment(body) {
    const r = await ghPost(`/repos/${REPO}/issues/${PR_NUMBER}/comments`, { body })
    if (r.message) console.error('postComment err:', r.message)
}

async function closePR() {
    const r = await ghPatch(`/repos/${REPO}/pulls/${PR_NUMBER}`, { state: 'closed' })
    if (r.message) console.error('closePR err:', r.message)
    else console.log('pr closed')
}

async function removeLabel(label) {
    await fetch(`https://api.github.com/repos/${REPO}/issues/${PR_NUMBER}/labels/${encodeURIComponent(label)}`, {
        method: 'DELETE',
        headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'thatako-pr-bot' },
    })
}

async function getFileOnMain(path) {
    const r = await ghGet(`/repos/${REPO}/contents/${path}?ref=main`)
    if (r.message) return null
    return { sha: r.sha, content: Buffer.from(r.content, 'base64').toString('utf8') }
}

async function commitFileToMain(path, content, message, existingSha) {
    const body = { message, content: Buffer.from(content).toString('base64'), branch: 'main' }
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

// find the vote comment and parse embedded owner data + pr author
async function getVoteComment() {
    const comments = await ghGet(`/repos/${REPO}/issues/${PR_NUMBER}/comments?per_page=100`)
    if (!Array.isArray(comments)) return null
    return comments.find(c => c.body && c.body.includes(VOTE_SENTINEL)) || null
}

function parseVoteComment(body) {
    // extract owner-data from embedded base64 comment
    const ownerMatch = body.match(/<!-- owner-data:([A-Za-z0-9+/=]+) -->/)
    const authorMatch = body.match(/<!-- pr-author:([a-zA-Z0-9\-]+) -->/)
    if (!ownerMatch || !authorMatch) return null
    try {
        const owners = JSON.parse(Buffer.from(ownerMatch[1], 'base64').toString('utf8'))
        return { owners, prAuthor: authorMatch[1] }
    } catch {
        return null
    }
}

async function editComment(commentId, newBody) {
    await fetch(`https://api.github.com/repos/${REPO}/issues/comments/${commentId}`, {
        method: 'PATCH',
        headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json', 'User-Agent': 'thatako-pr-bot' },
        body: JSON.stringify({ body: newBody }),
    })
}

// get pr files to commit on approval
async function getPRFiles() {
    const r = await ghGet(`/repos/${REPO}/pulls/${PR_NUMBER}/files?per_page=100`)
    if (!Array.isArray(r)) return []
    return r
}

; (async () => {
    if (!COMMENT_BODY || !COMMENT_AUTHOR_ID) { console.log('missing env, skip'); process.exit(0) }

    const vote = COMMENT_BODY.trim().toLowerCase()

    // only act on yes/no - ignore everything else silently
    if (vote !== 'yes' && vote !== 'no') { console.log('not a vote, skip'); process.exit(0) }

    const voteComment = await getVoteComment()
    if (!voteComment) { console.log('no vote comment found on this pr, skip'); process.exit(0) }

    const parsed = parseVoteComment(voteComment.body)
    if (!parsed) { console.log('vote comment malformed, skip'); process.exit(0) }

    const { owners, prAuthor } = parsed

    // security: validate voter by github-id only - not username (usernames can change)
    const isValidOwner = owners.some(o => Number(o.id) === commentAuthorId)
    if (!isValidOwner) {
        console.log(`@${COMMENT_AUTHOR} (id:${commentAuthorId}) is not a verified owner, ignoring vote`)
        // don't leak info - just silently skip, no comment
        process.exit(0)
    }

    console.log(`valid owner vote from @${COMMENT_AUTHOR} (id:${commentAuthorId}): ${vote}`)

    if (vote === 'no') {
        await editComment(voteComment.id,
            voteComment.body + `\n\n---\n**@${COMMENT_AUTHOR} voted ❌ no** - closing pr.`
        )
        await postComment(
            `## [❌] owner rejected changes\n\n` +
            `@${COMMENT_AUTHOR} rejected the edit by @${prAuthor}. closing pr.`
        )
        await removeLabel('pending: owner vote')
        await closePR()
        process.exit(0)
        return
    }

    // vote === 'yes' - commit files and close pr
    console.log(`owner approved - committing files`)

    const prFiles = await getPRFiles()
    const VALID_FILE_RE = /^domains\/[a-z0-9][a-z0-9\-]{0,61}[a-z0-9]?\.id\.thatako\.net\.json$/

    // get pr head sha to read file contents
    const pr = await ghGet(`/repos/${REPO}/pulls/${PR_NUMBER}`)
    if (!pr || !pr.head) {
        await postComment(`## [❌] commit failed\n\nfailed to get pr head info. @${MAINTAINER} check logs.`)
        process.exit(1)
        return
    }
    const headSha = pr.head.sha

    const syncChanges = []
    let commitFailed = false

    for (const f of prFiles) {
        if (!VALID_FILE_RE.test(f.filename)) continue

        try {
            if (f.status === 'removed') {
                const existing = await getFileOnMain(f.filename)
                if (existing) {
                    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${f.filename}`, {
                        method: 'DELETE',
                        headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json', 'User-Agent': 'thatako-pr-bot' },
                        body: JSON.stringify({ message: `domains: remove ${f.filename} by @${prAuthor} approved by @${COMMENT_AUTHOR} via pr #${PR_NUMBER} [bot]`, sha: existing.sha, branch: 'main' }),
                    })
                    const r = await res.json()
                    if (r.message) { console.error('deleteFile err:', r.message); commitFailed = true }
                    else { console.log('deleted:', f.filename); syncChanges.push({ action: 'delete', file: f.filename, data: { domain: f.filename.replace('domains/', '').replace('.json', '') } }) }
                }
            } else {
                // fetch file content from pr head
                const fileRes = await ghGet(`/repos/${REPO}/contents/${f.filename}?ref=${headSha}`)
                if (!fileRes || !fileRes.content) { console.error('fetch file err:', f.filename); commitFailed = true; continue }
                const content = Buffer.from(fileRes.content, 'base64').toString('utf8')

                let data
                try { data = JSON.parse(content) } catch { console.error('parse err:', f.filename); commitFailed = true; continue }

                const existing = await getFileOnMain(f.filename)
                const action = existing ? 'update' : 'add'
                const result = await commitFileToMain(
                    f.filename,
                    content,
                    `domains: ${action} ${f.filename} by @${prAuthor} approved by @${COMMENT_AUTHOR} via pr #${PR_NUMBER} [bot]`,
                    existing?.sha
                )
                if (!result.content) { commitFailed = true; continue }
                syncChanges.push({ action, file: f.filename, data })
            }
        } catch (e) {
            console.error(`commit threw for ${f.filename}:`, e.message)
            commitFailed = true
        }
    }

    if (commitFailed) {
        await postComment(`## [❌] commit failed\n\nowner approved but commit to main failed. @${MAINTAINER} check action logs.`)
        process.exit(1)
        return
    }

    // write sync_changes output for cloudflare step
    if (syncChanges.length > 0) {
        const output = process.env.GITHUB_OUTPUT
        if (output) {
            const { appendFileSync } = await import('fs')
            appendFileSync(output, `sync_changes=${JSON.stringify(syncChanges)}\n`)
            console.log('sync_changes written:', syncChanges.length, 'change(s)')
        }
    }

    await editComment(voteComment.id,
        voteComment.body + `\n\n---\n**@${COMMENT_AUTHOR} voted ✅ yes** - changes committed.`
    )
    await postComment(
        `## [✅] owner approved\n\n` +
        `@${COMMENT_AUTHOR} approved the edit by @${prAuthor}. ${prFiles.length} file(s) committed to main.\n` +
        `closing pr!`
    )
    await removeLabel('pending: owner vote')

    const r = await ghPatch(`/repos/${REPO}/pulls/${PR_NUMBER}`, { state: 'closed' })
    if (r.message) console.error('closePR err:', r.message)
    else console.log('pr closed')

    process.exit(0)
})().catch(e => {
    console.error('vote-check.js crashed:', e)
    process.exit(1)
})