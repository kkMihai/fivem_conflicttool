const { describe, expect, test } = require('bun:test')

globalThis.KKCT = globalThis.KKCT || {}
require('../server/lib/rsc7.js')
require('../server/lib/collmats.js')
require('../server/lib/ybn.js')

const pointer = offset => (0x50000000 | offset) >>> 0

function composite() {
    const data = Buffer.alloc(0x2000)
    data.writeUInt8(10, 0x10)
    data.writeFloatLE(1, 0x20)
    data.writeFloatLE(1, 0x24)
    data.writeFloatLE(1, 0x28)
    data.writeFloatLE(-1, 0x30)
    data.writeFloatLE(-1, 0x34)
    data.writeFloatLE(-1, 0x38)
    data.writeUInt32LE(pointer(0x200), 0x70)
    data.writeUInt32LE(pointer(0x220), 0x78)
    data.writeUInt32LE(pointer(0x220), 0x80)
    data.writeUInt32LE(pointer(0x280), 0x88)
    data.writeUInt16LE(1, 0xa0)
    data.writeUInt16LE(1, 0xa2)
    data.writeUInt32LE(pointer(0x300), 0x200)
    data.writeUInt8(3, 0x310)
    data.writeFloatLE(1, 0x320)
    data.writeFloatLE(1, 0x324)
    data.writeFloatLE(1, 0x328)
    data.writeFloatLE(-1, 0x330)
    data.writeFloatLE(-1, 0x334)
    data.writeFloatLE(-1, 0x338)
    data.writeFloatLE(1, 0x220)
    data.writeFloatLE(1, 0x234)
    data.writeFloatLE(1, 0x248)
    for (const off of [0x22c, 0x23c, 0x24c, 0x25c]) data.writeUInt32LE(0x7f800001, off)
    const flags = KKCT.rsc7.onePageFlags(data.length, 0)
    return KKCT.rsc7.pack({ version: 43, graphicsFlags: 0 }, flags, data, 0)
}

describe('YBN matrices', () => {
    test('turns matrix flag words into JSON-safe affine values', () => {
        const inspect = KKCT.ybn.inspect(composite())
        expect(inspect.bounds[0].m.every(Number.isFinite)).toBe(true)
        expect([inspect.bounds[0].m[3], inspect.bounds[0].m[7], inspect.bounds[0].m[11], inspect.bounds[0].m[15]]).toEqual([0, 0, 0, 1])
    })

    test('preserves matrix flag words when editing', () => {
        const matrix = KKCT.ybn.inspect(composite()).bounds[0].m
        matrix[12] = 5
        const patched = KKCT.ybn.patch(composite(), [{ kind: 'boundMatrix', bi: 0, m: matrix }]).buf
        const data = KKCT.rsc7.parse(patched).data
        for (const off of [0x22c, 0x23c, 0x24c, 0x25c]) expect(data.readUInt32LE(off)).toBe(0x7f800001)
    })
})
