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

async function gh(method, path, body) {
    const res = await fetch(`https://api.github.com${path}`, {
        method,
        headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'thatako-pr-bot'
        },
        body: body ? JSON.stringify(body) : undefined
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
        console.error(`${method} ${path} failed:`, res.status, data)
    }

    return { ok: res.ok, data }
}

async function approvePR() {
    return gh('POST', `/repos/${REPO}/pulls/${PR_NUMBER}/reviews`, {
        event: 'APPROVE',
        body: 'Automated validation passed.'
    })
}

async function mergePR() {
    return gh('PUT', `/repos/${REPO}/pulls/${PR_NUMBER}/merge`, {
        merge_method: 'squash'
    })
}

function getChangedFiles() {
    const raw = execSync(`git diff --name-status ${BASE_SHA} ${HEAD_SHA}`, { encoding: 'utf8' })
    return raw.trim().split('\n').filter(Boolean).map(line => {
        const [status, file] = line.split(/\s+/)
        return { status, file }
    })
}

async function isOwnerBase(file, authorId, baseSha) {
    try {
        const raw = execSync(`git show ${baseSha}:${file}`, { encoding: 'utf8' })
        const existingData = JSON.parse(raw)
        const isOwner = Array.isArray(existingData.owner) &&
            existingData.owner.some(o => o['github-id'] === authorId)
        return { isOwner }
    } catch {
        return { isOwner: true }
    }
}

(async () => {
    const changedFiles = getChangedFiles()
    const domainFiles = changedFiles.filter(f =>
        f.file.startsWith('domains/') && f.file.endsWith('.json')
    )
    const otherFiles = changedFiles.filter(f =>
        !f.file.startsWith('domains/')
    )

    let failed = false

    if (otherFiles.length > 0) failed = true

    for (const { status, file } of domainFiles) {
        if (status === 'D') {
            const { isOwner } = await isOwnerBase(file, authorId, BASE_SHA)
            if (!isOwner) failed = true
            continue
        }

        let data
        try {
            data = JSON.parse(readFileSync(file, 'utf8'))
        } catch {
            failed = true
            continue
        }

        const isOwner = Array.isArray(data.owner) &&
            data.owner.some(o =>
                o['github-id'] === authorId && o.github === PR_AUTHOR
            )

        if (!isOwner) {
            failed = true
            continue
        }

        if (status === 'M') {
            const { isOwner: wasOwner } = await isOwnerBase(file, authorId, BASE_SHA)
            if (!wasOwner) {
                failed = true
                continue
            }
        }

        const { errors } = validateDomainFile(data, file)
        if (errors.length > 0) failed = true
    }

    if (failed) {
        console.log('PR failed validation')
        process.exit(1)
    }

    console.log('Validation passed')

    // approve (may fail if same author)
    await approvePR()

    // merge
    const merge = await mergePR()
    if (!merge.ok) {
        console.error('Merge failed')
        process.exit(1)
    }

    console.log('PR merged successfully')
    process.exit(0)

})().catch(e => {
    console.error('validate-pr.js crashed:', e)
    process.exit(1)
})
