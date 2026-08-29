import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const dir = path.dirname(fileURLToPath(import.meta.url))

const source = process.argv[2]
if (!source) {
    console.log('usage: node tools/test-entityfile.mjs <a-real-file.ymap with 2+ entities>')
    process.exit(1)
}

require(path.join(dir, '..', 'server', 'lib', 'joaat.js'))
require(path.join(dir, '..', 'server', 'lib', 'rsc7.js'))
require(path.join(dir, '..', 'server', 'lib', 'meta.js'))
require(path.join(dir, '..', 'server', 'lib', 'ymap.js'))

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'kkct-entfile-'))
const fakeRoot = path.join(sandbox, 'fivem_conflicttool')
const fakeRes = path.join(sandbox, 'some_map')
fs.mkdirSync(path.join(fakeRes, 'stream'), { recursive: true })
fs.mkdirSync(fakeRoot, { recursive: true })
const base = path.basename(source)
const rel = `stream/${base}`
const testFile = path.join(fakeRes, 'stream', base)
fs.copyFileSync(source, testFile)
const originalBytes = fs.readFileSync(testFile)
const sha = h => crypto.createHash('sha1').update(h).digest('hex')
const originalSha = sha(originalBytes)

globalThis.GetResourcePath = name => (name === 'some_map' ? fakeRes.split(path.sep).join('/') : null)
globalThis.GetCurrentResourceName = () => 'fivem_conflicttool'

require(path.join(dir, '..', 'server', 'decisions.js'))
require(path.join(dir, '..', 'server', 'resolver.js'))
require(path.join(dir, '..', 'server', 'backups.js'))

const KKCT = globalThis.KKCT
KKCT.decisions.init(fakeRoot)
KKCT.resolver.init(fakeRoot)

let failed = 0
function check(name, cond, extra) {
    console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? `  ${extra}` : ''}`)
    if (!cond) failed++
}

const before = KKCT.ymap.parse(originalBytes)
const nonMlo = before.entities.filter(e => !e.mlo)
if (nonMlo.length < 2) {
    console.log('this ymap needs at least 2 non-mlo entities, pick another')
    fs.rmSync(sandbox, { recursive: true, force: true })
    process.exit(1)
}
const entA = nonMlo[0]
const entB = nonMlo[1]
console.log(`entity A ${entA.a} at ${entA.p.join(', ')}`)
console.log(`entity B ${entB.a} at ${entB.p.join(', ')}`)

const yaw = 0.7
const wantRot = [0, 0, Math.sin(yaw / 2), Math.cos(yaw / 2)]
const newPos = [entA.p[0] + 5, entA.p[1] - 3, entA.p[2] + 2]

console.log('')
console.log('--- move with rotation + remove, same file, one apply ---')

KKCT.decisions.addEntity({
    action: 'remove',
    conflictId: 'c_legacy',
    archetype: 'legacy_no_targets',
    hash: 12345,
    guid: 0,
    original: { pos: [1, 2, 3], rot: [0, 0, 0, 1] },
    new: null,
    hideRadius: 0.5
})

KKCT.decisions.addEntity({
    action: 'move',
    conflictId: 'c_move',
    archetype: 'test_prop_a',
    hash: entA.a,
    guid: entA.g,
    original: { pos: entA.p, rot: entA.r },
    targets: [{ resource: 'some_map', rel, from: entA.p, model: entA.a }],
    new: { pos: newPos, rot: wantRot },
    hideRadius: 0.5
})

KKCT.decisions.addEntity({
    action: 'remove',
    conflictId: 'c_remove',
    archetype: 'test_prop_b',
    hash: entB.a,
    guid: entB.g,
    original: { pos: entB.p, rot: entB.r },
    targets: [{ resource: 'some_map', rel, from: entB.p, model: entB.a }],
    new: null,
    hideRadius: 0.5
})

check('meta counts two entity file jobs', KKCT.decisions.meta().entityFilePending === 2, String(KKCT.decisions.meta().entityFilePending))
check('queued lists both entityFiles ids', KKCT.decisions.queuedConflictIds().entityFiles.length === 2)

const result = await KKCT.resolver.apply(() => {})
check('apply has no errors', result.errors.length === 0, JSON.stringify(result.errors))
check('summary counts the filed move', result.summary.filedMoves === 1, JSON.stringify(result.summary))
check('shared file counts once as a filed move', result.summary.buried === 0 && result.summary.filedMoves === 1, `buried ${result.summary.buried}, filedMoves ${result.summary.filedMoves}`)
check('one backup row for the shared file', result.summary.files === 1, String(result.summary.files))
check('both conflicts reported applied', result.conflictIds.includes('c_move') && result.conflictIds.includes('c_remove'))
check('legacy runtime decision still counts as applied live', result.conflictIds.includes('c_legacy'))

const parsed = KKCT.ymap.parse(fs.readFileSync(testFile))
const movedEnt = parsed.entities.find(e => e.a === entA.a && Math.abs(e.p[0] - newPos[0]) < 0.05 && Math.abs(e.p[2] - newPos[2]) < 0.05)
check('moved entity at the new position', !!movedEnt, movedEnt ? movedEnt.p.join(', ') : 'missing')
if (movedEnt) {
    const dot = movedEnt.r[0] * wantRot[0] + movedEnt.r[1] * wantRot[1] + movedEnt.r[2] * wantRot[2] + movedEnt.r[3] * wantRot[3]
    check('moved entity carries the new rotation', Math.abs(dot) > 0.999, `dot ${dot.toFixed(5)}`)
}
const buriedEnt = parsed.entities.find(e => e.a === entB.a && Math.abs(e.p[2] - (entB.p[2] - 1000)) < 0.05)
check('removed entity buried at z-1000', !!buriedEnt, buriedEnt ? String(buriedEnt.p[2]) : 'missing')

const recs = KKCT.decisions.entities()
check('move record marked applied', recs.find(e => e.conflictId === 'c_move')?.state === 'applied')
check('remove record marked applied', recs.find(e => e.conflictId === 'c_remove')?.state === 'applied')
check('legacy record stays live', (recs.find(e => e.conflictId === 'c_legacy')?.state || 'live') === 'live')
check('undo refuses an applied record', KKCT.decisions.undo() === null)

console.log('')
console.log('--- resolve re-run is idempotent ---')
const rerun = await KKCT.resolver.apply(() => {})
check('second apply does nothing and errors nothing', rerun.errors.length === 0 && rerun.summary.files === 0, JSON.stringify(rerun.summary))

console.log('')
console.log('--- backup integrity with two edits in one file ---')
const manifest = JSON.parse(fs.readFileSync(path.join(fakeRoot, 'data', 'backups', result.bundleId, 'manifest.json'), 'utf8'))
check('manifest has exactly one row for the file', manifest.moves.length === 1, String(manifest.moves.length))
check('manifest row carries the pristine sha', manifest.moves[0].sha1 === originalSha)
const backupFile = path.join(fakeRoot, 'data', 'backups', result.bundleId, 'some_map', 'stream', base)
check('backup file is byte identical to the original', fs.readFileSync(backupFile).equals(originalBytes))

const restore = await KKCT.backups.restore(result.bundleId, () => {})
check('restore ok', restore.ok, JSON.stringify(restore.errors))
check('live file byte identical after restore', fs.readFileSync(testFile).equals(originalBytes))
check('restored records flip back to live', KKCT.decisions.entities().filter(e => (e.state || 'live') === 'live' && e.conflictId !== 'c_legacy').length === 2)

console.log('')
console.log('--- boot prune drops applied records ---')
const applyAgain = await KKCT.resolver.apply(() => {})
check('third apply re-applies after restore', applyAgain.errors.length === 0 && applyAgain.summary.files === 1, JSON.stringify(applyAgain.summary))
KKCT.decisions.init(fakeRoot)
const afterBoot = KKCT.decisions.entities()
check('applied records pruned at boot', afterBoot.every(e => (e.state || 'live') !== 'applied'), String(afterBoot.length))
check('legacy live record survives boot', afterBoot.some(e => e.conflictId === 'c_legacy'))

fs.rmSync(sandbox, { recursive: true, force: true })
console.log('')
console.log(failed ? `${failed} check(s) failed` : 'all checks passed')
process.exit(failed ? 1 : 0)
