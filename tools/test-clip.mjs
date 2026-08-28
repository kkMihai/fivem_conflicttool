import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const dir = path.dirname(fileURLToPath(import.meta.url))

require(path.join(dir, '..', 'server', 'lib', 'joaat.js'))
require(path.join(dir, '..', 'server', 'lib', 'rsc7.js'))
require(path.join(dir, '..', 'server', 'lib', 'meta.js'))
require(path.join(dir, '..', 'server', 'lib', 'ymap.js'))
require(path.join(dir, '..', 'server', 'lib', 'occlusion.js'))

const KKCT = globalThis.KKCT
let failed = 0

function check(name, cond, extra) {
    console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? `  ${extra}` : ''}`)
    if (!cond) failed++
}

function box(c, l, w, h, cz = 1, sz = 0, bi = 0) {
    return { c, l, w, h, cz, sz, bi, resource: 'r', rel: 'stream/x.ymap', file: 'x.ymap' }
}

function spans(b, axis) {
    const size = [b.l, b.w, b.h][axis]
    return [b.c[axis] - size / 2, b.c[axis] + size / 2]
}

function overlaps(a, b) {
    const cz = a.cz ?? 1
    const sz = a.sz ?? 0
    const dx = b.c[0] - a.c[0]
    const dy = b.c[1] - a.c[1]
    const local = [dx * cz + dy * sz, -dx * sz + dy * cz, b.c[2] - a.c[2]]
    const ah = [a.l / 2, a.w / 2, a.h / 2]
    const bh = [b.l / 2, b.w / 2, b.h / 2]
    for (let i = 0; i < 3; i++) {
        if (ah[i] + bh[i] - Math.abs(local[i]) <= 0) return false
    }
    return true
}

console.log('--- clip math ---')

{
    const a = box([0, 0, 0], 10, 10, 10)
    const b = box([8, 0, 0], 10, 10, 10)
    const r = KKCT.occlusion.clip(a, b, 'a')
    check('picks the shallowest axis', r.ok && r.axis === 'length', r.ok ? `axis ${r.axis} overlap ${r.overlap}` : r.reason)
    const after = { ...a, c: r.after.c, l: r.after.l, w: r.after.w, h: r.after.h }
    check('shrinking a clears the overlap', !overlaps(after, b), `a now ${after.c[0]} size ${after.l}`)
    check('a keeps its far face', Math.abs(spans(after, 0)[0] - spans(a, 0)[0]) < 0.01)
    check('a is still overlapping before the clip', overlaps(a, b))
}

{
    const a = box([0, 0, 0], 10, 10, 10)
    const b = box([8, 0, 0], 10, 10, 10)
    const r = KKCT.occlusion.clip(a, b, 'b')
    const after = { ...b, c: r.after.c, l: r.after.l, w: r.after.w, h: r.after.h }
    check('shrinking b clears the overlap', r.ok && !overlaps(a, after), r.ok ? `b now ${after.c[0]} size ${after.l}` : r.reason)
}

{
    const a = box([0, 0, 0], 40, 10, 10)
    const b = box([0, 0, 8], 40, 10, 10)
    const r = KKCT.occlusion.clip(a, b, 'a')
    check('picks the height axis when that is shallowest', r.ok && r.axis === 'height', r.ok ? r.axis : r.reason)
    const after = { ...a, c: r.after.c, l: r.after.l, w: r.after.w, h: r.after.h }
    check('height clip clears the overlap', !overlaps(after, b))
}

{
    const a = box([0, 0, 0], 40, 10, 40)
    const b = box([0, 8, 0], 40, 10, 40)
    const r = KKCT.occlusion.clip(a, b, 'a')
    check('picks the width axis', r.ok && r.axis === 'width', r.ok ? r.axis : r.reason)
    const after = { ...a, c: r.after.c, l: r.after.l, w: r.after.w, h: r.after.h }
    check('width clip clears the overlap', !overlaps(after, b))
}

{
    const a = box([0, 0, 0], 10, 10, 10)
    const b = box([100, 0, 0], 10, 10, 10)
    const r = KKCT.occlusion.clip(a, b, 'a')
    check('refuses when they do not intersect', !r.ok, r.reason)
}

{
    const a = box([0, 0, 0], 10, 10, 10)
    const b = box([0.5, 0, 0], 10, 10, 10)
    const r = KKCT.occlusion.clip(a, b, 'a')
    check('refuses when nothing would be left', !r.ok, r.reason)
}

{
    const a = box([0, 0, 0], 10, 10, 10, 1, 0)
    const b = box([8, 0, 0], 10, 10, 10, 0.7, 0.7)
    const r = KKCT.occlusion.clip(a, b, 'a')
    check('refuses on mismatched rotation', !r.ok, r.reason)
}

{
    const c = Math.cos(0.6)
    const s = Math.sin(0.6)
    const a = box([0, 0, 0], 10, 10, 10, c, s)
    const b = box([8 * c, 8 * s, 0], 10, 10, 10, c, s)
    const r = KKCT.occlusion.clip(a, b, 'a')
    check('handles a shared rotation', r.ok && r.axis === 'length', r.ok ? `axis ${r.axis} overlap ${r.overlap}` : r.reason)
}

console.log('')
console.log('--- apply and restore on a real file ---')

const source = process.argv[2]
if (!source) {
    console.log('skipped, pass a real .ymap with a box occluder as argv[2]')
    process.exit(failed ? 1 : 0)
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'kkct-clip-'))
const fakeRoot = path.join(sandbox, 'fivem_conflicttool')
const fakeRes = path.join(sandbox, 'some_map')
fs.mkdirSync(path.join(fakeRes, 'stream'), { recursive: true })
fs.mkdirSync(fakeRoot, { recursive: true })
const testFile = path.join(fakeRes, 'stream', path.basename(source))
fs.copyFileSync(source, testFile)
const originalBytes = fs.readFileSync(testFile)
const sha = crypto.createHash('sha1').update(originalBytes).digest('hex')

globalThis.GetResourcePath = name => (name === 'some_map' ? fakeRes.split(path.sep).join('/') : null)
globalThis.GetCurrentResourceName = () => 'fivem_conflicttool'

require(path.join(dir, '..', 'server', 'decisions.js'))
require(path.join(dir, '..', 'server', 'resolver.js'))
require(path.join(dir, '..', 'server', 'backups.js'))

KKCT.decisions.init(fakeRoot)
KKCT.resolver.init(fakeRoot)

const before = KKCT.ymap.parse(originalBytes)
const real = before.boxOccluders[0]
if (!real) {
    console.log('this ymap has no box occluder, pick another')
    fs.rmSync(sandbox, { recursive: true, force: true })
    process.exit(1)
}
const rel = `stream/${path.basename(source)}`
const a = { ...real, resource: 'some_map', rel, file: path.basename(source) }
const off = a.l * 0.8
const b = box([a.c[0] + off * a.cz, a.c[1] + off * a.sz, a.c[2]], a.l, a.w * 2, a.h * 2, a.cz, a.sz, 999)
console.log(`real occluder ${a.bi} at ${a.c.join(', ')} size ${a.l} x ${a.w} x ${a.h}`)

const clip = KKCT.occlusion.clip(a, b, 'a')
check('clip computed', clip.ok, clip.ok ? `${clip.axis} by ${clip.overlap}m` : clip.reason)
if (!clip.ok) {
    fs.rmSync(sandbox, { recursive: true, force: true })
    process.exit(1)
}

KKCT.decisions.addAsset({
    action: 'clip',
    conflictId: 'c_test',
    file: path.basename(source),
    loser: { resource: 'some_map', relPath: rel, sha1: sha },
    box: { index: clip.index, fields: clip.fields, after: clip.after }
})

const result = await KKCT.resolver.apply(() => {})
check('apply reported no errors', result.errors.length === 0, JSON.stringify(result.errors))
check('summary counts the clip', result.summary.clipped === 1, JSON.stringify(result.summary))

const after = KKCT.ymap.parse(fs.readFileSync(testFile))
const newBox = after.boxOccluders.find(x => x.bi === a.bi)
check('the box shrank on disk', !!newBox && Math.abs(newBox.l - a.l) > 0.01, newBox ? `${newBox.c.join(', ')} size ${newBox.l} x ${newBox.w} x ${newBox.h}` : 'missing')
check('overlap is gone', !!newBox && !overlaps(newBox, b))
check('occluder count unchanged', after.boxOccluders.length === before.boxOccluders.length)
check('entity count unchanged', after.entities.length === before.entities.length)
check('other occluders untouched', after.boxOccluders.every(x => x.bi === a.bi || JSON.stringify(x) === JSON.stringify(before.boxOccluders.find(y => y.bi === x.bi))))

const restore = await KKCT.backups.restore(result.bundleId, () => {})
check('restore ok', restore.ok, JSON.stringify(restore.errors))
check('file byte identical after restore', fs.readFileSync(testFile).equals(originalBytes))

fs.rmSync(sandbox, { recursive: true, force: true })
console.log('')
console.log(failed ? `${failed} check(s) failed` : 'all checks passed')
process.exit(failed ? 1 : 0)
