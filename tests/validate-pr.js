import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { validateDomainFile } from '../util/validate-domain.js'

const {
    _TOKEN,
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
        headers: { Authorization: `token ${_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json', 'User-Agent': 'thatako-pr-bot' },
        body: JSON.stringify(body),
    })
    return res.json()
}

async function ghPatch(path, body) {
    const res = await fetch(`https://api.github.com${path}`, {
        method: 'PATCH',
        headers: { Authorization: `token ${_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json', 'User-Agent': 'thatako-pr-bot' },
        body: JSON.stringify(body),
    })
    return res.json()
}

async function addLabels(labels) { await ghPost(`/repos/${REPO}/issues/${PR_NUMBER}/labels`, { labels }) }
async function removeLabel(label) { await fetch(`https://api.github.com/repos/${REPO}/issues/${PR_NUMBER}/labels/${encodeURIComponent(label)}`, { method: 'DELETE', headers: { Authorization: `token ${_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'thatako-pr-bot' }, }) }
async function requestReview(reviewers) { await ghPost(`/repos/${REPO}/pulls/${PR_NUMBER}/requested_reviewers`, { reviewers }) }
async function postComment(body) { await ghPost(`/repos/${REPO}/issues/${PR_NUMBER}/comments`, { body }) }
async function approvePR() { await ghPost(`/repos/${REPO}/pulls/${PR_NUMBER}/reviews`, { event: 'APPROVE', body: 'Automated validation passed.' }) }
async function requestChanges(body) { await ghPost(`/repos/${REPO}/pulls/${PR_NUMBER}/reviews`, { event: 'REQUEST_CHANGES', body }) }

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




// main script
(async () => {
    const changedFiles = getChangedFiles()
    const domainFiles = changedFiles.filter(f => f.file.startsWith('domains/') && f.file.endsWith('.json'))
    const otherFiles = changedFiles.filter(f => !f.file.startsWith('domains/'))

    const allLabels = []
    const allReasons = []
    let needsMaintainer = false
    let autoFixable = false

    // edits outside "domain/"
    if (otherFiles.length > 0) {
        const nonDomainFiles = otherFiles.map(f => f.file);
        allLabels.push('reason: unauthorized')
        allReasons.push(`PR modifies files outside domains/: ${nonDomainFiles.join(', ')}`)
        needsMaintainer = true
    }

    // each domain files
    for (const { status, file } of domainFiles) {
        if (status === 'D') {
            // (D) check author is owner
            const { isOwner, existingData } = await isOwnerBase(file, authorId, BASE_SHA)
            if (!isOwner) {
                allLabels.push('reason: unauthorized')
                allReasons.push(`@${PR_AUTHOR} is not an owner of ${file} and cannot delete it`)
                needsMaintainer = true
            }

            continue
        }

        // add/mod : read HEAD
        let data
        try { data = JSON.parse(readFileSync(file, 'utf8')) }
        catch (e) {
            allLabels.push('reason: invalid file')
            allReasons.push(`${file}: could not parse JSON - ${e.message}`)
            continue
        }

        const isOwner = Array.isArray(data.owner) && data.owner.some(o => o['github-id'] === authorId && o.github === PR_AUTHOR)
        if (!isOwner) {
            allLabels.push('reason: unauthorized');
            allReasons.push(`@${PR_AUTHOR} (id:${authorId}) is not listed as an owner in ${file}`)
            needsMaintainer = true
            continue
        }

        // author was alr an owner before this PR
        if (status === 'M') {
            const { isOwner: wasOwner } = await isOwnerBase(file, authorId, BASE_SHA)
            if (!wasOwner) {
                allLabels.push('reason: impersonation')
                allReasons.push(`@${PR_AUTHOR} added themselves as owner in ${file} ; cannot self-authorize`)
                needsMaintainer = true
                continue
            }
        }


        // check structure
        const { errors, warnings } = validateDomainFile(data, file)

        if (errors.length > 0) {
            // tag specific error
            for (const err of errors) {
                const match = err.match(/reason: ([\w\s:]+)/)
                if (match) allLabels.push(match[1].trim())
            }

            allReasons.push(`${file}: ${errors.join('; ')}`)
            needsMaintainer = true
        }

        if (warnings.length > 0) for (const w of warnings) allReasons.push(`⚠️ ${file}: ${w}`)
    }

    // post res
    const uniqueLabels = [...new Set(allLabels)]
    if (needsMaintainer) {
        // apply label
        if (uniqueLabels.length > 0) await addLabels(uniqueLabels)
        await requestReview(['aitji'])
        await requestChanges(
            `## [❌] Automated PR Validation Failed\n\n` +
            `**Labels applied:** ${uniqueLabels.map(l => `\`${l}\``).join(', ')}\n\n` +
            `**Issues found:**\n${allReasons.map(r => `- ${r}`).join('\n')}\n\n` +
            `This PR has been assigned to @aitji for manual review.`
        )

        console.log('PR failed validation:', allReasons)

        // signal to workflow
        console.log('auto_fix=false')
        process.exit(0)
    } else {
        await approvePR();
        console.log(`PR validated successfully. ${domainFiles.length} domain file(s) OK.`)
        console.log('auto_fix=false')
        process.exit(0)
    }
})().catch(e => {
    console.error('validate-pr.js crashed:', e)
    process.exit(1)
})

// utlis's helper
async function isOwnerBase(file, authorId, baseSha) {
    try {
        const raw = execSync(`git show ${baseSha}:${file}`, { encoding: 'utf8' });
        const existingData = JSON.parse(raw);
        const isOwner = Array.isArray(existingData.owner) && existingData.owner.some(o => o['github-id'] === authorId)
        return { isOwner, existingData }
    } catch {
        // didn't exist in base (new file) ; that's OK
        return { isOwner: true, existingData: null };
    }
}