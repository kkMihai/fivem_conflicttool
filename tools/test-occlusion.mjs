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

let nextBi = 0
function box(c, l, w, h, cz = 1, sz = 0) {
    return { c, l, w, h, cz, sz, bi: nextBi++, resource: `r${nextBi}`, rel: `stream/x${nextBi}.ymap`, file: `x${nextBi}.ymap` }
}

function spans(b, axis) {
    const size = [b.l, b.w, b.h][axis]
    return [b.c[axis] - size / 2, b.c[axis] + size / 2]
}

function overlapsLocal(a, b) {
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

console.log('--- clip ---')

{
    const a = box([0, 0, 0], 10, 10, 10)
    const b = box([8, 0, 0], 10, 10, 10)
    const r = KKCT.occlusion.clip([a, b], 0)
    check('pair clip picks the shallowest axis', r.ok && r.axis === 'length', r.ok ? `${r.axis}` : r.reason)
    const after = { ...a, ...r.after }
    check('pair clip clears the overlap', !overlapsLocal(after, b))
    check('pair clip keeps the far face', Math.abs(spans(after, 0)[0] - spans(a, 0)[0]) < 0.01)
}

{
    const a = box([0, 0, 0], 30, 10, 10)
    const left = box([-14, 0, 0], 10, 10, 10)
    const right = box([14, 0, 0], 10, 10, 10)
    const r = KKCT.occlusion.clip([a, left, right], 0)
    check('three way clip clears both neighbors', r.ok && r.cleared === 2, r.ok ? `cleared ${r.cleared}` : r.reason)
    if (r.ok) {
        const after = { ...a, ...r.after }
        check('shrunk against left', !overlapsLocal(after, left))
        check('shrunk against right', !overlapsLocal(after, right))
    }
}

{
    const a = box([0, 0, 0], 10, 10, 10)
    const b = box([100, 0, 0], 10, 10, 10)
    const r = KKCT.occlusion.clip([a, b], 0)
    check('non intersecting refused', !r.ok, r.reason)
}

{
    const a = box([0, 0, 0], 10, 10, 10)
    const b = box([0.5, 0, 0], 10, 10, 10)
    const r = KKCT.occlusion.clip([a, b], 0)
    check('nothing left refused', !r.ok, r.reason)
}

{
    const a = box([0, 0, 0], 10, 10, 10, 1, 0)
    const b = box([8, 0, 0], 10, 10, 10, 0.7, 0.7)
    const r = KKCT.occlusion.clip([a, b], 0)
    check('rotated neighbor refused', !r.ok, r.reason)
}

{
    const a = box([0, 0, 0], 30, 10, 10)
    const zeroed = { ...box([14, 0, 0], 10, 10, 10), l: 0, w: 0, h: 0 }
    const right = box([14, 0, 0], 10, 10, 10)
    const r = KKCT.occlusion.clip([a, zeroed, right], 0)
    check('zeroed boxes are skipped', r.ok && r.cleared === 1, r.ok ? `cleared ${r.cleared}` : r.reason)
}

console.log('')
console.log('--- merge ---')

{
    const a = box([0, 0, 0], 20, 20, 20)
    const b = box([2, 1, 0], 5, 5, 5)
    const r = KKCT.occlusion.merge([a, b])
    check('containment zeroes the inner box', r.ok && r.mode === 'contained' && !r.expand && r.zeroed.length === 1 && r.zeroed[0].boxIndex === 1, r.ok ? r.mode : r.reason)
}

{
    const a = box([0, 0, 0], 10, 10, 10)
    const b = box([10, 0, 0], 10, 10, 10)
    const r = KKCT.occlusion.merge([a, b])
    check('flush pair merges exactly', r.ok && r.mode === 'union' && r.waste === 0, r.ok ? `waste ${r.waste}` : r.reason)
    check('union size right', r.ok && r.expand.after.l === 20 && r.expand.after.w === 10)
}

{
    const a = box([0, 0, 0], 10, 10, 10)
    const b = box([10, 0, 0], 10, 10, 10)
    const c = box([20, 0, 0], 10, 10, 10)
    const r = KKCT.occlusion.merge([a, b, c])
    check('three in a row merge exactly', r.ok && r.mode === 'union' && r.waste === 0 && r.zeroed.length === 2, r.ok ? `waste ${r.waste}, zeroed ${r.zeroed.length}` : r.reason)
    check('three way union size', r.ok && r.expand.after.l === 30, r.ok ? `${r.expand.after.l}` : '')
}

{
    const a = box([0, 0, 0], 10, 10, 10)
    const b = box([8, 8, 0], 10, 10, 10)
    const r = KKCT.occlusion.merge([a, b])
    check('L shape refused with waste', !r.ok, r.reason)
}

{
    const a = box([0, 0, 0], 10, 10, 10)
    const b = box([10, 0, 0], 10, 10, 10)
    const c = box([35, 0, 0], 10, 10, 10)
    const r = KKCT.occlusion.merge([a, b, c])
    check('detached box refused by name', !r.ok && r.reason.includes('does not touch'), r.reason)
}

{
    const big = box([0, 0, 0], 30, 30, 30)
    const in1 = box([5, 5, 0], 5, 5, 5)
    const in2 = box([-5, -5, 0], 5, 5, 5)
    const r = KKCT.occlusion.merge([in1, big, in2])
    check('winner is the biggest, others zeroed', r.ok && r.mode === 'contained' && r.zeroed.length === 2 && !r.zeroed.some(z => z.boxIndex === 1), r.ok ? `zeroed ${r.zeroed.map(z => z.boxIndex).join(',')}` : r.reason)
}

{
    const cs = Math.cos(0.6)
    const sn = Math.sin(0.6)
    const a = box([0, 0, 0], 10, 10, 10, cs, sn)
    const b = box([10 * cs, 10 * sn, 0], 10, 10, 10, cs, sn)
    const r = KKCT.occlusion.merge([a, b])
    check('shared rotation merges', r.ok && r.mode === 'union' && r.waste === 0, r.ok ? `waste ${r.waste}` : r.reason)
}

{
    const a = box([0, 0, 0], 10, 10, 10)
    const stale = { ...box([8, 0, 0], 10, 10, 10), bi: undefined }
    check('stale boxes refused in clip', !KKCT.occlusion.clip([a, stale], 0).ok)
    check('stale boxes refused in merge', !KKCT.occlusion.merge([a, stale]).ok)
    check('stale box refused in zero', !KKCT.occlusion.zero(stale).ok)
}

console.log('')
console.log('--- transform ---')

{
    const a = box([100, -200, 30], 10, 8, 6)
    const r = KKCT.occlusion.transform(a, { c: [110, -195, 32], l: 12, w: 7, h: 5, cz: Math.cos(0.5), sz: Math.sin(0.5) })
    check('transform accepts a valid edit', r.ok, r.ok ? '' : r.reason)
    check('transform rounds the after values', r.ok && r.after.l === 12 && r.after.c[0] === 110)
    check('transform writes rotation fields', r.ok && typeof r.fields.iSinZ === 'number' && typeof r.fields.iCosZ === 'number')
    check('rotation fields at half scale', r.ok && Math.abs(r.fields.iSinZ - Math.round(Math.cos(0.5) * 0.5 * 32767)) <= 1 && Math.abs(r.fields.iCosZ - Math.round(Math.sin(0.5) * 0.5 * 32767)) <= 1)
}

{
    const a = box([0, 0, 0], 10, 10, 10)
    check('too thin refused', !KKCT.occlusion.transform(a, { c: [0, 0, 0], l: 0.2, w: 10, h: 10 }).ok)
    check('out of range refused', !KKCT.occlusion.transform(a, { c: [9000, 0, 0], l: 10, w: 10, h: 10 }).ok)
    check('bad data refused', !KKCT.occlusion.transform(a, { c: [0, 0], l: 10, w: 10, h: 10 }).ok)
    const stale = { ...a, bi: undefined }
    check('stale box refused in transform', !KKCT.occlusion.transform(stale, { c: [0, 0, 0], l: 10, w: 10, h: 10 }).ok)
}

{
    const a = box([0, 0, 0], 10, 10, 10)
    const r = KKCT.occlusion.transform(a, { c: [0, 0, 0], l: 10, w: 10, h: 10, cz: 3, sz: 4 })
    check('rotation gets normalized', r.ok && Math.abs(r.after.cz - 0.6) < 0.001 && Math.abs(r.after.sz - 0.8) < 0.001, r.ok ? `${r.after.cz}, ${r.after.sz}` : r.reason)
}

console.log('')
console.log('--- apply and restore on real files ---')

const source = process.argv[2]
if (!source) {
    console.log('skipped, pass a real .ymap with a box occluder as argv[2]')
    process.exit(failed ? 1 : 0)
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'kkct-occl-'))
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
const off = real.l * 0.8
const shifted = {
    ...real,
    resource: 'map_b',
    rel,
    file: base,
    l: real.l * 0.6,
    c: [real.c[0] + off * real.cz, real.c[1] + off * real.sz, real.c[2]]
}
console.log(`real occluder ${real.bi} at ${real.c.join(', ')} size ${real.l} x ${real.w} x ${real.h}`)

const merge = KKCT.occlusion.merge([a, shifted])
check('union merge computes on real box', merge.ok && merge.mode === 'union', merge.ok ? `waste ${merge.waste}, expands ${merge.expand.boxIndex}` : merge.reason)
if (merge.ok) {
    const group = 'g_test'
    const boxes = [a, shifted]
    if (merge.expand) {
        const winner = boxes[merge.expand.boxIndex]
        KKCT.decisions.addAsset({
            action: 'clip', conflictId: 'c1', file: base,
            loser: { resource: winner.resource, relPath: rel },
            box: { index: merge.expand.index, fields: merge.expand.fields, after: merge.expand.after },
            group
        })
    }
    for (const z of merge.zeroed) {
        const loser = boxes[z.boxIndex]
        KKCT.decisions.addAsset({
            action: 'clip', conflictId: 'c1', file: base,
            loser: { resource: loser.resource, relPath: rel },
            box: { index: z.index, fields: z.fields, after: z.after },
            group
        })
    }
    const result = await KKCT.resolver.apply(() => {})
    check('apply has no errors', result.errors.length === 0, JSON.stringify(result.errors))
    check('two clips applied', result.summary.clipped === 2, JSON.stringify(result.summary))

    const winner = boxes[merge.expand.boxIndex]
    const loser = boxes[merge.zeroed[0].boxIndex]
    const wFile = winner.resource === 'map_a' ? fileA : fileB
    const zFile = loser.resource === 'map_a' ? fileA : fileB
    const wBox = KKCT.ymap.parse(fs.readFileSync(wFile)).boxOccluders.find(x => x.bi === real.bi)
    const zBox = KKCT.ymap.parse(fs.readFileSync(zFile)).boxOccluders.find(x => x.bi === real.bi)
    check('winner grew on disk', !!wBox && wBox.l > real.l * 0.9 && Math.abs(wBox.l - merge.expand.after.l) < 0.3, wBox ? `${real.l} -> ${wBox.l}` : 'missing')
    check('loser zeroed on disk', !!zBox && zBox.l === 0 && zBox.w === 0 && zBox.h === 0)

    const restore = await KKCT.backups.restore(result.bundleId, () => {})
    check('restore ok', restore.ok, JSON.stringify(restore.errors))
    check('both files byte identical after restore', fs.readFileSync(fileA).equals(originalBytes) && fs.readFileSync(fileB).equals(originalBytes))

    KKCT.decisions.undo()
    check('grouped undo empties the queue', KKCT.decisions.pendingAssets().length === 0)
}

{
    const yaw = 0.5236
    const edit = KKCT.occlusion.transform(a, {
        c: [real.c[0] + 2, real.c[1] - 1.5, real.c[2] + 0.5],
        l: real.l + 3,
        w: Math.max(1, real.w - 1),
        h: real.h + 1,
        cz: Math.cos(yaw),
        sz: Math.sin(yaw)
    })
    check('transform computes on real box', edit.ok, edit.ok ? '' : edit.reason)
    if (edit.ok) {
        KKCT.decisions.addAsset({
            action: 'clip', conflictId: 'c2', file: base,
            loser: { resource: 'map_a', relPath: rel },
            box: { index: edit.index, fields: edit.fields, after: edit.after }
        })
        const result = await KKCT.resolver.apply(() => {})
        check('transform apply has no errors', result.errors.length === 0, JSON.stringify(result.errors))
        const got = KKCT.ymap.parse(fs.readFileSync(fileA)).boxOccluders.find(x => x.bi === real.bi)
        check('center moved on disk', !!got && Math.abs(got.c[0] - edit.after.c[0]) < 0.3 && Math.abs(got.c[1] - edit.after.c[1]) < 0.3)
        check('size changed on disk', !!got && Math.abs(got.l - edit.after.l) < 0.3 && Math.abs(got.h - edit.after.h) < 0.3)
        check('rotation changed on disk', !!got && Math.abs(got.cz - Math.cos(yaw)) < 0.01 && Math.abs(got.sz - Math.sin(yaw)) < 0.01, got ? `cz ${got.cz}, sz ${got.sz}` : 'missing')
        const restore = await KKCT.backups.restore(result.bundleId, () => {})
        check('transform restore ok', restore.ok && fs.readFileSync(fileA).equals(originalBytes), JSON.stringify(restore.errors))
    }
}

fs.rmSync(sandbox, { recursive: true, force: true })
console.log('')
console.log(failed ? `${failed} check(s) failed` : 'all checks passed')
process.exit(failed ? 1 : 0)
