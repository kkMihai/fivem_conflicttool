import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const dir = path.dirname(fileURLToPath(import.meta.url))

require(path.join(dir, '..', 'server', 'lib', 'joaat.js'))
require(path.join(dir, '..', 'server', 'lib', 'rsc7.js'))
require(path.join(dir, '..', 'server', 'lib', 'meta.js'))
require(path.join(dir, '..', 'server', 'lib', 'ymap.js'))

const KKCT = globalThis.KKCT
const target = process.argv[2]
if (!target) {
    console.log('usage: node verify-patch.mjs <file.ymap|folder> [limit]')
    process.exit(1)
}
const limit = Number(process.argv[3] || 40)

function collect(root, out) {
    if (out.length >= limit) return
    let entries
    try {
        entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
        return
    }
    for (const e of entries) {
        if (out.length >= limit) return
        const full = path.join(root, e.name)
        if (e.isDirectory()) collect(full, out)
        else if (e.name.toLowerCase().endsWith('.ymap')) out.push(full)
    }
}

const files = []
if (fs.statSync(target).isDirectory()) collect(target, files)
else files.push(target)

let roundTrip = 0
let moved = 0
let shrunk = 0
let skipped = 0
const failures = []

for (const file of files) {
    const original = fs.readFileSync(file)
    const name = path.basename(file)
    let parsed
    try {
        parsed = KKCT.rsc7.parse(original)
    } catch (e) {
        skipped++
        continue
    }

    const rewritten = KKCT.rsc7.write(parsed, parsed.data)
    const reread = KKCT.rsc7.parse(rewritten)
    if (!reread.data.equals(parsed.data)) {
        failures.push(`${name}: round trip changed the payload`)
        continue
    }
    if (reread.systemFlags !== parsed.systemFlags || reread.graphicsFlags !== parsed.graphicsFlags) {
        failures.push(`${name}: round trip changed the page flags`)
        continue
    }
    roundTrip++

    const before = KKCT.ymap.parse(original)
    const ent = before.entities.find(e => !e.mlo)
    if (ent) {
        const to = [ent.p[0], ent.p[1], ent.p[2] - 1000]
        try {
            const res = KKCT.ymap.patch(original, [{ kind: 'entityPos', archetype: ent.a, from: ent.p, to }])
            const after = KKCT.ymap.parse(res.buf)
            const hit = after.entities.find(e => e.a === ent.a && Math.abs(e.p[2] - to[2]) < 0.02)
            if (!hit) {
                failures.push(`${name}: entity move did not land`)
            } else if (after.entities.length !== before.entities.length) {
                failures.push(`${name}: entity count changed ${before.entities.length} to ${after.entities.length}`)
            } else if (after.boxOccluders.length !== before.boxOccluders.length) {
                failures.push(`${name}: occluder count changed`)
            } else {
                const others = after.entities.filter(e => e !== hit).length
                if (others !== before.entities.length - 1) failures.push(`${name}: other entities disturbed`)
                else moved++
            }
        } catch (e) {
            failures.push(`${name}: entity move threw ${e.message}`)
        }
    }

    if (before.boxOccluders.length) {
        const box = before.boxOccluders[0]
        const newLen = Math.max(1, Math.round(box.l * 4) - 8)
        try {
            const res = KKCT.ymap.patch(original, [{ kind: 'boxOccluder', index: 0, fields: { iLength: newLen } }])
            const after = KKCT.ymap.parse(res.buf)
            const got = Math.round(after.boxOccluders[0].l * 4)
            if (got !== newLen) failures.push(`${name}: occluder length is ${got}, wanted ${newLen}`)
            else if (after.boxOccluders.length !== before.boxOccluders.length) failures.push(`${name}: occluder count changed`)
            else shrunk++
        } catch (e) {
            failures.push(`${name}: occluder shrink threw ${e.message}`)
        }
    }
}

console.log(`files: ${files.length}, unreadable: ${skipped}`)
console.log(`round trip byte identical: ${roundTrip}`)
console.log(`entity moves verified: ${moved}`)
console.log(`occluder shrinks verified: ${shrunk}`)
console.log(`failures: ${failures.length}`)
for (const f of failures.slice(0, 15)) console.log(`  ${f}`)
