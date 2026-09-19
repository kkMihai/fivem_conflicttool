const { describe, expect, test } = require('bun:test')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

function setup(otherContent = false) {
    const fields = {
        root: {
            entitiesExtentsMin: 0,
            entitiesExtentsMax: 16,
            streamingExtentsMin: 32,
            streamingExtentsMax: 48
        },
        entity: { position: 0 }
    }
    const source = Buffer.alloc(192)
    const write = (at, values) => values.forEach((value, i) => source.writeFloatLE(value, at + i * 4))
    write(8, [0, 0, 0])
    write(24, [20, 30, 40])
    write(40, [-10, -10, -10])
    write(56, [30, 40, 50])
    write(80, [1, 2, 3])
    write(112, [4, 5, 6])
    const read = (data, at) => [0, 1, 2].map(i => data.readFloatLE(at + i * 4))
    const context = {
        Buffer,
        KKCT: {
            joaatCase: value => value,
            rsc7: { parse: buf => ({ data: buf }), write: (_, data) => data },
            meta: {
                T: { VEC3: 0x33, VEC4: 0x34 },
                parse: data => ({
                    T: { VEC3: 0x33, VEC4: 0x34 },
                    fieldOffset: (struct, field) => ({ offset: fields[struct][field], type: 0x33 }),
                    readRoot: () => ({
                        __abs: 8,
                        __struct: 'root',
                        entitiesExtentsMin: read(data, 8),
                        entitiesExtentsMax: read(data, 24),
                        streamingExtentsMin: read(data, 40),
                        streamingExtentsMax: read(data, 56),
                        entities: [
                            { __abs: 80, __struct: 'entity', position: read(data, 80) },
                            { __abs: 112, __struct: 'entity', position: read(data, 112) }
                        ],
                        boxOccluders: otherContent ? [{}] : []
                    })
                })
            }
        }
    }
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server/lib/ymap.js'), 'utf8'), context)
    return { source, ymap: context.KKCT.ymap, read }
}

describe('whole YMAP translation', () => {
    test('moves every entity and both bounds by the same offset', () => {
        const { source, ymap, read } = setup()
        const result = ymap.translate(source, [10, -2, 5])
        expect(result.count).toBe(2)
        expect(read(result.buf, 80)).toEqual([11, 0, 8])
        expect(read(result.buf, 112)).toEqual([14, 3, 11])
        expect(read(result.buf, 8)).toEqual([10, -2, 5])
        expect(read(result.buf, 24)).toEqual([30, 28, 45])
        expect(read(result.buf, 40)).toEqual([0, -12, -5])
        expect(read(result.buf, 56)).toEqual([40, 38, 55])
        expect(read(source, 80)).toEqual([1, 2, 3])
    })

    test('keeps old streaming bounds when unmoved content exists', () => {
        const { source, ymap, read } = setup(true)
        const result = ymap.translate(source, [10, -2, 5])
        expect(read(result.buf, 40)).toEqual([-10, -12, -10])
        expect(read(result.buf, 56)).toEqual([40, 40, 55])
    })

    test('rejects invalid offsets', () => {
        const { source, ymap } = setup()
        expect(() => ymap.translate(source, [1, NaN, 3])).toThrow('invalid YMAP offset')
    })
})
