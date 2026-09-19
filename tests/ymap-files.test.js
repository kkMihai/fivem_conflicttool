const { describe, expect, test } = require('bun:test')

globalThis.KKCT = globalThis.KKCT || {}
KKCT.names = { resolve: value => String(value) }
KKCT.ymap = { hidden: () => false }
KKCT.joaat = () => 0
require('../server/conflicts.js')

const entity = (mlo = false) => ({ a: 123, g: 1, p: [1, 2, 3], r: [0, 0, 0, 1], mlo })
const entry = (entities, inStream = true, entitiesExtents = null) => ({
    resource: 'tree_pack',
    order: 1,
    rel: 'stream/trees.ymap',
    ext: 'ymap',
    size: 100,
    sha1: '1234',
    inStream,
    parseError: null,
    parsed: { parent: 0, entities, entitiesExtents, boxOccluders: [], occludeModels: [] }
})

describe('editable YMAP files', () => {
    test('lists streamed props without another YMAP conflict', () => {
        const found = KKCT.conflicts.detect(new Map([['trees.ymap', [entry([entity()])]]]), [], null)
        const ymap = found.find(item => item.kind === 'ymap-file')
        expect(ymap).toBeDefined()
        expect(ymap.resources[0].rel).toBe('stream/trees.ymap')
        expect(ymap.badges).toContain('1 editable prop')
    })

    test('skips MLO instances and files outside stream', () => {
        const mlo = KKCT.conflicts.detect(new Map([['trees.ymap', [entry([entity(true)])]]]), [], null)
        const outside = KKCT.conflicts.detect(new Map([['trees.ymap', [entry([entity()], false)]]]), [], null)
        expect(mlo.some(item => item.kind === 'ymap-file')).toBe(false)
        expect(outside.some(item => item.kind === 'ymap-file')).toBe(false)
    })

    test('focuses the center of YMAP entity bounds', () => {
        const bounds = { min: [10, 20, 30], max: [30, 60, 50] }
        const found = KKCT.conflicts.detect(new Map([['trees.ymap', [entry([entity()], true, bounds)]]]), [], null)
        expect(found.find(item => item.kind === 'ymap-file').pos).toEqual([20, 40, 40])
    })

    test('uses prop bounds when YMAP extents are unavailable', () => {
        const first = { ...entity(), p: [10, 20, 30] }
        const second = { ...entity(), g: 2, p: [30, 60, 50] }
        const found = KKCT.conflicts.detect(new Map([['trees.ymap', [entry([first, second])]]]), [], null)
        expect(found.find(item => item.kind === 'ymap-file').pos).toEqual([20, 40, 40])
    })
})
