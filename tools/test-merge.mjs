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

console.log('--- merge math ---')

{
    const a = box([0, 0, 0], 20, 20, 20)
    const b = box([2, 1, 0], 5, 5, 5)
    const r = KKCT.occlusion.merge(a, b)
    check('containment zeroes the inner box', r.ok && r.mode === 'contained' && r.zero.box === 'b' && !r.expand, r.ok ? r.mode : r.reason)
    check('zero edit has all zero sizes', r.ok && r.zero.fields.iLength === 0 && r.zero.fields.iWidth === 0 && r.zero.fields.iHeight === 0)
}

{
    const a = box([0, 0, 0], 20, 20, 20)
    const b = box([0, 0, 0], 20, 20, 20, 1, 0, 5)
    const r = KKCT.occlusion.merge(a, b)
    check('identical copies count as contained', r.ok && r.mode === 'contained', r.ok ? `zeroes ${r.zero.box}` : r.reason)
}

{
    const a = box([0, 0, 0], 10, 10, 10)
    const b = box([10, 0, 0], 10, 10, 10)
    const r = KKCT.occlusion.merge(a, b)
    check('flush boxes merge exactly', r.ok && r.mode === 'union' && r.waste === 0, r.ok ? `waste ${r.waste}` : r.reason)
    check('union has the right size', r.ok && r.expand.after.l === 20 && r.expand.after.w === 10 && r.expand.after.h === 10, r.ok ? `${r.expand.after.l} x ${r.expand.after.w} x ${r.expand.after.h}` : '')
    check('union is centered between them', r.ok && Math.abs(r.expand.after.c[0] - 5) < 0.01)
}

{
    const a = box([0, 0, 0], 10, 10, 10)
    const b = box([8, 0, 0], 10, 10, 10)
    const r = KKCT.occlusion.merge(a, b)
    check('overlapping same-section boxes merge with no waste', r.ok && r.mode === 'union' && r.waste === 0, r.ok ? `waste ${r.waste}` : r.reason)
}

{
    const a = box([0, 0, 0], 10, 10, 10)
    const b = box([10, 0, 0], 10, 9, 10)
    const r = KKCT.occlusion.merge(a, b)
    check('slightly smaller neighbor stays under the waste cap', r.ok, r.ok ? `waste ${r.waste}` : r.reason)
}

{
    const a = box([0, 0, 0], 10, 10, 10)
    const b = box([8, 8, 0], 10, 10, 10)
    const r = KKCT.occlusion.merge(a, b)
    check('L shaped pair is refused', !r.ok, r.reason)
}

{
    const a = box([0, 0, 0], 10, 10, 10)
    const b = box([15, 0, 0], 10, 10, 10)
    const r = KKCT.occlusion.merge(a, b)
    check('a gap is refused', !r.ok, r.reason)
}

{
    const a = box([0, 0, 0], 10, 10, 10, 1, 0)
    const b = box([10, 0, 0], 10, 10, 10, 0.7, 0.7)
    const r = KKCT.occlusion.merge(a, b)
    check('mismatched rotation is refused', !r.ok, r.reason)
}

{
    const c = Math.cos(0.6)
    const s = Math.sin(0.6)
    const a = box([0, 0, 0], 10, 10, 10, c, s)
    const b = box([10 * c, 10 * s, 0], 10, 10, 10, c, s)
    const r = KKCT.occlusion.merge(a, b)
    check('shared rotation merges', r.ok && r.mode === 'union' && r.waste === 0, r.ok ? `waste ${r.waste}` : r.reason)
    check('rotated union center is on the axis', r.ok && Math.abs(r.expand.after.c[0] - 5 * c) < 0.15 && Math.abs(r.expand.after.c[1] - 5 * s) < 0.15)
}

{
    const a = box([0, 0, 0], 6, 10, 10)
    const b = box([8, 0, 0], 10, 10, 10)
    const r = KKCT.occlusion.merge(a, b)
    check('the bigger box wins the expand', r.ok && r.expand.box === 'b' && r.zero.box === 'a', r.ok ? `expands ${r.expand.box}` : r.reason)
}

console.log('')
console.log('--- apply and restore on real files ---')

const source = process.argv[2]
if (!source) {
    console.log('skipped, pass a real .ymap with a box occluder as argv[2]')
    process.exit(failed ? 1 : 0)
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'kkct-merge-'))
const fakeRoot = path.join(sandbox, 'fivem_conflicttool')
const resA = path.join(sandbox, 'map_a')
const resB = path.join(sandbox, 'map_b')
fs.mkdirSync(path.join(resA, 'stream'), { recursive: true })
fs.mkdirSync(path.join(resB, 'stream'), { recursive: true })
fs.mkdirSync(fakeRoot, { recursive: true })
const base = path.basename(source)
const fileA = path.join(resA, 'stream', base)
const fileB = path.join(resB, 'stream', base)
fs.copyFileSync(source, fileA)
fs.copyFileSync(source, fileB)
const originalBytes = fs.readFileSync(source)
const sha = crypto.createHash('sha1').update(originalBytes).digest('hex')

globalThis.GetResourcePath = name => {
    if (name === 'map_a') return resA.split(path.sep).join('/')
    if (name === 'map_b') return resB.split(path.sep).join('/')
    return null
}
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
const rel = `stream/${base}`
const a = { ...real, resource: 'map_a', rel, file: base }
const b = { ...real, resource: 'map_b', rel, file: base }
console.log(`real occluder ${real.bi} at ${real.c.join(', ')} size ${real.l} x ${real.w} x ${real.h}`)

const merge = KKCT.occlusion.merge(a, b)
check('identical pair computes as contained', merge.ok && merge.mode === 'contained', merge.ok ? `zeroes ${merge.zero.box}` : merge.reason)
if (!merge.ok) {
    fs.rmSync(sandbox, { recursive: true, force: true })
    process.exit(1)
}

const zeroTarget = merge.zero.box === 'a' ? a : b
KKCT.decisions.addAsset({
    action: 'clip',
    conflictId: 'c_test',
    file: base,
    loser: { resource: zeroTarget.resource, relPath: rel, sha1: sha },
    box: { index: merge.zero.index, fields: merge.zero.fields, after: merge.zero.after }
})

const result = await KKCT.resolver.apply(() => {})
check('contained apply has no errors', result.errors.length === 0, JSON.stringify(result.errors))

const zeroFile = zeroTarget.resource === 'map_a' ? fileA : fileB
const afterZero = KKCT.ymap.parse(fs.readFileSync(zeroFile))
const zBox = afterZero.boxOccluders.find(x => x.bi === real.bi)
check('the zeroed box has no volume', !!zBox && zBox.l === 0 && zBox.w === 0 && zBox.h === 0, zBox ? `${zBox.l} x ${zBox.w} x ${zBox.h}` : 'missing')
check('occluder count unchanged', afterZero.boxOccluders.length === before.boxOccluders.length)

const restore1 = await KKCT.backups.restore(result.bundleId, () => {})
check('restore ok', restore1.ok, JSON.stringify(restore1.errors))
check('zeroed file byte identical after restore', fs.readFileSync(zeroFile).equals(originalBytes))

const shifted = {
    ...real,
    resource: 'map_a',
    rel,
    file: base,
    l: real.l * 0.6,
    c: [real.c[0] + (real.l * 0.8) * real.cz, real.c[1] + (real.l * 0.8) * real.sz, real.c[2]]
}
const b2 = { ...real, resource: 'map_b', rel, file: base }
const merge2 = KKCT.occlusion.merge(shifted, b2)
check('union merge computes', merge2.ok && merge2.mode === 'union', merge2.ok ? `waste ${merge2.waste}, expands ${merge2.expand.box}` : merge2.reason)
if (merge2.ok) {
    const expandTarget = merge2.expand.box === 'a' ? shifted : b2
    const zeroTarget2 = merge2.zero.box === 'a' ? shifted : b2
    KKCT.decisions.addAsset({
        action: 'clip',
        conflictId: 'c_test2',
        file: base,
        loser: { resource: expandTarget.resource, relPath: rel },
        box: { index: merge2.expand.index, fields: merge2.expand.fields, after: merge2.expand.after }
    })
    KKCT.decisions.addAsset({
        action: 'clip',
        conflictId: 'c_test2',
        file: base,
        loser: { resource: zeroTarget2.resource, relPath: rel },
        box: { index: merge2.zero.index, fields: merge2.zero.fields, after: merge2.zero.after }
    })
    const result2 = await KKCT.resolver.apply(() => {})
    check('union apply has no errors', result2.errors.length === 0, JSON.stringify(result2.errors))
    check('union apply counts two clips', result2.summary.clipped === 2, JSON.stringify(result2.summary))

    const expFile = expandTarget.resource === 'map_a' ? fileA : fileB
    const zFile = zeroTarget2.resource === 'map_a' ? fileA : fileB
    const expParsed = KKCT.ymap.parse(fs.readFileSync(expFile))
    const eBox = expParsed.boxOccluders.find(x => x.bi === real.bi)
    check('the expanded box grew', !!eBox && eBox.l > real.l, eBox ? `${real.l} -> ${eBox.l}` : 'missing')
    const zParsed = KKCT.ymap.parse(fs.readFileSync(zFile))
    const zBox2 = zParsed.boxOccluders.find(x => x.bi === real.bi)
    check('the other box was zeroed', !!zBox2 && zBox2.l === 0 && zBox2.w === 0 && zBox2.h === 0)

    const restore2 = await KKCT.backups.restore(result2.bundleId, () => {})
    check('union restore ok', restore2.ok, JSON.stringify(restore2.errors))
    check('both files byte identical after restore', fs.readFileSync(fileA).equals(originalBytes) && fs.readFileSync(fileB).equals(originalBytes))
}

fs.rmSync(sandbox, { recursive: true, force: true })
console.log('')
console.log(failed ? `${failed} check(s) failed` : 'all checks passed')
process.exit(failed ? 1 : 0)
