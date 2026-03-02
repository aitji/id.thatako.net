import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DISALLOWED = JSON.parse(readFileSync(join(__dirname, 'disallowed-cnames.json'), 'utf8'))
const INTERNAL = JSON.parse(readFileSync(join(__dirname, 'internal.json'), 'utf8'))

const SUBDOMAIN_RE = /^[a-z0-9][a-z0-9\-]{0,61}[a-z0-9]?\.id\.thatako\.net$/
const DANGEROUS_RE = /<script|javascript:|data:|vbscript:|on\w+=/i

const VALID_RECORD_TYPES = new Set(['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS'])
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/
const IPV6_RE = /^[0-9a-f:]+$/i
const HOSTNAME_RE = /^[a-z0-9][a-z0-9\-\.]{0,253}[a-z0-9]\.?$/i

// record name: @ | single label (no dots blocks sub.sub.id | other.thatako.net)
const RECORD_NAME_RE = /^(@|[a-z0-9_][a-z0-9_\-]{0,61}[a-z0-9_]?)$/i

export function validateDomainFile(data, filename) {
  const errors = []
  const warnings = []

  // structure
  if (!data || typeof data !== 'object') {
    errors.push('File is not a valid JSON object')
    return { errors, warnings }
  }

  // domain
  if (!data.domain || typeof data.domain !== 'string') {
    errors.push('reason: invalid file - missing domain field')
  } else {
    // must be exactly 4 labels: sub.id.thatako.net
    const parts = data.domain.split('.')
    if (parts.length !== 4 || parts.slice(1).join('.') !== 'id.thatako.net') {
      errors.push('reason: invalid file - domain must be exactly [name].id.thatako.net (no extra labels)')
    } else if (!SUBDOMAIN_RE.test(data.domain)) {
      errors.push('reason: invalid file - domain must be [name].id.thatako.net')
    }

    const expectedFile = `domains/${data.domain}.json`
    if (filename && filename !== expectedFile)
      errors.push(`reason: invalid file - filename ${filename} does not match domain ${data.domain}`)

    const sub = parts[0]
    if (DISALLOWED.includes(sub)) errors.push('reason: invalid file - subdomain name is reserved')
    if (INTERNAL.reserved.includes(sub)) errors.push('reason: unauthorized - subdomain reserved for internal use')

    if (data.domain.includes('..') || data.domain.includes('/'))
      errors.push('reason: invalid file - path traversal attempt')
  }

  // host
  if (!Array.isArray(data.host) || data.host.length === 0)
    errors.push('reason: invalid file - host must be a non-empty array')

  // owners
  if (!Array.isArray(data.owner) || data.owner.length === 0) {
    errors.push('reason: invalid file - owner must be a non-empty array')
  } else {
    for (let i = 0; i < data.owner.length; i++) {
      const o = data.owner[i]
      if (typeof o.github !== 'string' || !o.github)
        errors.push(`reason: invalid file - owner[${i}].github must be a string`)
      if (typeof o['github-id'] !== 'number' || o['github-id'] <= 0)
        errors.push(`reason: invalid file - owner[${i}].github-id must be a positive number`)
      if (o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email))
        warnings.push(`owner[${i}].email looks invalid`)
    }
  }

  // records
  if (!data.records || typeof data.records !== 'object' || Array.isArray(data.records)) {
    errors.push('reason: invalid records - records must be an object')
  } else {
    if (Object.keys(data.records).length === 0)
      errors.push('reason: incomplete pr - records object is empty')

    for (const [type, val] of Object.entries(data.records)) {
      if (!VALID_RECORD_TYPES.has(type)) {
        errors.push(`reason: invalid records - unknown record type: ${type}`)
        continue
      }

      const values = Array.isArray(val) ? val : [val]
      for (const v of values) {
        const content = (typeof v === 'object' && v !== null) ? v.value : v
        const recName = (typeof v === 'object' && v !== null) ? (v.name || '@') : '@'

        if (typeof content !== 'string') { errors.push(`reason: invalid records - ${type} value must be string`); continue }
        if (DANGEROUS_RE.test(content)) { errors.push(`reason: invalid records - dangerous content in ${type} value`); continue }
        if (DANGEROUS_RE.test(recName)) { errors.push(`reason: invalid records - dangerous content in ${type} name`); continue }

        // record name: @ or single label only no dots
        if (!RECORD_NAME_RE.test(recName)) {
          errors.push(`reason: invalid records - ${type} name "${recName}" must be @ or single label (no dots)`)
        }

        if (type === 'A' && !IPV4_RE.test(content))
          errors.push(`reason: invalid records - A must be ipv4: ${content}`)
        if (type === 'AAAA' && !IPV6_RE.test(content))
          errors.push(`reason: invalid records - AAAA must be ipv6: ${content}`)
        if ((type === 'CNAME' || type === 'MX') && content && !HOSTNAME_RE.test(content))
          errors.push(`reason: invalid records - ${type} must be valid hostname: ${content}`)

        // block cname pointing to internal thatako.net zones (except id.thatako.net)
        if (type === 'CNAME' && /thatako\.net/i.test(content)) {
          if (!/\.id\.thatako\.net\.?$/.test(content)) {
            errors.push(`reason: invalid records - cname target "${content}" points to internal thatako.net zone`)
          }
        }

        if (type === 'CNAME' && DISALLOWED.some(d => content.includes(d + '.thatako.net')))
          warnings.push(`cname target ${content} points to internal thatako.net intentional?`)
      }
    }
  }

  return { errors, warnings }
}