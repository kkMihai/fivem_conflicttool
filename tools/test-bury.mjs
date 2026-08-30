import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

globalThis.GetConvar = (k, d) => (process.env.KKCT_BURY ? (k === 'fivem_conflicttool_bury_depth' ? process.env.KKCT_BURY : d) : d)

const require = createRequire(import.meta.url)
const dir = path.dirname(fileURLToPath(import.meta.url))

const source = process.argv[2]
if (!source) {
    console.log('usage: node tools/test-bury.mjs <a-real-file.ymap>')
    process.exit(1)
}

require(path.join(dir, '..', 'server', 'lib', 'joaat.js'))
require(path.join(dir, '..', 'server', 'lib', 'rsc7.js'))
require(path.join(dir, '..', 'server', 'lib', 'meta.js'))
require(path.join(dir, '..', 'server', 'lib', 'ymap.js'))

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'kkct-bury-'))
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

const KKCT = globalThis.KKCT
KKCT.decisions.init(fakeRoot)
KKCT.resolver.init(fakeRoot)

const before = KKCT.ymap.parse(originalBytes)
const ent = before.entities.find(e => !e.mlo)
if (!ent) {
    console.log('this ymap has no movable entity, pick another')
    fs.rmSync(sandbox, { recursive: true, force: true })
    process.exit(1)
}
console.log(`target entity ${ent.a} at ${ent.p.join(', ')}`)

KKCT.decisions.addAsset({
    action: 'bury',
    conflictId: 'c_test',
    file: path.basename(source),
    loser: { resource: 'some_map', relPath: `stream/${path.basename(source)}`, sha1: sha },
    entity: { archetype: ent.a, from: ent.p, to: [ent.p[0], ent.p[1], ent.p[2] - 1000] }
})

const result = await KKCT.resolver.apply(() => {})
console.log('apply:', JSON.stringify(result.summary), 'errors:', JSON.stringify(result.errors))

const after = KKCT.ymap.parse(fs.readFileSync(testFile))
const depth = process.env.KKCT_BURY ? Math.abs(parseFloat(process.env.KKCT_BURY)) : Math.min(30000, Math.max(1000, Math.max(ent.ld || 0, ent.cld || 0) + 1000))
const buried = after.entities.find(e => e.a === ent.a && Math.abs(e.p[2] - (ent.p[2] - depth)) < 0.05)
console.log('file still present:', fs.existsSync(testFile))
console.log('entity buried:', !!buried, buried ? `now at ${buried.p.join(', ')}` : '')
console.log('entity count unchanged:', after.entities.length === before.entities.length, `${before.entities.length} -> ${after.entities.length}`)
console.log('occluder count unchanged:', after.boxOccluders.length === before.boxOccluders.length)
console.log('bytes changed:', !fs.readFileSync(testFile).equals(originalBytes))

const restore = await KKCT.backups.restore(result.bundleId, () => {})
console.log('restore:', JSON.stringify(restore))
console.log('file byte identical to original after restore:', fs.readFileSync(testFile).equals(originalBytes))

fs.rmSync(sandbox, { recursive: true, force: true })
console.log('sandbox cleaned')
