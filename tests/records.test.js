import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateDomainFile } from '../util/validate-domain.js'

const VALID_BASE = {
  domain: 'myproject.id.thatako.net',
  host: ['vercel'],
  owner: [{ github: 'myuser', 'github-id': 12345 }],
  records: { A: ['76.76.21.21'] },
}
function make(overrides) { return JSON.parse(JSON.stringify({ ...VALID_BASE, ...overrides })) }

// check valid
test('valid file passes', () => {
  const { errors } = validateDomainFile(VALID_BASE, 'domains/myproject.id.thatako.net.json')
  assert.equal(errors.length, 0)
})

test('valid with multiple records', () => {
  const data = make({ records: { A: ['76.76.21.21'], TXT: 'vercel-thing=abc123' } })
  const { errors } = validateDomainFile(data, 'domains/myproject.id.thatako.net.json')
  assert.equal(errors.length, 0)
})

test('valid with multiple owners', () => {
  const data = make({
    owner: [
      { github: 'alice', 'github-id': 1 },
      { github: 'bob', 'github-id': 2 },
    ]
  })
  const { errors } = validateDomainFile(data)
  assert.equal(errors.length, 0)
})

// domain
test('rejects non-id subdomain', () => {
  const data = make({ domain: 'myproject.thatako.net' })
  const { errors } = validateDomainFile(data)
  assert.ok(errors.some(e => e.includes('invalid file')))
})

test('rejects path traversal', () => {
  const data = make({ domain: '../etc/passwd.id.thatako.net' })
  const { errors } = validateDomainFile(data)
  assert.ok(errors.length > 0)
})

test('rejects disallowed name', () => {
  const data = make({ domain: 'www.id.thatako.net' })
  const { errors } = validateDomainFile(data)
  assert.ok(errors.some(e => e.includes('reserved')))
})

test('rejects uppercase in domain', () => {
  const data = make({ domain: 'MyProject.id.thatako.net' })
  const { errors } = validateDomainFile(data)
  assert.ok(errors.length > 0)
})


test('rejects filename mismatch', () => {
  const { errors } = validateDomainFile(VALID_BASE, 'domains/other.id.thatako.net.json')
  assert.ok(errors.some(e => e.includes('does not match domain')))
})

// record
test('rejects invalid IPv4 in A record', () => {
  const data = make({ records: { A: ['not.an.ip'] } })
  const { errors } = validateDomainFile(data)
  assert.ok(errors.some(e => e.includes('IPv4')))
})

test('rejects XSS in record value', () => {
  const data = make({ records: { TXT: '<script>alert(1)</script>' } })
  const { errors } = validateDomainFile(data)
  assert.ok(errors.some(e => e.includes('dangerous')))
})

test('rejects unknown record type', () => {
  const data = make({ records: { BADTYPE: ['1.2.3.4'] } })
  const { errors } = validateDomainFile(data)
  assert.ok(errors.some(e => e.includes('unknown record type')))
})

test('rejects empty records', () => {
  const data = make({ records: {} })
  const { errors } = validateDomainFile(data)
  assert.ok(errors.some(e => e.includes('empty')))
})

// owner
test('rejects missing owner', () => {
  const data = make({ owner: [] })
  const { errors } = validateDomainFile(data)
  assert.ok(errors.some(e => e.includes('owner')))
})

test('rejects owner without github-id', () => {
  const data = make({ owner: [{ github: 'user' }] })
  const { errors } = validateDomainFile(data)
  assert.ok(errors.some(e => e.includes('github-id')))
})
