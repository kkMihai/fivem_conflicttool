import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const dir = path.dirname(fileURLToPath(import.meta.url))

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'kkct-apply-'))
const fakeRoot = path.join(sandbox, 'fivem_conflicttool')
const fakeRes = path.join(sandbox, 'some_map')
fs.mkdirSync(path.join(fakeRes, 'stream'), { recursive: true })
fs.mkdirSync(fakeRoot, { recursive: true })
const testFile = path.join(fakeRes, 'stream', 'dupe.ymap')
fs.writeFileSync(testFile, 'FAKE_YMAP_CONTENT_12345')
const sha = crypto.createHash('sha1').update(fs.readFileSync(testFile)).digest('hex')

globalThis.GetResourcePath = name => (name === 'some_map' ? fakeRes.replace(/\\/g, '/') : null)
globalThis.GetCurrentResourceName = () => 'fivem_conflicttool'

require(path.join(dir, '..', 'server', 'decisions.js'))
require(path.join(dir, '..', 'server', 'resolver.js'))
require(path.join(dir, '..', 'server', 'backups.js'))

const KKCT = globalThis.KKCT
KKCT.decisions.init(fakeRoot)
KKCT.resolver.init(fakeRoot)

KKCT.decisions.addAsset({
    conflictId: 'c_test',
    file: 'dupe.ymap',
    loser: { resource: 'some_map', relPath: 'stream/dupe.ymap', sha1: sha },
    winner: { resource: 'other_map', sha1: 'x' }
})

console.log('pending before apply:', KKCT.decisions.pendingAssets().length)
const result = await KKCT.resolver.apply(p => console.log('  progress', p.label))
console.log('apply result:', JSON.stringify(result))
console.log('file removed from resource:', !fs.existsSync(testFile))
const bundles = KKCT.backups.list()
console.log('bundles:', JSON.stringify(bundles.map(b => ({ id: b.id, files: b.files, current: b.current }))))
const backupFile = path.join(fakeRoot, 'data', 'backups', result.bundleId, 'some_map', 'stream', 'dupe.ymap')
console.log('backup exists:', fs.existsSync(backupFile))

const restore = await KKCT.backups.restore(result.bundleId, p => console.log('  restore', p.label))
console.log('restore result:', JSON.stringify(restore))
console.log('file back in resource:', fs.existsSync(testFile))
console.log('content identical:', fs.readFileSync(testFile, 'utf8') === 'FAKE_YMAP_CONTENT_12345')

fs.writeFileSync(testFile, 'DIFFERENT_CONTENT_NOW')
const restore2 = await KKCT.backups.restore(result.bundleId, () => {})
console.log('second restore over changed file (should skip, sha mismatch is error):', JSON.stringify(restore2.errors))

fs.rmSync(sandbox, { recursive: true, force: true })
console.log('sandbox cleaned')
