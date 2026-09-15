(() => {
const crypto = require('crypto')

globalThis.KKCT = globalThis.KKCT || {}

KKCT.metawrite = (() => {
    const T = {
        BOOL: 0x01, S8: 0x10, U8: 0x11, S16: 0x12, U16: 0x13, S32: 0x14, U32: 0x15,
        FLOAT: 0x21, VEC3: 0x33, VEC4: 0x34, BYTE_ENUM: 0x60, INT_ENUM: 0x62,
        INT_FLAGS1: 0x63, SHORT_FLAGS: 0x64, INT_FLAGS2: 0x65, HASH: 0x4a, ARRAY: 0x52,
        CHAR_ARRAY: 0x40, BYTE_ARRAY: 0x50, DATA_PTR: 0x59, CHAR_PTR: 0x44,
        STRUCT_PTR: 0x07, STRUCT: 0x05
    }

    const PRIM = {
        [T.BOOL]: 1, [T.S8]: 1, [T.U8]: 1, [T.BYTE_ENUM]: 1,
        [T.S16]: 2, [T.U16]: 2, [T.SHORT_FLAGS]: 2,
        [T.S32]: 4, [T.U32]: 4, [T.FLOAT]: 4, [T.HASH]: 4,
        [T.INT_ENUM]: 4, [T.INT_FLAGS1]: 4, [T.INT_FLAGS2]: 4
    }

    const MAPDATA_ORDER = [
        'entities', 'containerLods', 'boxOccluders', 'occludeModels', 'timeCycleModifiers',
        'physicsDictionaries', 'instancedData', 'carGenerators', 'LODLightsSOA', 'DistantLODLightsSOA', 'block'
    ]

    const ARRAYINFO = 0x100
    const POINTER = 0x07
    const STRING = 0x10
    const UCHAR = 0x11
    const HEADER = 0x70
    const PTR_BASE = 0x50000000
    const MAX_BLOCK = 0x4000
    const BASE_UNIT = 0x2000
    const RESERVES = [0x410, 0x1020]
    const MAX_DEPTH = 32

    const hex = v => '0x' + (v >>> 0).toString(16)
    const align = v => (v + 15) & ~15
    const pad = buf => buf.length % 16 ? Buffer.concat([buf, Buffer.alloc(16 - buf.length % 16)]) : buf
    const isPointer = type => type === T.ARRAY || type === T.STRUCT_PTR || type === T.CHAR_PTR || type === T.DATA_PTR
    const slotSize = type => type === T.ARRAY || type === T.CHAR_PTR ? 16 : 8

    let order = null

    function mapOrder() {
        if (!order) {
            order = {
                root: KKCT.joaatCase('CMapData'),
                rank: new Map(MAPDATA_ORDER.map((n, i) => [KKCT.joaatCase(n), i]))
            }
        }
        return order
    }

    const lookups = new WeakMap()

    function lookup(tree) {
        let l = lookups.get(tree)
        if (!l || l.structs !== tree.structInfos || l.count !== tree.structInfos.length) {
            l = { structs: tree.structInfos, count: tree.structInfos.length, map: new Map(), free: new Map() }
            for (const si of tree.structInfos) {
                if (!l.map.has(si.nameHash)) l.map.set(si.nameHash, si)
            }
            lookups.set(tree, l)
        }
        return l
    }

    function pointerFree(l, hash, depth) {
        if (l.free.has(hash)) return l.free.get(hash)
        const si = l.map.get(hash)
        let free = true
        if (si && depth < MAX_DEPTH) {
            for (const e of si.entries) {
                if (e.nameHash === ARRAYINFO) continue
                if (isPointer(e.type) || (e.type === T.STRUCT && !pointerFree(l, e.refKey, depth + 1))) {
                    free = false
                    break
                }
            }
        }
        l.free.set(hash, free)
        return free
    }

    function entriesOf(raw) {
        const out = []
        for (let o = 0; o + 16 <= raw.length; o += 16) {
            out.push({
                nameHash: raw.readUInt32LE(o),
                offset: raw.readInt32LE(o + 4),
                type: raw[o + 8],
                refIdx: raw.readInt16LE(o + 10),
                refKey: raw.readUInt32LE(o + 12)
            })
        }
        return out
    }

    function spanOf(si, e) {
        let end = si.size
        for (const o of si.entries) {
            if (o.nameHash !== ARRAYINFO && o.offset > e.offset && o.offset < end) end = o.offset
        }
        return end - e.offset
    }

    function isZero(buf, start, len) {
        for (let i = start; i < start + len && i < buf.length; i++) {
            if (buf[i]) return false
        }
        return true
    }

    function read(data) {
        if (data.length < HEADER || data.readUInt32LE(0x10) !== 0x50524430) throw new Error('not a META resource')
        const res = KKCT.rsc7.resolve
        const need = (abs, len) => {
            if (abs < 0 || abs + len > data.length) throw new Error(`META pointer out of range at ${hex(abs)}`)
            return abs
        }
        const copy = (abs, len) => Buffer.from(data.subarray(need(abs, len), abs + len))

        const structPtr = res(data.readUInt32LE(0x20))
        const enumPtr = res(data.readUInt32LE(0x28))
        const blocksPtr = res(data.readUInt32LE(0x30))
        const structCount = data.readInt16LE(0x48)
        const enumCount = data.readInt16LE(0x4a)
        const blockCount = data.readInt16LE(0x4c)
        const rootIndex = data.readInt32LE(0x1c) - 1

        const structInfos = []
        for (let i = 0; i < structCount; i++) {
            const head = copy(structPtr + i * 32, 32)
            const count = head.readInt16LE(0x1e)
            const entriesRaw = count > 0 ? copy(res(head.readUInt32LE(0x10)), count * 16) : Buffer.alloc(0)
            structInfos.push({ nameHash: head.readUInt32LE(0), size: head.readInt32LE(0x18), head, entries: entriesOf(entriesRaw), entriesRaw })
        }

        const enumInfos = []
        for (let i = 0; i < enumCount; i++) {
            const head = copy(enumPtr + i * 24, 24)
            const count = head.readInt32LE(0x10)
            const entriesRaw = count > 0 ? copy(res(head.readUInt32LE(8)), count * 8) : Buffer.alloc(0)
            enumInfos.push({ nameHash: head.readUInt32LE(0), head, entriesRaw })
        }

        const blocks = []
        for (let i = 0; i < blockCount; i++) {
            const base = need(blocksPtr + i * 16, 16)
            blocks.push({ hash: data.readUInt32LE(base), ptr: res(data.readUInt32LE(base + 8)) })
        }
        if (rootIndex < 0 || rootIndex >= blocks.length) throw new Error('META root block missing')

        const reserve = structPtr - HEADER
        const tree = { structInfos, enumInfos, pagesReserve: RESERVES.includes(reserve) ? reserve : RESERVES[0], root: null }
        const l = lookup(tree)

        function target(v) {
            const bi = (v & 0xfff) - 1
            if (bi < 0 || bi >= blocks.length) throw new Error(`META pointer ${hex(v)} has no block`)
            return { hash: blocks[bi].hash, abs: blocks[bi].ptr + (v >>> 12) }
        }

        function node(hash, abs, depth) {
            const si = l.map.get(hash)
            if (!si) throw new Error(`unknown struct ${hex(hash)}`)
            if (depth > MAX_DEPTH) throw new Error('META nesting too deep')
            const out = { hash, bytes: copy(abs, si.size), refs: new Map() }
            fill(out, si, 0, abs, depth)
            return out
        }

        function fill(out, si, base, abs, depth) {
            for (const e of si.entries) {
                if (e.nameHash === ARRAYINFO) continue
                const at = base + e.offset
                const src = abs + e.offset
                if (e.type === T.STRUCT) {
                    const sub = l.map.get(e.refKey)
                    if (sub) fill(out, sub, at, src, depth + 1)
                    else if (!isZero(out.bytes, at, spanOf(si, e))) throw new Error(`unknown struct ${hex(e.refKey)}`)
                } else if (e.type === T.ARRAY) {
                    const v = data.readUInt32LE(src)
                    const count = data.readUInt16LE(src + 8)
                    out.bytes.fill(0, at, at + (v && count ? 8 : 16))
                    if (v && count) out.refs.set(at, array(si.entries[e.refIdx], target(v).abs, count, depth))
                } else if (e.type === T.STRUCT_PTR) {
                    const v = data.readUInt32LE(src)
                    out.bytes.fill(0, at, at + 8)
                    if (v) {
                        const p = target(v)
                        out.refs.set(at, { kind: 'ptr', node: node(p.hash, p.abs, depth + 1) })
                    }
                } else if (e.type === T.CHAR_PTR) {
                    const v = data.readUInt32LE(src)
                    const count = data.readUInt16LE(src + 8)
                    const cap = data.readUInt16LE(src + 10)
                    out.bytes.fill(0, at, at + (v ? 8 : 16))
                    if (v) {
                        const start = need(target(v).abs, 1)
                        let end = start
                        while (end < data.length && data[end] !== 0) end++
                        if (end >= data.length) throw new Error('META string is not terminated')
                        out.refs.set(at, { kind: 'chars', raw: copy(start, end + 1 - start), count, cap })
                    }
                } else if (e.type === T.DATA_PTR) {
                    const v = data.readUInt32LE(src)
                    const sizeEntry = si.entries[e.refKey]
                    const len = sizeEntry ? out.bytes.readUInt32LE(base + sizeEntry.offset) : 0
                    out.bytes.fill(0, at, at + 8)
                    if (v && len) out.refs.set(at, { kind: 'data', raw: copy(target(v).abs, len) })
                }
            }
        }

        function array(el, abs, count, depth) {
            if (!el) throw new Error('META array has no element info')
            if (el.type === T.STRUCT) {
                const si = l.map.get(el.refKey)
                if (!si) throw new Error(`unknown struct ${hex(el.refKey)}`)
                if (pointerFree(l, el.refKey, 0)) return { kind: 'structs', hash: el.refKey, raw: copy(abs, count * si.size) }
                const items = []
                for (let i = 0; i < count; i++) items.push(node(el.refKey, abs + i * si.size, depth + 1))
                return { kind: 'items', hash: el.refKey, items }
            }
            if (el.type === T.STRUCT_PTR) {
                need(abs, count * 8)
                const items = []
                for (let i = 0; i < count; i++) {
                    const v = data.readUInt32LE(abs + i * 8)
                    if (!v) {
                        items.push(null)
                        continue
                    }
                    const p = target(v)
                    items.push(node(p.hash, p.abs, depth + 1))
                }
                return { kind: 'ptrs', items }
            }
            const size = PRIM[el.type]
            if (!size) throw new Error(`unsupported META array type ${hex(el.type)}`)
            return { kind: 'prims', type: el.type, raw: copy(abs, count * size) }
        }

        tree.root = node(blocks[rootIndex].hash, blocks[rootIndex].ptr, 0)
        return tree
    }

    function isEmpty(ref) {
        switch (ref.kind) {
            case 'items': case 'ptrs': return !ref.items.length
            case 'ptr': return !ref.node
            default: return !ref.raw || !ref.raw.length
        }
    }

    function write(tree) {
        const l = lookup(tree)
        const { root: mapRoot, rank } = mapOrder()
        const slotCache = new Map()
        const blocks = []
        const latest = new Map()

        function open(hash) {
            if (blocks.length >= 0xfff) throw new Error('too many META blocks')
            const b = { hash, index: blocks.length, parts: [], size: 0 }
            blocks.push(b)
            latest.set(hash, b)
            return b
        }

        function put(b, buf) {
            if (b.size > 0xfffff) throw new Error('META block too large')
            const v = ((b.index + 1) | (b.size << 12)) >>> 0
            b.parts.push(buf)
            b.size += buf.length
            return v
        }

        function alloc(hash, buf) {
            let b = latest.get(hash)
            if (!b || b.size >= MAX_BLOCK) b = open(hash)
            return put(b, buf)
        }

        function collect(si, base, ordered, list, depth) {
            let entries = si.entries.filter(e => e.nameHash !== ARRAYINFO)
            if (ordered) {
                entries = entries
                    .map((e, i) => [rank.has(e.nameHash) ? rank.get(e.nameHash) : rank.size + i, e])
                    .sort((a, b) => a[0] - b[0])
                    .map(p => p[1])
            }
            for (const e of entries) {
                const at = base + e.offset
                if (e.type === T.STRUCT) {
                    const sub = l.map.get(e.refKey)
                    if (sub && depth < MAX_DEPTH) collect(sub, at, false, list, depth + 1)
                } else if (isPointer(e.type)) {
                    list.push({ at, e, si, base })
                }
            }
        }

        function slots(hash) {
            let list = slotCache.get(hash)
            if (list) return list
            const si = l.map.get(hash)
            if (!si) throw new Error(`unknown struct ${hex(hash)}`)
            list = []
            collect(si, 0, hash === mapRoot, list, 0)
            slotCache.set(hash, { si, list })
            return slotCache.get(hash)
        }

        function emit(node) {
            const { si, list } = slots(node.hash)
            if (node.bytes.length !== si.size) throw new Error(`struct ${hex(node.hash)} needs ${si.size} bytes, got ${node.bytes.length}`)
            const bytes = Buffer.from(node.bytes)
            let used = 0
            for (const s of list) {
                const ref = node.refs.get(s.at)
                if (ref) used++
                if (!ref || isEmpty(ref)) {
                    bytes.fill(0, s.at, s.at + slotSize(s.e.type))
                    continue
                }
                link(bytes, s, ref)
            }
            if (used !== node.refs.size) throw new Error(`struct ${hex(node.hash)} has a ref with no matching entry`)
            return bytes
        }

        function link(bytes, s, ref) {
            const { at, e } = s
            let v = 0
            if (e.type === T.ARRAY) {
                let count = 0
                if (ref.kind === 'structs') {
                    const si = l.map.get(ref.hash)
                    if (!si) throw new Error(`unknown struct ${hex(ref.hash)}`)
                    if (ref.raw.length % si.size) throw new Error(`array of ${hex(ref.hash)} is not a whole number of items`)
                    count = ref.raw.length / si.size
                    v = alloc(ref.hash, pad(ref.raw))
                } else if (ref.kind === 'items') {
                    const parts = ref.items.map(n => {
                        if (!n || n.hash !== ref.hash) throw new Error(`array of ${hex(ref.hash)} holds a different item`)
                        return emit(n)
                    })
                    count = parts.length
                    v = alloc(ref.hash, pad(Buffer.concat(parts)))
                } else if (ref.kind === 'ptrs') {
                    const parts = ref.items.map(n => n ? emit(n) : null)
                    const ptrs = Buffer.alloc(parts.length * 8)
                    parts.forEach((p, i) => {
                        if (p) ptrs.writeUInt32LE(alloc(ref.items[i].hash, p), i * 8)
                    })
                    count = parts.length
                    v = alloc(POINTER, pad(ptrs))
                } else if (ref.kind === 'prims') {
                    const size = PRIM[ref.type]
                    if (!size) throw new Error(`unsupported META array type ${hex(ref.type)}`)
                    if (ref.raw.length % size) throw new Error(`array of ${hex(ref.type)} is not a whole number of items`)
                    count = ref.raw.length / size
                    v = alloc(ref.type, pad(ref.raw))
                } else {
                    throw new Error(`ref kind ${ref.kind} does not fit an array entry`)
                }
                if (count > 0xffff) throw new Error('META array has too many items')
                bytes.writeUInt16LE(count, at + 8)
                bytes.writeUInt16LE(count, at + 10)
            } else if (e.type === T.STRUCT_PTR && ref.kind === 'ptr') {
                const part = emit(ref.node)
                v = alloc(ref.node.hash, part)
            } else if (e.type === T.CHAR_PTR && ref.kind === 'chars') {
                v = alloc(STRING, ref.raw)
                bytes.writeUInt16LE(ref.count & 0xffff, at + 8)
                bytes.writeUInt16LE(ref.cap & 0xffff, at + 10)
            } else if (e.type === T.DATA_PTR && ref.kind === 'data') {
                v = put(open(UCHAR), ref.raw)
                const sizeEntry = s.si.entries[e.refKey]
                if (sizeEntry) bytes.writeUInt32LE(ref.raw.length, s.base + sizeEntry.offset)
            } else {
                throw new Error(`ref kind ${ref.kind} does not fit entry type ${hex(e.type)}`)
            }
            bytes.writeUInt32LE(v, at)
            bytes.writeUInt32LE(0, at + 4)
        }

        const rootBlock = open(tree.root.hash)
        put(rootBlock, emit(tree.root))

        if (tree.structInfos.length > 0x7fff || tree.enumInfos.length > 0x7fff) throw new Error('too many META infos')

        const chunks = []
        const chunk = len => {
            const ch = { len, pos: 0 }
            if (len) chunks.push(ch)
            return ch
        }
        chunk(HEADER)
        const pages = chunk(tree.pagesReserve || RESERVES[0])
        const structs = chunk(tree.structInfos.length * 32)
        const structEntries = tree.structInfos.map(si => chunk(si.entriesRaw.length))
        const enums = chunk(tree.enumInfos.length * 24)
        const enumEntries = tree.enumInfos.map(ei => chunk(ei.entriesRaw.length))
        const list = chunk(blocks.length * 16)
        const datas = blocks.map(b => chunk(b.size))

        let largest = 0
        for (const ch of chunks) largest = Math.max(largest, ch.len)
        let unit = BASE_UNIT
        while (unit < largest) unit *= 2
        let pageCount = 0
        for (;;) {
            let pos = 0
            pageCount = 0
            for (const ch of chunks) {
                pos = align(pos)
                if (unit * pageCount - pos < ch.len + 16) {
                    pos = unit * pageCount
                    pageCount++
                }
                ch.pos = pos
                pos += ch.len
            }
            if (pageCount < 128) break
            unit *= 2
        }

        const out = Buffer.alloc(unit * pageCount)
        const ptr = ch => ch.len ? PTR_BASE + ch.pos : 0

        out.writeUInt32LE(0x405bc808, 0)
        out.writeUInt32LE(1, 4)
        out.writeUInt32LE(PTR_BASE + pages.pos, 8)
        out.writeUInt32LE(0x50524430, 0x10)
        out.writeUInt16LE(0x79, 0x14)
        out.writeInt32LE(1, 0x1c)
        out.writeUInt32LE(ptr(structs), 0x20)
        out.writeUInt32LE(ptr(enums), 0x28)
        out.writeUInt32LE(ptr(list), 0x30)
        out.writeInt16LE(tree.structInfos.length, 0x48)
        out.writeInt16LE(tree.enumInfos.length, 0x4a)
        out.writeInt16LE(blocks.length, 0x4c)
        let small = 0
        for (let i = 0; i < 4; i++) small += (pageCount >> i) & 1
        out[pages.pos + 8] = small + (pageCount >> 4)

        tree.structInfos.forEach((si, i) => {
            const at = structs.pos + i * 32
            si.head.copy(out, at, 0, 32)
            out.writeUInt32LE(ptr(structEntries[i]), at + 0x10)
            out.writeUInt32LE(0, at + 0x14)
            out.writeInt16LE(si.entriesRaw.length / 16, at + 0x1e)
            si.entriesRaw.copy(out, structEntries[i].pos)
        })

        tree.enumInfos.forEach((ei, i) => {
            const at = enums.pos + i * 24
            ei.head.copy(out, at, 0, 24)
            out.writeUInt32LE(ptr(enumEntries[i]), at + 8)
            out.writeUInt32LE(0, at + 0xc)
            out.writeInt32LE(ei.entriesRaw.length / 8, at + 0x10)
            ei.entriesRaw.copy(out, enumEntries[i].pos)
        })

        blocks.forEach((b, i) => {
            const at = list.pos + i * 16
            out.writeUInt32LE(b.hash, at)
            out.writeInt32LE(b.size, at + 4)
            out.writeUInt32LE(ptr(datas[i]), at + 8)
            let pos = datas[i].pos
            for (const part of b.parts) {
                part.copy(out, pos)
                pos += part.length
            }
        })

        const n = pageCount
        const systemFlags = ((n & 1) << 27 | (n >> 1 & 1) << 26 | (n >> 2 & 1) << 25 | (n >> 3 & 1) << 24 | (n >> 4 & 0x7f) << 17 | Math.log2(unit / 0x200)) >>> 0
        return { data: out, systemFlags }
    }

    function rebuild(buf) {
        const src = KKCT.rsc7.parse(buf)
        const out = write(read(src.data))
        return KKCT.rsc7.pack(src, out.systemFlags, out.data)
    }

    function info(tree, structHash) {
        return lookup(tree).map.get(structHash >>> 0) || null
    }

    function field(tree, structHash, name) {
        const si = info(tree, structHash)
        if (!si) return null
        const h = KKCT.joaatCase(name)
        for (const e of si.entries) {
            if (e.nameHash === h) return { ...e, elem: e.type === T.ARRAY ? si.entries[e.refIdx] || null : null }
        }
        return null
    }

    function entryAt(tree, structHash, offset) {
        const si = info(tree, structHash)
        if (!si) return null
        let hit = null
        for (const e of si.entries) {
            if (e.nameHash === ARRAYINFO || e.offset !== offset) continue
            if (!hit || (isPointer(e.type) && !isPointer(hit.type))) hit = e
        }
        return hit ? { ...hit, elem: hit.type === T.ARRAY ? si.entries[hit.refIdx] || null : null } : null
    }

    function offsetOf(tree, node, structHash) {
        const l = lookup(tree)
        const want = structHash >>> 0
        if (node.hash === want) return 0
        function find(hash, base, depth) {
            const si = l.map.get(hash)
            if (!si || depth > MAX_DEPTH) return -1
            for (const e of si.entries) {
                if (e.nameHash === ARRAYINFO || e.type !== T.STRUCT) continue
                if (e.refKey === want) return base + e.offset
                const hit = find(e.refKey, base + e.offset, depth + 1)
                if (hit >= 0) return hit
            }
            return -1
        }
        return find(node.hash, 0, 0)
    }

    function count(tree, ref) {
        if (!ref) return 0
        switch (ref.kind) {
            case 'items': case 'ptrs': return ref.items.length
            case 'ptr': return ref.node ? 1 : 0
            case 'chars': return ref.count
            case 'data': return ref.raw.length
            case 'prims': return PRIM[ref.type] ? Math.floor(ref.raw.length / PRIM[ref.type]) : 0
            case 'structs': {
                const si = info(tree, ref.hash)
                return si && si.size ? Math.floor(ref.raw.length / si.size) : 0
            }
            default: return 0
        }
    }

    function column(tree, node, structHash, offset) {
        const base = offsetOf(tree, node, structHash)
        if (base < 0) return null
        const entry = entryAt(tree, structHash, offset)
        if (!entry) return null
        const at = base + offset
        const ref = node.refs.get(at) || null
        return { at, entry, elem: entry.elem, ref, count: count(tree, ref) }
    }

    function stride(tree, ref) {
        if (ref.kind === 'prims') return PRIM[ref.type] || 0
        if (ref.kind === 'structs') {
            const si = info(tree, ref.hash)
            return si ? si.size : 0
        }
        throw new Error(`ref kind ${ref.kind} has no rows`)
    }

    function rows(tree, ref) {
        if (!ref) return []
        const size = stride(tree, ref)
        const out = []
        if (!size) return out
        for (let o = 0; o + size <= ref.raw.length; o += size) out.push(ref.raw.subarray(o, o + size))
        return out
    }

    function toBuffer(src) {
        if (Buffer.isBuffer(src)) return Buffer.from(src)
        if (Array.isArray(src)) return Buffer.concat(src.map(b => Buffer.isBuffer(b) ? b : Buffer.from(b.buffer, b.byteOffset, b.byteLength)))
        if (ArrayBuffer.isView(src)) return Buffer.from(Buffer.from(src.buffer, src.byteOffset, src.byteLength))
        throw new Error('expected a Buffer, a typed array or an array of Buffers')
    }

    function prims(type, src) {
        if (!PRIM[type]) throw new Error(`unsupported META array type ${hex(type)}`)
        return { kind: 'prims', type, raw: toBuffer(src) }
    }

    function structs(hash, src) {
        return { kind: 'structs', hash: hash >>> 0, raw: toBuffer(src) }
    }

    function vec3s(ref) {
        const out = []
        if (!ref || !ref.raw) return out
        for (let o = 0; o + 12 <= ref.raw.length; o += 12) {
            out.push([ref.raw.readFloatLE(o), ref.raw.readFloatLE(o + 4), ref.raw.readFloatLE(o + 8)])
        }
        return out
    }

    function fromVec3s(hash, list) {
        const raw = Buffer.alloc(list.length * 12)
        list.forEach((p, i) => {
            raw.writeFloatLE(p[0], i * 12)
            raw.writeFloatLE(p[1], i * 12 + 4)
            raw.writeFloatLE(p[2], i * 12 + 8)
        })
        return { kind: 'structs', hash: hash >>> 0, raw }
    }

    function value(buf, offset, type) {
        switch (type) {
            case T.BOOL: return buf.readUInt8(offset) !== 0
            case T.S8: return buf.readInt8(offset)
            case T.U8: case T.BYTE_ENUM: return buf.readUInt8(offset)
            case T.S16: return buf.readInt16LE(offset)
            case T.U16: case T.SHORT_FLAGS: return buf.readUInt16LE(offset)
            case T.S32: case T.INT_ENUM: return buf.readInt32LE(offset)
            case T.U32: case T.HASH: case T.INT_FLAGS1: case T.INT_FLAGS2: return buf.readUInt32LE(offset)
            case T.FLOAT: return buf.readFloatLE(offset)
            case T.VEC3: return [buf.readFloatLE(offset), buf.readFloatLE(offset + 4), buf.readFloatLE(offset + 8)]
            case T.VEC4: return [buf.readFloatLE(offset), buf.readFloatLE(offset + 4), buf.readFloatLE(offset + 8), buf.readFloatLE(offset + 12)]
            default: return null
        }
    }

    function values(ref) {
        const out = []
        if (!ref || ref.kind !== 'prims') return out
        const size = PRIM[ref.type] || 0
        for (let o = 0; size && o + size <= ref.raw.length; o += size) out.push(value(ref.raw, o, ref.type))
        return out
    }

    function store(buf, offset, type, v) {
        switch (type) {
            case T.BOOL: buf.writeUInt8(v ? 1 : 0, offset); return true
            case T.S8: buf.writeInt8(v, offset); return true
            case T.U8: case T.BYTE_ENUM: buf.writeUInt8(v & 0xff, offset); return true
            case T.S16: buf.writeInt16LE(v, offset); return true
            case T.U16: case T.SHORT_FLAGS: buf.writeUInt16LE(v & 0xffff, offset); return true
            case T.S32: case T.INT_ENUM: buf.writeInt32LE(v | 0, offset); return true
            case T.U32: case T.HASH: case T.INT_FLAGS1: case T.INT_FLAGS2: buf.writeUInt32LE(v >>> 0, offset); return true
            case T.FLOAT: buf.writeFloatLE(v, offset); return true
            case T.VEC3: case T.VEC4:
                for (let i = 0; i < (type === T.VEC3 ? 3 : 4); i++) buf.writeFloatLE(v[i], offset + i * 4)
                return true
            default: return false
        }
    }

    function get(tree, node, name) {
        const f = field(tree, node.hash, name)
        return f ? value(node.bytes, f.offset, f.type) : null
    }

    function set(tree, node, name, v) {
        const f = field(tree, node.hash, name)
        return f ? store(node.bytes, f.offset, f.type, v) : false
    }

    function create(tree, structHash) {
        const si = info(tree, structHash)
        if (!si) throw new Error(`unknown struct ${hex(structHash)}`)
        return { hash: si.nameHash, bytes: Buffer.alloc(si.size), refs: new Map() }
    }

    function cloneRef(ref) {
        switch (ref.kind) {
            case 'items': case 'ptrs': return { ...ref, items: ref.items.map(clone) }
            case 'ptr': return { kind: 'ptr', node: clone(ref.node) }
            default: return { ...ref, raw: Buffer.from(ref.raw) }
        }
    }

    function clone(node) {
        if (!node) return null
        const refs = new Map()
        for (const [at, ref] of node.refs) refs.set(at, cloneRef(ref))
        return { hash: node.hash, bytes: Buffer.from(node.bytes), refs }
    }

    function feed(h, node) {
        if (!node) {
            h.update('n')
            return
        }
        const head = Buffer.alloc(12)
        head.writeUInt32LE(node.hash >>> 0, 0)
        head.writeUInt32LE(node.bytes.length, 4)
        head.writeUInt32LE(node.refs.size, 8)
        h.update(head)
        h.update(node.bytes)
        for (const at of [...node.refs.keys()].sort((a, b) => a - b)) {
            const ref = node.refs.get(at)
            h.update(`|${at}:${ref.kind}:${ref.hash ?? ref.type ?? ''}:${ref.count ?? ''}:${ref.cap ?? ''}|`)
            if (ref.kind === 'items' || ref.kind === 'ptrs') {
                h.update(String(ref.items.length))
                for (const item of ref.items) feed(h, item)
            } else if (ref.kind === 'ptr') {
                feed(h, ref.node)
            } else {
                h.update(ref.raw)
            }
        }
    }

    function digest(node) {
        const h = crypto.createHash('sha1')
        feed(h, node)
        return h.digest('hex')
    }

    function adoptInfos(tree, fromTree) {
        let added = 0
        const structsHave = new Set(tree.structInfos.map(si => si.nameHash))
        for (const si of fromTree.structInfos) {
            if (structsHave.has(si.nameHash)) continue
            structsHave.add(si.nameHash)
            tree.structInfos.push({ nameHash: si.nameHash, size: si.size, head: Buffer.from(si.head), entries: si.entries.map(e => ({ ...e })), entriesRaw: Buffer.from(si.entriesRaw) })
            added++
        }
        const enumsHave = new Set(tree.enumInfos.map(ei => ei.nameHash))
        for (const ei of fromTree.enumInfos) {
            if (enumsHave.has(ei.nameHash)) continue
            enumsHave.add(ei.nameHash)
            tree.enumInfos.push({ nameHash: ei.nameHash, head: Buffer.from(ei.head), entriesRaw: Buffer.from(ei.entriesRaw) })
            added++
        }
        return added
    }

    return {
        T, PRIM, read, write, rebuild, info, field, entryAt, offsetOf, column, count, rows,
        prims, structs, vec3s, fromVec3s, value, values, store, get, set, create, clone, digest, adoptInfos
    }
})()
})()
