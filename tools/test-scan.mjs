import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const dir = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(dir, '..')
const resourcesRoot = process.argv[2]
if (!resourcesRoot) {
    console.log('usage: node tools/test-scan.mjs <path-to-resources-folder>')
    process.exit(1)
}

const found = []
function findResources(d, depth) {
    if (depth > 4) return
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (!e.isDirectory()) continue
        const full = path.join(d, e.name)
        if (e.name.startsWith('[')) {
            findResources(full, depth + 1)
        } else if (fs.existsSync(path.join(full, 'fxmanifest.lua')) || fs.existsSync(path.join(full, '__resource.lua'))) {
            found.push({ name: e.name, path: full })
        }
    }
}
findResources(resourcesRoot, 0)
console.log(`discovered ${found.length} resources`)

globalThis.GetNumResources = () => found.length
globalThis.GetResourceByFindIndex = i => found[i] ? found[i].name : null
globalThis.GetResourceState = () => 'started'
globalThis.GetResourcePath = name => {
    const r = found.find(x => x.name === name)
    return r ? r.path.replace(/\\/g, '/') : null
}
globalThis.GetCurrentResourceName = () => 'fivem_conflicttool'

require(path.join(root, 'server', 'lib', 'joaat.js'))
require(path.join(root, 'server', 'lib', 'rsc7.js'))
require(path.join(root, 'server', 'lib', 'meta.js'))
require(path.join(root, 'server', 'lib', 'ymap.js'))
require(path.join(root, 'server', 'lib', 'ytyp.js'))
require(path.join(root, 'server', 'lib', 'ybn.js'))
require(path.join(root, 'server', 'lib', 'names.js'))
require(path.join(root, 'server', 'scanner.js'))
require(path.join(root, 'server', 'conflicts.js'))

const KKCT = globalThis.KKCT
KKCT.names.loadDictionary(root)
KKCT.conflicts.loadVanilla(root)
KKCT.scanner.init(root)

const started = Date.now()
const scan = await KKCT.scanner.run(p => {
    if (p.phase === 'walk' && p.current % 50 === 0) process.stdout.write(`\rwalk ${p.current}/${p.total}   `)
    if (p.phase === 'parse' && p.current % 400 === 0) process.stdout.write(`\rparse ${p.current}/${p.total}   `)
})
console.log('')
console.log(`scan took ${Date.now() - started}ms`)
console.log(`files: ${scan.fileCount}, resources: ${scan.resourceCount}, modPacks: ${scan.modPackCount}`)
console.log(`parse errors: ${scan.parseErrors.length}`)
for (const e of scan.parseErrors.slice(0, 10)) console.log(`  ERR ${e.resource}/${e.file}: ${e.msg}`)
console.log(`conflicts: ${scan.conflicts.length}`)
const byCat = {}
for (const c of scan.conflicts) byCat[c.cat] = (byCat[c.cat] || 0) + 1
console.log('by category:', byCat)
console.log('auto-resolvable:', scan.conflicts.filter(c => c.autoRes).length)
const keySet = new Set(scan.conflicts.map(c => c.key))
console.log(`stable keys: ${keySet.size} unique of ${scan.conflicts.length} (${scan.conflicts.filter(c => !c.key).length} missing)`)
console.log('archetype dups:', scan.conflicts.filter(c => c.kind === 'dup-archetype').length)
console.log('top streaming weights:')
for (const w of (scan.weights || []).slice(0, 6)) {
    console.log(`  ${w.name}: ${(w.bytes / 1048576).toFixed(1)} MB, ${w.files} files${w.over.length ? `, ${w.over.length} OVERSIZED` : ''}`)
}
const started2 = Date.now()
await KKCT.scanner.run(() => {})
console.log(`re-scan took ${Date.now() - started2}ms`)
console.log('')
for (const c of scan.conflicts.filter(c => c.kind === 'dup-file').slice(0, 25)) {
    console.log(`${c.cat.toUpperCase().padEnd(6)} ${c.title}  [${c.badges.join(', ')}]  ${c.sub}`)
}
console.log('')
for (const c of scan.conflicts.filter(c => c.cat === 'prop').slice(0, 15)) {
    console.log(`PROP   ${c.kind.padEnd(15)} ${c.title}  @${c.pos ? c.pos.map(n => n.toFixed(1)).join(',') : '?'}  ${c.sub}`)
}
const payload = JSON.stringify({ conflicts: scan.conflicts })
console.log('')
console.log(`payload size: ${(payload.length / 1024).toFixed(1)} KB`)
