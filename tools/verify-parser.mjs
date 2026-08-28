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
require(path.join(dir, '..', 'server', 'lib', 'ytyp.js'))
require(path.join(dir, '..', 'server', 'lib', 'ybn.js'))

const KKCT = globalThis.KKCT
const file = process.argv[2]
if (!file) {
    console.log('usage: node verify-parser.mjs <file.ymap|file.ytyp|file.ybn> [--full]')
    process.exit(1)
}

const buf = fs.readFileSync(file)
const ext = path.extname(file).toLowerCase()
let result
if (ext === '.ymap') result = KKCT.ymap.parse(buf)
else if (ext === '.ytyp') result = KKCT.ytyp.parse(buf)
else if (ext === '.ybn') result = KKCT.ybn.parse(buf)
else throw new Error(`unsupported extension ${ext}`)

if (process.argv.includes('--full')) {
    console.log(JSON.stringify(result, null, 2))
} else if (ext === '.ymap') {
    console.log(JSON.stringify({
        name: result.name,
        entities: result.entities.length,
        boxOccluders: result.boxOccluders.length,
        occludeModels: result.occludeModels.length,
        carGens: result.carGens.length,
        physDicts: result.physDicts.length,
        lodLights: result.lodLights,
        distLodLights: result.distLodLights,
        extents: result.entitiesExtents,
        firstEntities: result.entities.slice(0, 5)
    }, null, 2))
} else if (ext === '.ytyp') {
    console.log(JSON.stringify({ name: result.name, archetypes: result.archetypes.length, mloCount: result.mloCount, first: result.archetypes.slice(0, 5) }, null, 2))
} else {
    console.log(JSON.stringify(result, null, 2))
}
