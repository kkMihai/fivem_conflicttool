(() => {
const crypto = require('crypto')

globalThis.KKCT = globalThis.KKCT || {}

KKCT.assetmerge = (() => {
    const hash = value => crypto.createHash('sha1').update(value).digest('hex')
    const sys = (src, value) => {
        if ((value >>> 28) !== 5) return -1
        const offset = value & 0x0fffffff
        return offset < src.systemSize ? offset : -1
    }
    const readVec3 = (data, off) => [data.readFloatLE(off), data.readFloatLE(off + 4), data.readFloatLE(off + 8)]
    const writeVec3 = (data, off, value) => {
        data.writeFloatLE(value[0], off)
        data.writeFloatLE(value[1], off + 4)
        data.writeFloatLE(value[2], off + 8)
    }
    const min3 = values => [0, 1, 2].map(a => Math.min(...values.map(v => v[a])))
    const max3 = values => [0, 1, 2].map(a => Math.max(...values.map(v => v[a])))

    function report(copies, target, total, added, warnings, effective) {
        return {
            effective: effective || 'union',
            total,
            copies: copies.map((copy, i) => ({
                resource: copy.resource,
                total: copy.total || 0,
                shared: 0,
                onlyHere: i === target ? 0 : (copy.total || 0),
                removed: 0,
                lost: 0,
                excluded: false,
                target: i === target,
                warnings: []
            })),
            totals: { merged: total, added, removed: 0, changed: 0, conflicts: 0, unresolved: 0 },
            warnings: warnings || []
        }
    }

    function ordered(copies) {
        const target = copies.length - 1
        return { target, list: [copies[target], ...copies.slice(0, target).reverse()] }
    }

    function ydd(copies) {
        const { target, list } = ordered(copies)
        const ws = KKCT.rscmerge.workspace(list.map(c => c.buf))
        const selected = new Map()
        list.forEach((copy, si) => {
            const src = ws.sources[si]
            const hashesPtr = sys(src, src.system.readUInt32LE(0x20))
            const drawablesPtr = sys(src, src.system.readUInt32LE(0x30))
            const count = src.system.readUInt16LE(0x28)
            if (hashesPtr < 0 || drawablesPtr < 0 || count !== src.system.readUInt16LE(0x38)) throw new Error('invalid YDD dictionary')
            copy.total = count
            for (let i = 0; i < count; i++) {
                const name = src.system.readUInt32LE(hashesPtr + i * 4)
                if (!selected.has(name)) selected.set(name, { src, value: src.system.readUInt32LE(drawablesPtr + i * 8) })
            }
        })
        if (!selected.size || selected.size > 0xffff) throw new Error('YDD has no mergeable drawables')
        const hashesAt = ws.alloc(selected.size * 4)
        const drawablesAt = ws.alloc(selected.size * 8)
        let i = 0
        for (const [name, item] of selected) {
            ws.system.writeUInt32LE(name, hashesAt + i * 4)
            ws.system.writeUInt32LE(ws.virtual(item.src, item.value), drawablesAt + i * 8)
            i++
        }
        ws.system.writeUInt32LE(ws.ptr(5, hashesAt), 0x20)
        ws.system.writeUInt16LE(selected.size, 0x28)
        ws.system.writeUInt16LE(selected.size, 0x2a)
        ws.system.writeUInt32LE(ws.ptr(5, drawablesAt), 0x30)
        ws.system.writeUInt16LE(selected.size, 0x38)
        ws.system.writeUInt16LE(selected.size, 0x3a)
        const result = ws.finish()
        const targetTotal = copies[target].total || 0
        return { buf: result.buf, target, report: report(copies, target, selected.size, Math.max(0, selected.size - targetTotal)) }
    }

    function modelLists(src, drawable) {
        return [0x50, 0x58, 0x60, 0x68].map(field => {
            const head = sys(src, src.system.readUInt32LE(drawable + field))
            if (head < 0) return []
            const values = sys(src, src.system.readUInt32LE(head))
            const count = src.system.readUInt16LE(head + 8)
            if (values < 0 || count > 4096) throw new Error('invalid drawable model list')
            return Array.from({ length: count }, (_, i) => src.system.readUInt32LE(values + i * 8))
        })
    }

    function shaders(src, drawable) {
        const group = sys(src, src.system.readUInt32LE(drawable + 0x10))
        if (group < 0) return { group: -1, values: [] }
        const values = sys(src, src.system.readUInt32LE(group + 0x10))
        const count = src.system.readUInt16LE(group + 0x18)
        if (count && values < 0) throw new Error('invalid drawable shader list')
        return {
            group,
            values: Array.from({ length: count }, (_, i) => src.system.readUInt32LE(values + i * 8))
        }
    }

    function skeletonKey(src, drawable) {
        const skeleton = sys(src, src.system.readUInt32LE(drawable + 0x18))
        if (skeleton < 0) return null
        const head = Buffer.from(src.system.subarray(skeleton, skeleton + 112))
        for (const off of [0x08, 0x10, 0x20, 0x28, 0x30, 0x38, 0x40, 0x48, 0x68]) head.fill(0, off, off + 8)
        const count = src.system.readUInt16LE(skeleton + 0x5e)
        const childCount = src.system.readUInt16LE(skeleton + 0x60)
        const parts = [head]
        const bones = sys(src, src.system.readUInt32LE(skeleton + 0x20))
        if (bones >= 16 && count) {
            const raw = Buffer.from(src.system.subarray(bones - 16, Math.min(bones + count * 80, src.system.length)))
            for (let i = 0; i < count; i++) raw.fill(0, 16 + i * 80 + 0x38, 16 + i * 80 + 0x40)
            parts.push(raw)
        }
        for (const [field, bytes] of [[0x28, count * 64], [0x30, count * 64], [0x38, count * 2], [0x40, childCount * 2]]) {
            const offset = sys(src, src.system.readUInt32LE(skeleton + field))
            if (offset >= 0 && bytes) parts.push(src.system.subarray(offset, Math.min(offset + bytes, src.system.length)))
        }
        return hash(Buffer.concat(parts))
    }

    function mergeDrawable(ws, specs) {
        const target = specs[0]
        const targetOut = target.src.systemOffset + target.drawable
        const targetSkeleton = skeletonKey(target.src, target.drawable)
        const allShaders = []
        const lods = [[], [], [], []]
        let shaderBase = 0
        let total = 0
        for (const spec of specs) {
            const shader = shaders(spec.src, spec.drawable)
            const lists = modelLists(spec.src, spec.drawable)
            for (const value of shader.values) allShaders.push({ src: spec.src, value })
            lists.forEach((values, level) => {
                for (const value of values) {
                    const model = sys(spec.src, value)
                    if (model < 0) throw new Error('drawable model pointer is invalid')
                    const binding = spec.src.system.readUInt32LE(model + 0x28)
                    if (spec !== target && ((binding >>> 8) & 0xff) && skeletonKey(spec.src, spec.drawable) !== targetSkeleton) {
                        throw new Error('skinned drawable skeletons differ')
                    }
                    const mapping = sys(spec.src, spec.src.system.readUInt32LE(model + 0x20))
                    const count = spec.src.system.readUInt16LE(model + 0x10)
                    if (mapping < 0 && count) throw new Error('drawable shader mapping is invalid')
                    for (let i = 0; i < count; i++) {
                        const at = spec.src.systemOffset + mapping + i * 2
                        const next = ws.system.readUInt16LE(at) + shaderBase
                        if (next > 0xffff) throw new Error('merged drawable has too many shaders')
                        ws.system.writeUInt16LE(next, at)
                    }
                    lods[level].push({ src: spec.src, value })
                    total++
                }
            })
            spec.modelCount = lists.reduce((n, values) => n + values.length, 0)
            shaderBase += shader.values.length
        }
        if (!total) throw new Error('drawable has no models to merge')
        if (allShaders.length > 0xffff) throw new Error('merged drawable has too many shaders')
        const targetShader = shaders(target.src, target.drawable)
        if (targetShader.group < 0 && allShaders.length) throw new Error('target drawable has no shader group')
        if (targetShader.group >= 0) {
            const array = ws.alloc(allShaders.length * 8)
            allShaders.forEach((item, i) => ws.system.writeUInt32LE(ws.virtual(item.src, item.value), array + i * 8))
            const group = target.src.systemOffset + targetShader.group
            ws.system.writeUInt32LE(ws.ptr(5, array), group + 0x10)
            ws.system.writeUInt16LE(allShaders.length, group + 0x18)
            ws.system.writeUInt16LE(allShaders.length, group + 0x1a)
        }
        let first = 0
        let bytes = 0
        lods.forEach((items, level) => {
            const field = 0x50 + level * 8
            if (!items.length) {
                ws.system.writeUInt32LE(0, targetOut + field)
                ws.system.writeUInt32LE(0, targetOut + field + 4)
                return
            }
            const head = ws.alloc(16 + items.length * 8)
            if (!first) first = head
            bytes += 16 + items.length * 8
            ws.system.writeUInt32LE(ws.ptr(5, head + 16), head)
            ws.system.writeUInt16LE(items.length, head + 8)
            ws.system.writeUInt16LE(items.length, head + 10)
            items.forEach((item, i) => ws.system.writeUInt32LE(ws.virtual(item.src, item.value), head + 16 + i * 8))
            ws.system.writeUInt32LE(ws.ptr(5, head), targetOut + field)
        })
        ws.system.writeUInt16LE(Math.ceil(bytes / 16), targetOut + 0x9a)
        ws.system.writeUInt32LE(ws.ptr(5, first), targetOut + 0xa0)
        const mins = specs.map(spec => readVec3(spec.src.system, spec.drawable + 0x30))
        const maxs = specs.map(spec => readVec3(spec.src.system, spec.drawable + 0x40))
        const min = min3(mins)
        const max = max3(maxs)
        const center = min.map((v, i) => (v + max[i]) / 2)
        writeVec3(ws.system, targetOut + 0x20, center)
        writeVec3(ws.system, targetOut + 0x30, min)
        writeVec3(ws.system, targetOut + 0x40, max)
        ws.system.writeFloatLE(Math.hypot(max[0] - center[0], max[1] - center[1], max[2] - center[2]), targetOut + 0x2c)
        return total
    }

    function drawableFile(copies, ext) {
        const { target, list } = ordered(copies)
        const ws = KKCT.rscmerge.workspace(list.map(c => c.buf))
        const specs = list.map((copy, i) => {
            const src = ws.sources[i]
            const drawable = ext === 'yft' ? sys(src, src.system.readUInt32LE(0x30)) : 0
            if (drawable < 0) throw new Error(`${ext.toUpperCase()} has no main drawable`)
            return { copy, src, drawable }
        })
        const total = mergeDrawable(ws, specs)
        specs.forEach(spec => { spec.copy.total = spec.modelCount })
        const result = ws.finish()
        const targetTotal = copies[target].total || 0
        const warnings = ext === 'yft' ? ['Merged drawable models. Physics and fragment hierarchy come from the selected base copy.'] : []
        return { buf: result.buf, target, report: report(copies, target, total, Math.max(0, total - targetTotal), warnings) }
    }

    function ybnItems(copy, src) {
        const data = src.system
        const type = data.readUInt8(0x10)
        copy.total = type === 10 ? data.readUInt16LE(0xa0) : 1
        if (type !== 10) return [{ src, value: 0x50000000, transform: null, flags1: null, flags2: null, index: 0 }]
        const count = data.readUInt16LE(0xa0)
        const children = sys(src, data.readUInt32LE(0x70))
        const transforms = sys(src, data.readUInt32LE(0x78))
        const flags1 = sys(src, data.readUInt32LE(0x90))
        const flags2 = sys(src, data.readUInt32LE(0x98))
        if (children < 0 || count > 0xffff) throw new Error('invalid YBN composite')
        return Array.from({ length: count }, (_, i) => ({
            src,
            value: data.readUInt32LE(children + i * 8),
            transform: transforms < 0 ? null : Buffer.from(data.subarray(transforms + i * 64, transforms + i * 64 + 64)),
            flags1: flags1 < 0 ? null : Buffer.from(data.subarray(flags1 + i * 8, flags1 + i * 8 + 8)),
            flags2: flags2 < 0 ? null : Buffer.from(data.subarray(flags2 + i * 8, flags2 + i * 8 + 8)),
            index: i
        }))
    }

    function itemKey(item) {
        const off = sys(item.src, item.value)
        if (off < 0) throw new Error('YBN child pointer is invalid')
        const base = Buffer.from(item.src.system.subarray(off + 0x10, Math.min(off + 0x70, item.src.system.length)))
        const type = item.src.system.readUInt8(off + 0x10)
        const parts = [base, item.transform || Buffer.alloc(0)]
        if (type === 4 || type === 8) {
            const poly = sys(item.src, item.src.system.readUInt32LE(off + 0x88))
            const verts = sys(item.src, item.src.system.readUInt32LE(off + 0xb0))
            const mats = sys(item.src, item.src.system.readUInt32LE(off + 0x118))
            const polyCount = item.src.system.readUInt32LE(off + 0xd4)
            const vertCount = item.src.system.readUInt32LE(off + 0xd0)
            if (poly >= 0) parts.push(item.src.system.subarray(poly, Math.min(poly + polyCount * 16, item.src.system.length)))
            if (verts >= 0) parts.push(item.src.system.subarray(verts, Math.min(verts + vertCount * 6, item.src.system.length)))
            if (mats >= 0) parts.push(item.src.system.subarray(mats, Math.min(mats + polyCount, item.src.system.length)))
        }
        return hash(Buffer.concat(parts))
    }

    function identity() {
        const out = Buffer.alloc(64)
        out.writeFloatLE(1, 0)
        out.writeFloatLE(1, 20)
        out.writeFloatLE(1, 40)
        out.writeUInt32LE(1, 28)
        out.writeUInt32LE(1, 44)
        return out
    }

    function ybn(copies, policy) {
        const { target, list } = ordered(copies)
        const ws = KKCT.rscmerge.workspace(list.map(c => c.buf), { systemPrefix: 0xb0 })
        if (policy !== 'union') {
            list.forEach((copy, i) => ybnItems(copy, ws.sources[i]))
            const total = copies[target].total || 0
            const result = report(copies, target, total, 0, [
                'Base wins keeps the selected collision bounds exactly and disables the other copies.'
            ], 'three-way')
            result.copies.forEach((copy, i) => {
                copy.removed = i === target ? 0 : copy.total
                copy.onlyHere = 0
                copy.excluded = i !== target
            })
            result.totals.removed = result.copies.reduce((sum, copy) => sum + copy.removed, 0)
            return { buf: Buffer.from(copies[target].buf), target, report: result }
        }
        const unique = new Map()
        list.forEach((copy, i) => {
            for (const item of ybnItems(copy, ws.sources[i])) {
                const key = itemKey(item)
                if (!unique.has(key)) unique.set(key, item)
            }
        })
        const items = [...unique.values()]
        if (!items.length || items.length > 0xffff) throw new Error('YBN has no mergeable bounds')
        ws.sources[0].system.copy(ws.system, 0, 0x10, 0x70)
        ws.system.writeUInt32LE(1080212136, 0)
        ws.system.writeUInt32LE(1, 4)
        ws.system.writeUInt8(10, 0x10)
        const children = ws.alloc(items.length * 8)
        const transforms = ws.alloc(items.length * 64)
        const boxes = ws.alloc(items.length * 32)
        const flags1 = ws.alloc(items.length * 8)
        const flags2 = ws.alloc(items.length * 8)
        const ident = identity()
        const mins = ws.sources.map(src => readVec3(src.system, 0x30))
        const maxs = ws.sources.map(src => readVec3(src.system, 0x20))
        items.forEach((item, i) => {
            const off = sys(item.src, item.value)
            ws.system.writeUInt32LE(ws.virtual(item.src, item.value), children + i * 8)
            ;(item.transform || ident).copy(ws.system, transforms + i * 64)
            ;(item.flags1 || Buffer.alloc(8)).copy(ws.system, flags1 + i * 8)
            ;(item.flags2 || Buffer.alloc(8)).copy(ws.system, flags2 + i * 8)
            const min = readVec3(item.src.system, off + 0x30)
            const max = readVec3(item.src.system, off + 0x20)
            writeVec3(ws.system, boxes + i * 32, min)
            writeVec3(ws.system, boxes + i * 32 + 16, max)
        })
        const min = min3(mins)
        const max = max3(maxs)
        const center = min.map((v, i) => (v + max[i]) / 2)
        writeVec3(ws.system, 0x20, max)
        writeVec3(ws.system, 0x30, min)
        writeVec3(ws.system, 0x40, center)
        writeVec3(ws.system, 0x50, center)
        ws.system.writeFloatLE(Math.hypot(max[0] - center[0], max[1] - center[1], max[2] - center[2]), 0x14)
        ws.system.writeUInt32LE(ws.ptr(5, children), 0x70)
        ws.system.writeUInt32LE(ws.ptr(5, transforms), 0x78)
        ws.system.writeUInt32LE(ws.ptr(5, transforms), 0x80)
        ws.system.writeUInt32LE(ws.ptr(5, boxes), 0x88)
        ws.system.writeUInt32LE(ws.ptr(5, flags1), 0x90)
        ws.system.writeUInt32LE(ws.ptr(5, flags2), 0x98)
        ws.system.writeUInt16LE(items.length, 0xa0)
        ws.system.writeUInt16LE(items.length, 0xa2)
        ws.system.fill(0, 0xa4, 0xb0)
        const result = ws.finish()
        const targetTotal = copies[target].total || 0
        return { buf: result.buf, target, report: report(copies, target, items.length, Math.max(0, items.length - targetTotal)) }
    }

    function merge(copies, ext, policy) {
        try {
            const result = ext === 'ybn' ? ybn(copies, policy || 'union') : ext === 'ydd' ? ydd(copies) : drawableFile(copies, ext)
            result.ok = true
            result.report.digest = hash(result.buf)
            return result
        } catch (error) {
            return { ok: false, reason: error.message, report: report(copies, copies.length - 1, 0, 0) }
        }
    }

    function inspect(buf, ext) {
        const src = KKCT.rscmerge.source(buf, 0)
        const need = (value, label) => {
            const offset = sys(src, value)
            if (offset < 0) throw new Error(`${label} pointer is invalid`)
            return offset
        }
        if (ext === 'ybn') {
            if (src.system.readUInt8(0x10) !== 10) return { total: 1 }
            if (!src.system.readUInt16LE(0xa0)) throw new Error('merged YBN root is empty')
            const children = need(src.system.readUInt32LE(0x70), 'YBN children')
            const count = src.system.readUInt16LE(0xa0)
            for (let i = 0; i < count; i++) need(src.system.readUInt32LE(children + i * 8), 'YBN child')
            return { total: count }
        }
        if (ext === 'ydd') {
            const hashes = need(src.system.readUInt32LE(0x20), 'YDD hashes')
            const drawables = need(src.system.readUInt32LE(0x30), 'YDD drawables')
            const count = src.system.readUInt16LE(0x28)
            if (!count || count !== src.system.readUInt16LE(0x38)) throw new Error('merged YDD dictionary is empty')
            for (let i = 0; i < count; i++) {
                src.system.readUInt32LE(hashes + i * 4)
                need(src.system.readUInt32LE(drawables + i * 8), 'YDD drawable')
            }
            return { total: count }
        }
        const drawable = ext === 'yft' ? need(src.system.readUInt32LE(0x30), 'YFT drawable') : 0
        const lists = modelLists(src, drawable)
        const shader = shaders(src, drawable)
        let total = 0
        for (const values of lists) {
            for (const value of values) {
                const model = need(value, 'drawable model')
                const count = src.system.readUInt16LE(model + 0x10)
                const mapping = count ? need(src.system.readUInt32LE(model + 0x20), 'drawable shader mapping') : -1
                for (let i = 0; i < count; i++) {
                    if (src.system.readUInt16LE(mapping + i * 2) >= shader.values.length) throw new Error('drawable shader index is invalid')
                }
                total++
            }
        }
        if (!total) throw new Error(`merged ${ext.toUpperCase()} has no models`)
        return { total, shaders: shader.values.length }
    }

    return { merge, inspect }
})()
})()
