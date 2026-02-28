import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'

// file changed HEAD~1 & HEAD
const raw = execSync('git diff --name-status HEAD~1 HEAD -- domains/', { encoding: 'utf8' })

const changes = []
for (const line of raw.trim().split('\n').filter(Boolean)) {
  const [status, file] = line.split(/\s+/)
  if (!file || !file.startsWith('domains/') || !file.endsWith('.json')) continue

  let action
  if (status === 'A') action = 'create'
  else if (status === 'M') action = 'update'
  else if (status === 'D') action = 'delete'
  else continue

  let data = null
  if (action !== 'delete' && existsSync(file)) {
    try { data = JSON.parse(readFileSync(file, 'utf8')) }
    catch {
      console.error(`Skipping malformed JSON: ${file}`)
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