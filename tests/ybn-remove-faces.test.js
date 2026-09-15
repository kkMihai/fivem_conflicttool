const { describe, expect, test } = require('bun:test')

globalThis.KKCT = globalThis.KKCT || {}
require('../server/lib/rsc7.js')
require('../server/lib/collmats.js')
require('../server/lib/ybn.js')
require('../server/lib/collision.js')

const pointer = offset => (0x50000000 | offset) >>> 0

function geometry() {
    const data = Buffer.alloc(0x1000)
    data.writeUInt8(4, 0x10)
    data.writeFloatLE(10, 0x20)
    data.writeFloatLE(10, 0x24)
    data.writeFloatLE(1, 0x28)
    data.writeUInt32LE(pointer(0x200), 0x88)
    data.writeFloatLE(1, 0x90)
    data.writeFloatLE(1, 0x94)
    data.writeFloatLE(1, 0x98)
    data.writeUInt32LE(pointer(0x300), 0xb0)
    data.writeUInt32LE(4, 0xd0)
    data.writeUInt32LE(2, 0xd4)
    data.writeUInt32LE(pointer(0x400), 0xf0)
    data.writeUInt32LE(pointer(0x500), 0x118)
    data.writeUInt8(1, 0x120)
    const verts = [[0, 0, 0], [10, 0, 0], [0, 10, 0], [10, 10, 0]]
    verts.forEach((vert, i) => vert.forEach((value, axis) => data.writeInt16LE(value, 0x300 + i * 6 + axis * 2)))
    ;[[0, 1, 2], [1, 3, 2]].forEach((tri, i) => {
        const off = 0x200 + i * 16
        data.writeUInt8(0, off)
        tri.forEach((value, axis) => data.writeUInt16LE(value, off + 4 + axis * 2))
    })
    const flags = KKCT.rsc7.onePageFlags(data.length, 0)
    return KKCT.rsc7.pack({ version: 43, graphicsFlags: 0 }, flags, data, 0)
}

describe('YBN face removal', () => {
    test('removes selected collision triangles without changing polygon indexes', () => {
        const source = geometry()
        const edit = KKCT.collision.removeFaces(KKCT.ybn.inspect(source), 2, 0, [0])
        expect(edit.ok).toBe(true)
        const patched = KKCT.ybn.patch(source, edit.edits).buf
        expect(KKCT.ybn.faceData(patched, 0, 100).tris).toHaveLength(9)
        expect(KKCT.ybn.removedFaces(patched, 0, [0])).toBe(1)
        expect(KKCT.ybn.inspect(patched).bounds[0].faces).toBe(1)
    })
})
