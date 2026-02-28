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

export function validateDomainFile(data, filename) {
  const errors = []
  const warnings = []

  // structure
  if (!data || typeof data !== 'object') {
    errors.push('File is not a valid JSON object')
    return { errors, warnings }
  }

  // domain field
  if (!data.domain || typeof data.domain !== 'string') errors.push('reason: invalid file - missing domain field')
  else {
    if (!SUBDOMAIN_RE.test(data.domain)) errors.push('reason: invalid file - domain must be [name].id.thatako.net')

    // file name must match domain
    const expectedFile = `domains/${data.domain}.json`
    if (filename && filename !== expectedFile) errors.push(`reason: invalid file - filename ${filename} does not match domain ${data.domain}`)

    // disallowed + internal names
    const sub = data.domain.split('.id.thatako.net')[0]
    if (DISALLOWED.includes(sub)) errors.push('reason: invalid file - subdomain name is reserved')
    if (INTERNAL.reserved.includes(sub)) errors.push('reason: unauthorized - subdomain is reserved for internal use')

    // path traversal
    if (data.domain.includes('..') || data.domain.includes('/')) errors.push('reason: invalid file - path traversal attempt')
  }


  // host
  if (!Array.isArray(data.host) || data.host.length === 0) errors.push('reason: invalid file - host must be a non-empty array')

  // owners
  if (!Array.isArray(data.owner) || data.owner.length === 0) errors.push('reason: invalid file - owner must be a non-empty array')
  else {
    for (let i = 0; i < data.owner.length; i++) {
      const o = data.owner[i]
      if (typeof o.github !== 'string' || !o.github) errors.push(`reason: invalid file - owner[${i}].github must be a string`)
      if (typeof o['github-id'] !== 'number' || o['github-id'] <= 0) errors.push(`reason: invalid file - owner[${i}].github-id must be a positive number`)
      if (o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) warnings.push(`owner[${i}].email looks invalid`)
    }
  }


  // records
  if (!data.records || typeof data.records !== 'object' || Array.isArray(data.records)) errors.push('reason: invalid records - records must be an object')
  else {
    for (const [type, val] of Object.entries(data.records)) {
      if (!VALID_RECORD_TYPES.has(type)) {
        errors.push(`reason: invalid records - unknown record type: ${type}`)
        continue
      }

      const values = Array.isArray(val) ? val : [val]
      for (const v of values) {
        if (typeof v !== 'string') { errors.push(`reason: invalid records - ${type} value must be a string`); continue; }
        if (DANGEROUS_RE.test(v)) { errors.push(`reason: invalid records - dangerous content in ${type} record`); continue; }

        if (type === 'A' && !IPV4_RE.test(v)) errors.push(`reason: invalid records - A record must be IPv4: ${v}`)
        if (type === 'AAAA' && !IPV6_RE.test(v)) errors.push(`reason: invalid records - AAAA record must be IPv6: ${v}`)
        if ((type === 'CNAME' || type === 'MX') && !HOSTNAME_RE.test(v)) errors.push(`reason: invalid records - ${type} must be a valid hostname: ${v}`)

        // disallowed CNAME list
        if (type === 'CNAME' && DISALLOWED.some(d => v.includes(d + '.thatako.net'))) warnings.push(`CNAME target ${v} points to internal thatako.net - is this intentional?`);
      }
    }

    // verify at least one usable record exists
    if (Object.keys(data.records).length === 0) errors.push('reason: incomplete pr - records object is empty')
  }

  return { errors, warnings }
}