import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const dir = path.dirname(fileURLToPath(import.meta.url))
require(path.join(dir, '..', 'server', 'lib', 'joaat.js'))
require(path.join(dir, '..', 'server', 'lib', 'names.js'))
require(path.join(dir, '..', 'server', 'conflicts.js'))
const KKCT = globalThis.KKCT

let failed = 0
function check(name, cond, extra) {
    console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? `  ${extra}` : ''}`)
    if (!cond) failed++
}

function ymap(entities) {
    return {
        entities: entities.map(e => ({ a: e.a, p: e.p, r: e.r ?? [0, 0, 0, 1], g: e.g ?? 0, ld: 0, cld: 0, ll: 0, mlo: false })),
        boxOccluders: [],
        occludeModels: [],
        carGens: [],
        physDicts: [],
        entitiesExtents: null,
        streamingExtents: null
    }
}

function entry(resource, rel, order, inStream, sha1, parsed) {
    return { resource, order, abs: rel, rel, ext: 'ymap', size: 1000, sha1, inStream, parsed, parseError: null }
}

const arch = KKCT.joaat('prop_bench_01a')
const groundPos = [100, 200, 30]
const airPos = [100, 200, 31.93]

{
    const streamed = entry('map_pack', 'stream/downtown_01.ymap', 7, true, 'aaa', ymap([{ a: arch, p: airPos, g: 4242 }]))
    const dead = entry('map_pack', 'source/downtown_01.ymap', 7, false, 'bbb', ymap([{ a: arch, p: groundPos, g: 4242 }]))
    const index = new Map([['downtown_01.ymap', [streamed, dead]]])
    const out = KKCT.conflicts.detect(index, [])
    const dup = out.find(c => c.kind === 'dup-file')
    check('same resource pair still surfaces', !!dup)
    check('streamed copy wins despite walk order', dup && dup.resources[1].rel === 'stream/downtown_01.ymap', dup?.resources[1].rel)
    check('dead copy is labeled', dup && dup.resources[0].status === 'never loads · outside stream', dup?.resources[0].status)
    check('badge counts the dead copy', dup && dup.badges.some(b => b.includes('outside stream')), dup?.badges.join(' | '))
    check('summary says internal copies', dup && dup.summary === undefined || dup.explain.summary.includes('ships 2 copies'), dup?.explain.summary)
    check('sub does not say resource vs itself', dup && !dup.sub.includes(' vs '), dup?.sub)
    const moved = out.find(c => c.kind === 'entity-moved')
    check('moved prop row exists', !!moved)
    check('target is the streamed placement', moved && Math.abs(moved.target.pos[2] - 31.93) < 0.01, moved && String(moved.target.pos[2]))
    check('marker sits on the streamed placement', moved && Math.abs(moved.pos[2] - 31.93) < 0.01, moved && String(moved.pos[2]))
}

{
    const low = entry('map_a', 'stream/x.ymap', 3, true, 'aaa', ymap([{ a: arch, p: groundPos }]))
    const high = entry('map_b', 'stream/x.ymap', 9, true, 'bbb', ymap([{ a: arch, p: groundPos }]))
    const index = new Map([['x.ymap', [high, low]]])
    const out = KKCT.conflicts.detect(index, [])
    const dup = out.find(c => c.kind === 'dup-file')
    check('both streamed keeps load order', dup && dup.resources[1].name === 'map_b', dup?.resources[1].name)
    check('cross resource keeps vs sub', dup && dup.sub === 'map_a vs map_b', dup?.sub)
    check('no dead badge when all streamed', dup && !dup.badges.some(b => b.includes('outside stream')))
}

{
    const streamedLow = entry('map_a', 'stream/y.ymap', 3, true, 'aaa', ymap([{ a: arch, p: groundPos }]))
    const deadHigh = entry('map_b', 'y.ymap', 9, false, 'bbb', ymap([{ a: arch, p: groundPos }]))
    const index = new Map([['y.ymap', [streamedLow, deadHigh]]])
    const out = KKCT.conflicts.detect(index, [])
    const dup = out.find(c => c.kind === 'dup-file')
    check('streamed beats higher start order', dup && dup.resources[1].name === 'map_a', dup?.resources[1].name)
    check('dead higher-order copy labeled', dup && dup.resources[0].status === 'never loads · outside stream', dup?.resources[0].status)
}

{
    const deadA = entry('map_a', 'src/z.ymap', 3, false, 'aaa', ymap([{ a: arch, p: groundPos }]))
    const deadB = entry('map_b', 'src/z.ymap', 9, false, 'bbb', ymap([{ a: arch, p: groundPos }]))
    const index = new Map([['z.ymap', [deadA, deadB]]])
    const out = KKCT.conflicts.detect(index, [])
    const dup = out.find(c => c.kind === 'dup-file')
    check('all outside stream keeps old behavior', dup && dup.resources[1].name === 'map_b' && !dup.badges.some(b => b.includes('outside stream')), dup?.badges.join(' | '))
}

console.log('')
console.log(failed ? `${failed} check(s) failed` : 'all checks passed')
process.exit(failed ? 1 : 0)
