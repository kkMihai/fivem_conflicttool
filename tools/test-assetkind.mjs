import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const dir = path.dirname(fileURLToPath(import.meta.url))
require(path.join(dir, '..', 'server', 'lib', 'assetkind.js'))
const KKCT = globalThis.KKCT

let failed = 0
function check(name, cond, extra) {
    console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? `  ${extra}` : ''}`)
    if (!cond) failed++
}

console.log('--- unit ---')
{
    const tmp = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'kkct-kind-'))
    const veh = path.join(tmp, 'vehicles.meta')
    fs.writeFileSync(veh, '<CVehicleModelInfo__InitDataList><InitDatas><Item><modelName>adder</modelName></Item><Item><modelName>Sultan2</modelName></Item></InitDatas></CVehicleModelInfo__InitDataList>')
    const k = KKCT.assetkind.create()
    k.addResource('carpack', [veh], '/srv/resources/carpack')
    check('meta model name is a vehicle', k.classify('carpack', 'adder.yft') === 'vehicle')
    check('meta match is case insensitive', k.classify('carpack', 'SULTAN2.ytd') === 'vehicle')
    check('hi lod variant is a vehicle', k.classify('carpack', 'adder+hi.ytd') === 'vehicle')
    check('unknown model in a vehicle resource is a vehicle', k.classify('carpack', 'randompart.yft') === 'vehicle')
    check('ymap stays a map', k.classify('carpack', 'street.ymap') === 'map', k.classify('carpack', 'street.ymap'))
    check('ybn stays a map', k.classify('carpack', 'street.ybn') === 'map')

    const k2 = KKCT.assetkind.create()
    k2.addResource('props_pack', [], '/srv/resources/props_pack')
    check('plain resource model is a prop', k2.classify('props_pack', 'prop_bench.ydr') === 'prop')
    check('unknown resource file is a prop', k2.classify('nothing_known', 'prop_bench.ydr') === 'prop')
    check('unknown extension is other', k2.classify('props_pack', 'readme.txt') === 'other')

    const k3 = KKCT.assetkind.create()
    k3.addResource('shared_parts', [], '/srv/resources/[vehicles]/shared_parts')
    check('vehicles folder hints vehicle', k3.classify('shared_parts', 'alu_exh1.yft') === 'vehicle')
    const k4 = KKCT.assetkind.create()
    k4.addResource('civ_clothes', [], '/srv/resources/[clothing]/civ_clothes')
    check('clothing folder hints ped', k4.classify('civ_clothes', 'mp_f_freemode_01^accs_000_u.ydd') === 'ped')
    const k5 = KKCT.assetkind.create()
    k5.addResource('mapres', [], '/srv/resources/[maps]/mapres')
    check('map folder has no model hint', k5.classify('mapres', 'thing.ydr') === 'prop')
    check('folder hint never beats a map extension', k3.classify('shared_parts', 'thing.ymap') === 'map')
    fs.rmSync(tmp, { recursive: true, force: true })
}

const root = process.argv[2]
if (!root) {
    console.log('')
    console.log(failed ? `${failed} check(s) failed` : 'all checks passed')
    process.exit(failed ? 1 : 0)
}
console.log('')
console.log('--- real resources ---')

const ASSET_EXTS = new Set(['.ydr', '.ydd', '.ytd', '.yft', '.ymap', '.ytyp', '.ybn'])
const SKIP = new Set(['node_modules', '.git', 'web'])

function findResources(base, out, depth) {
    if (depth > 6) return
    let entries
    try {
        entries = fs.readdirSync(base, { withFileTypes: true })
    } catch {
        return
    }
    if (entries.some(e => e.isFile() && e.name.toLowerCase() === 'fxmanifest.lua')) {
        out.push(base)
        return
    }
    for (const e of entries) {
        if (e.isDirectory() && !SKIP.has(e.name.toLowerCase())) findResources(path.join(base, e.name), out, depth + 1)
    }
}

function walk(base, assets, metas, depth) {
    if (depth > 12) return
    let entries
    try {
        entries = fs.readdirSync(base, { withFileTypes: true })
    } catch {
        return
    }
    for (const e of entries) {
        if (e.isDirectory()) {
            if (!SKIP.has(e.name.toLowerCase())) walk(path.join(base, e.name), assets, metas, depth + 1)
        } else {
            const lower = e.name.toLowerCase()
            const ext = path.extname(lower)
            if (ASSET_EXTS.has(ext)) assets.push(path.join(base, e.name))
            else if (KKCT.assetkind.META_FILES.has(lower)) metas.push(path.join(base, e.name))
        }
    }
}

const resourceDirs = []
findResources(root, resourceDirs, 0)
console.log(`found ${resourceDirs.length} resources under ${root}`)

const kinds = KKCT.assetkind.create()
const perResource = new Map()
const started = Date.now()
for (const rd of resourceDirs) {
    const name = path.basename(rd)
    const assets = []
    const metas = []
    walk(rd, assets, metas, 0)
    kinds.addResource(name, metas, rd)
    perResource.set(name, assets)
}
console.log(`walked in ${Date.now() - started}ms, ${kinds.size()} resources carry meta files`)

const counts = { vehicle: 0, ped: 0, weapon: 0, map: 0, prop: 0, other: 0 }
const samples = { vehicle: [], ped: [], weapon: [], map: [], prop: [], other: [] }
let total = 0
for (const [name, assets] of perResource) {
    for (const abs of assets) {
        const k = kinds.classify(name, path.basename(abs))
        counts[k]++
        total++
        if (samples[k].length < 4) samples[k].push(`${name}/${path.basename(abs)}`)
    }
}

console.log('')
console.log(`classified ${total} files`)
for (const k of Object.keys(counts)) {
    console.log(`  ${k.padEnd(8)} ${String(counts[k]).padStart(6)}   ${samples[k].join(', ')}`)
}

console.log('')
check('found vehicle files', counts.vehicle > 0, `${counts.vehicle}`)
check('found map files', counts.map > 0, `${counts.map}`)
check('every file got a kind', total === Object.values(counts).reduce((a, b) => a + b, 0))
check('no ymap called a vehicle', !samples.vehicle.some(s => s.endsWith('.ymap')))
check('baseName strips hi lod', KKCT.assetkind.baseName('adder+hi.yft') === 'adder' && KKCT.assetkind.baseName('adder_hi.ytd') === 'adder')
check('baseName strips path and case', KKCT.assetkind.baseName('stream/SUB/Adder.YFT') === 'adder')

console.log('')
console.log(failed ? `${failed} check(s) failed` : 'all checks passed')
process.exit(failed ? 1 : 0)
