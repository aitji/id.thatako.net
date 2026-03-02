import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'

const raw = execSync('git diff --name-status HEAD~1 HEAD -- domains/', { encoding: 'utf8' })
// only accept exactly domains/[sub].id.thatako.net.json - no path traversal
const VALID_FILE_RE = /^domains\/[a-z0-9][a-z0-9\-]{0,61}[a-z0-9]?\.id\.thatako\.net\.json$/

const changes = []
for (const line of raw.trim().split('\n').filter(Boolean)) {
  const [status, file] = line.split(/\s+/)
  if (!file || !VALID_FILE_RE.test(file)) continue

  let action
  if (status === 'A') action = 'create'
  else if (status === 'M') action = 'update'
  else if (status === 'D') action = 'delete'
  else continue

  let data = null
  if (action !== 'delete' && existsSync(file)) {
    try { data = JSON.parse(readFileSync(file, 'utf8')) }
    catch {
      console.error(`skip malformed json: ${file}`)
      continue
    }
  } else if (action === 'delete') {
    const domain = file.replace('domains/', '').replace('.json', '')
    data = { domain }
  }

  changes.push({ action, file, data })
}

if (changes.length === 0) console.log('changes=')
else console.log(`changes=${JSON.stringify(changes)}`)