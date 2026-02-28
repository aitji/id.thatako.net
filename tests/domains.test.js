import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { validateDomainFile } from '../util/validate-domain.js'

const DOMAINS_DIR = new URL('../domains/', import.meta.url).pathname

let files
try { files = readdirSync(DOMAINS_DIR).filter(f => f.endsWith('.json')) }
catch { files = [] }

if (files.length === 0) test('no domain files yet', () => { /* pass */ })
else {
    for (const filename of files) {
        test(`validate: ${filename}`, () => {
            const fullPath = join(DOMAINS_DIR, filename)
            let data
            try { data = JSON.parse(readFileSync(fullPath, 'utf8')) }
            catch (e) { assert.fail(`Failed to parse JSON: ${e.message}`) }

            const relPath = `domains/${filename}`
            const { errors, warnings } = validateDomainFile(data, relPath)

            if (warnings.length > 0) console.warn(`  ⚠️  ${filename}:`, warnings.join('; '))
            assert.deepEqual(errors, [], `${filename} has validation errors:\n${errors.join('\n')}`)
        })
    }
}
