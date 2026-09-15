const { describe, expect, test } = require('bun:test')

globalThis.KKCT = globalThis.KKCT || {}
KKCT.names = { resolve: value => String(value) }
KKCT.ymap = { hidden: () => false }
KKCT.joaat = () => 0
require('../server/conflicts.js')

describe('editable collision files', () => {
    test('lists a readable streamed YBN without a conflict', () => {
        const entry = {
            resource: 'map_pack',
            order: 1,
            rel: 'stream/room.ybn',
            ext: 'ybn',
            size: 100,
            sha1: '1234567890abcdef',
            inStream: true,
            parseError: null,
            parsed: { bmin: [0, 0, 0], bmax: [10, 10, 10] }
        }
        const found = KKCT.conflicts.detect(new Map([['room.ybn', [entry]]]), [], null)
        expect(found).toHaveLength(1)
        expect(found[0].kind).toBe('collision-file')
        expect(found[0].resources[0].rel).toBe('stream/room.ybn')
    })

    test('does not list unreadable or non-streamed YBN files as editable', () => {
        const base = {
            resource: 'map_pack',
            order: 1,
            ext: 'ybn',
            size: 100,
            sha1: '1234567890abcdef',
            parsed: { bmin: [0, 0, 0], bmax: [10, 10, 10] }
        }
        const outside = { ...base, rel: 'data/outside.ybn', inStream: false, parseError: null }
        const broken = { ...base, rel: 'stream/broken.ybn', inStream: true, parseError: 'bad', parsed: null }
        expect(KKCT.conflicts.detect(new Map([['outside.ybn', [outside]]]), [], null)).toHaveLength(0)
        expect(KKCT.conflicts.detect(new Map([['broken.ybn', [broken]]]), [], null)).toHaveLength(0)
    })

    test('lists every readable copy of a conflicting YBN as an editable file', () => {
        const base = {
            order: 1,
            ext: 'ybn',
            size: 100,
            inStream: true,
            parseError: null,
            parsed: { bmin: [0, 0, 0], bmax: [10, 10, 10] }
        }
        const entries = [
            { ...base, resource: 'first_pack', rel: 'stream/room.ybn', sha1: '1111' },
            { ...base, resource: 'second_pack', rel: 'stream/room.ybn', sha1: '2222', order: 2 }
        ]
        const found = KKCT.conflicts.detect(new Map([['room.ybn', entries]]), [], null)
        expect(found.filter(item => item.kind === 'collision-file')).toHaveLength(2)
        expect(found.filter(item => item.kind === 'dup-file')).toHaveLength(1)
    })

    test('lists streamed YMAP box occluders as an editable file', () => {
        const entry = {
            resource: 'map_pack',
            order: 1,
            rel: 'stream/room.ymap',
            ext: 'ymap',
            size: 100,
            sha1: '1234',
            inStream: true,
            parseError: null,
            parsed: {
                parent: 0,
                entities: [],
                boxOccluders: [{ bi: 0, c: [1, 2, 3], l: 4, w: 5, h: 6, cz: 1, sz: 0 }],
                occludeModels: []
            }
        }
        const found = KKCT.conflicts.detect(new Map([['room.ymap', [entry]]]), [], null)
        expect(found).toHaveLength(1)
        expect(found[0].kind).toBe('occlusion-file')
        expect(found[0].boxes[0].rel).toBe('stream/room.ymap')
    })
})
