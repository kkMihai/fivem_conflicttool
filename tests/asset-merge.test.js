const { describe, expect, test } = require('bun:test')

globalThis.KKCT = globalThis.KKCT || {}
require('../server/lib/rsc7.js')
require('../server/lib/rscmerge.js')
require('../server/lib/assetmerge.js')

const pointer = offset => (0x50000000 | offset) >>> 0

function resource(fill) {
    const data = Buffer.alloc(0x2000)
    data.writeUInt32LE(1, 4)
    fill(data)
    const flags = KKCT.rsc7.onePageFlags(data.length, 0)
    return KKCT.rsc7.pack({ version: 165, graphicsFlags: 0 }, flags, data, 0)
}

function ydd(name) {
    return resource(data => {
        data.writeUInt32LE(pointer(0x100), 0x20)
        data.writeUInt16LE(1, 0x28)
        data.writeUInt16LE(1, 0x2a)
        data.writeUInt32LE(pointer(0x110), 0x30)
        data.writeUInt16LE(1, 0x38)
        data.writeUInt16LE(1, 0x3a)
        data.writeUInt32LE(name, 0x100)
        data.writeUInt32LE(pointer(0x200), 0x110)
        data.writeUInt32LE(1, 0x204)
    })
}

function ybn(x) {
    return resource(data => {
        data.writeUInt8(3, 0x10)
        data.writeFloatLE(x + 1, 0x20)
        data.writeFloatLE(1, 0x24)
        data.writeFloatLE(1, 0x28)
        data.writeFloatLE(x, 0x30)
        data.writeFloatLE(-1, 0x34)
        data.writeFloatLE(-1, 0x38)
    })
}

function drawable(data, base, seed) {
    const shaderGroup = base + 0x100
    const shaderArray = base + 0x140
    const shader = base + 0x160
    const models = base + 0x200
    const model = base + 0x240
    data.writeUInt32LE(pointer(shaderGroup), base + 0x10)
    data.writeUInt32LE(pointer(models), base + 0x50)
    data.writeUInt32LE(pointer(models), base + 0xa0)
    data.writeUInt32LE(pointer(shaderArray), shaderGroup + 0x10)
    data.writeUInt16LE(1, shaderGroup + 0x18)
    data.writeUInt16LE(1, shaderGroup + 0x1a)
    data.writeUInt32LE(pointer(shader), shaderArray)
    data.writeUInt32LE(seed, shader + 8)
    data.writeUInt32LE(pointer(models + 0x10), models)
    data.writeUInt16LE(1, models + 8)
    data.writeUInt16LE(1, models + 10)
    data.writeUInt32LE(pointer(model), models + 0x10)
    data.writeUInt32LE(seed, model)
}

function ydr(seed) {
    return resource(data => drawable(data, 0, seed))
}

function yft(seed) {
    return resource(data => {
        data.writeUInt32LE(pointer(0x180), 0x30)
        drawable(data, 0x180, seed)
    })
}

const copies = (a, b) => [{ resource: 'first', buf: a }, { resource: 'last', buf: b }]

describe('binary asset merge', () => {
    test('unions named YDD drawables', () => {
        const merged = KKCT.assetmerge.merge(copies(ydd(11), ydd(22)), 'ydd')
        expect(merged.ok).toBe(true)
        expect(merged.target).toBe(1)
        expect(KKCT.assetmerge.inspect(merged.buf, 'ydd').total).toBe(2)
    })

    test('wraps YBN roots in one composite', () => {
        const merged = KKCT.assetmerge.merge(copies(ybn(-5), ybn(5)), 'ybn')
        expect(merged.ok).toBe(true)
        expect(KKCT.assetmerge.inspect(merged.buf, 'ybn').total).toBe(2)
    })

    test('keeps the selected YBN base exact when base wins', () => {
        const first = ybn(-5)
        const last = ybn(5)
        const merged = KKCT.assetmerge.merge(copies(first, last), 'ybn', 'three-way')
        expect(merged.ok).toBe(true)
        expect(merged.target).toBe(1)
        expect(merged.buf.equals(last)).toBe(true)
        expect(KKCT.assetmerge.inspect(merged.buf, 'ybn').total).toBe(1)
        expect(merged.report.effective).toBe('three-way')
        expect(merged.report.copies[1].target).toBe(true)
        expect(merged.report.copies[0].excluded).toBe(true)
    })

    test('unions YDR models and shaders', () => {
        const merged = KKCT.assetmerge.merge(copies(ydr(11), ydr(22)), 'ydr')
        expect(merged.ok).toBe(true)
        expect(KKCT.assetmerge.inspect(merged.buf, 'ydr')).toEqual({ total: 2, shaders: 2 })
    })

    test('unions compatible YFT drawable models', () => {
        const merged = KKCT.assetmerge.merge(copies(yft(11), yft(22)), 'yft')
        expect(merged.ok).toBe(true)
        expect(KKCT.assetmerge.inspect(merged.buf, 'yft')).toEqual({ total: 2, shaders: 2 })
        expect(merged.report.warnings).toHaveLength(1)
    })
})
