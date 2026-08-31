(() => {
globalThis.KKCT = globalThis.KKCT || {}

KKCT.ybn = (() => {
    const res = lo => KKCT.rsc7.resolve(lo)
    const round3 = v => Math.round(v * 1000) / 1000
    const round4 = v => Math.round(v * 10000) / 10000

    const B = {
        TYPE: 0x10,
        SPHERE_R: 0x14,
        BOXMAX: 0x20,
        BOXMIN: 0x30,
        BOXCENTER: 0x40,
        MAT1: 0x4c,
        SPHERECENTER: 0x50,
        MAT2: 0x5c
    }
    const CMP = { CHILDREN: 0x70, T1: 0x78, T2: 0x80, BBOX: 0x88, COUNT: 0xa0, BVH: 0xa8 }
    const GEO = { VSHRUNK: 0x78, POLYS: 0x88, QUANTUM: 0x90, CENTER: 0xa0, VERTS: 0xb0, OCTANTS: 0xc0, VCOUNT: 0xd0, PCOUNT: 0xd4, MATS: 0xf0, POLYMATS: 0x118, MATCOUNT: 0x120 }
    const GEO_BVH = 0x130
    const BVH = { NODES: 0x00, NCOUNT: 0x08, BBMIN: 0x20, BBMAX: 0x30, BBCEN: 0x40, QINV: 0x50, QUANT: 0x60, TREES: 0x70, TCOUNT: 0x78 }

    const isGeom = t => t === 4 || t === 8

    function readVec3(data, off) {
        return [data.readFloatLE(off), data.readFloatLE(off + 4), data.readFloatLE(off + 8)]
    }

    function writeVec3(data, off, v) {
        data.writeFloatLE(v[0], off)
        data.writeFloatLE(v[1], off + 4)
        data.writeFloatLE(v[2], off + 8)
    }

    function readHeader(data, off) {
        return {
            type: data.readUInt8(off + B.TYPE),
            radius: data.readFloatLE(off + B.SPHERE_R),
            bmax: readVec3(data, off + B.BOXMAX),
            bmin: readVec3(data, off + B.BOXMIN),
            center: readVec3(data, off + B.BOXCENTER)
        }
    }

    function readMatrix(data, off) {
        const m = new Array(16)
        for (let i = 0; i < 16; i++) {
            m[i] = data.readFloatLE(off + i * 4)
        }
        return m
    }

    function writeMatrix(data, off, m) {
        for (let i = 0; i < 16; i++) {
            data.writeFloatLE(m[i], off + i * 4)
        }
    }

    function applyM(m, x, y, z) {
        if (!m) return [x, y, z]
        return [
            m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13],
            m[2] * x + m[6] * y + m[10] * z + m[14]
        ]
    }

    function aabbOf(bmin, bmax, m) {
        const min = [Infinity, Infinity, Infinity]
        const max = [-Infinity, -Infinity, -Infinity]
        for (let c = 0; c < 8; c++) {
            const p = applyM(m, c & 1 ? bmax[0] : bmin[0], c & 2 ? bmax[1] : bmin[1], c & 4 ? bmax[2] : bmin[2])
            for (let a = 0; a < 3; a++) {
                if (p[a] < min[a]) min[a] = p[a]
                if (p[a] > max[a]) max[a] = p[a]
            }
        }
        return { min, max }
    }

    function composite(data) {
        if (data.readUInt8(B.TYPE) !== 10) return null
        return {
            count: data.readUInt16LE(CMP.COUNT),
            children: res(data.readUInt32LE(CMP.CHILDREN)),
            t1: res(data.readUInt32LE(CMP.T1)),
            t2: res(data.readUInt32LE(CMP.T2)),
            bbox: res(data.readUInt32LE(CMP.BBOX)),
            bvh: res(data.readUInt32LE(CMP.BVH))
        }
    }

    function childOffset(data, cmp, i) {
        if (!cmp || cmp.children < 0 || i < 0 || i >= cmp.count) return -1
        return res(data.readUInt32LE(cmp.children + i * 8))
    }

    function parse(buf) {
        const { data } = KKCT.rsc7.parse(buf)
        const root = readHeader(data, 0)
        const out = { type: root.type, bmin: root.bmin.map(round3), bmax: root.bmax.map(round3), children: 0, tris: 0 }
        if (root.type === 10) {
            const cmp = composite(data)
            out.children = cmp.count
            let tris = 0
            for (let i = 0; i < cmp.count; i++) {
                const cp = childOffset(data, cmp, i)
                if (cp < 0) continue
                const ch = readHeader(data, cp)
                if (isGeom(ch.type)) {
                    tris += data.readUInt32LE(cp + GEO.PCOUNT)
                }
            }
            out.tris = tris
        } else if (isGeom(root.type)) {
            out.tris = data.readUInt32LE(GEO.PCOUNT)
        }
        return out
    }

    function extractGeometryTris(data, off, transform, out, maxTris, meta) {
        const vertsPtr = res(data.readUInt32LE(off + GEO.VERTS))
        const polysPtr = res(data.readUInt32LE(off + GEO.POLYS))
        const vertCount = data.readUInt32LE(off + GEO.VCOUNT)
        const polyCount = data.readUInt32LE(off + GEO.PCOUNT)
        const pmiPtr = meta ? res(data.readUInt32LE(off + GEO.POLYMATS)) : -1
        if (vertsPtr < 0 || polysPtr < 0 || !vertCount || !polyCount) return
        const qx = data.readFloatLE(off + GEO.QUANTUM)
        const qy = data.readFloatLE(off + GEO.QUANTUM + 4)
        const qz = data.readFloatLE(off + GEO.QUANTUM + 8)
        const cx = data.readFloatLE(off + GEO.CENTER)
        const cy = data.readFloatLE(off + GEO.CENTER + 4)
        const cz = data.readFloatLE(off + GEO.CENTER + 8)
        const verts = new Float32Array(vertCount * 3)
        for (let i = 0; i < vertCount; i++) {
            let x = data.readInt16LE(vertsPtr + i * 6) * qx + cx
            let y = data.readInt16LE(vertsPtr + i * 6 + 2) * qy + cy
            let z = data.readInt16LE(vertsPtr + i * 6 + 4) * qz + cz
            if (transform) {
                const t = applyM(transform, x, y, z)
                x = t[0]
                y = t[1]
                z = t[2]
            }
            verts[i * 3] = x
            verts[i * 3 + 1] = y
            verts[i * 3 + 2] = z
        }
        for (let i = 0; i < polyCount; i++) {
            if (out.length / 9 >= maxTris) return
            const po = polysPtr + i * 16
            const type = data.readUInt8(po) & 7
            if (type !== 0) continue
            const i1 = data.readUInt16LE(po + 4) & 0x7fff
            const i2 = data.readUInt16LE(po + 6) & 0x7fff
            const i3 = data.readUInt16LE(po + 8) & 0x7fff
            if (i1 >= vertCount || i2 >= vertCount || i3 >= vertCount) continue
            if (meta) {
                meta.polys.push(i)
                meta.mats.push(pmiPtr >= 0 ? data.readUInt8(pmiPtr + i) : 0)
            }
            out.push(
                round3(verts[i1 * 3]), round3(verts[i1 * 3 + 1]), round3(verts[i1 * 3 + 2]),
                round3(verts[i2 * 3]), round3(verts[i2 * 3 + 1]), round3(verts[i2 * 3 + 2]),
                round3(verts[i3 * 3]), round3(verts[i3 * 3 + 1]), round3(verts[i3 * 3 + 2])
            )
        }
    }

    function parseGeometry(buf, maxTris) {
        const cap = maxTris || 12000
        const { data } = KKCT.rsc7.parse(buf)
        const root = readHeader(data, 0)
        const tris = []
        if (isGeom(root.type)) {
            extractGeometryTris(data, 0, null, tris, cap)
        } else if (root.type === 10) {
            const cmp = composite(data)
            for (let i = 0; i < cmp.count; i++) {
                if (tris.length / 9 >= cap) break
                const cp = childOffset(data, cmp, i)
                if (cp < 0) continue
                const ch = readHeader(data, cp)
                if (isGeom(ch.type)) {
                    const m = cmp.t1 >= 0 ? readMatrix(data, cmp.t1 + i * 64) : null
                    extractGeometryTris(data, cp, m, tris, cap)
                }
            }
        }
        return tris
    }

    function readMats(data, off, type) {
        const out = []
        if (isGeom(type)) {
            const mp = res(data.readUInt32LE(off + GEO.MATS))
            const mc = data.readUInt8(off + GEO.MATCOUNT)
            if (mp >= 0 && mc > 0) {
                for (let s = 0; s < mc; s++) {
                    const d = KKCT.collmats.decode(data.readUInt32LE(mp + s * 8), data.readUInt32LE(mp + s * 8 + 4))
                    out.push({ slot: s, ...d, name: KKCT.collmats.name(d.type) })
                }
                return { source: 'geom', mats: out }
            }
        }
        const d = KKCT.collmats.decode(data.readUInt32LE(off + B.MAT1), data.readUInt32LE(off + B.MAT2))
        out.push({ slot: -1, ...d, name: KKCT.collmats.name(d.type) })
        return { source: 'base', mats: out }
    }

    function triangleCount(data, off, type) {
        if (!isGeom(type)) return 0
        const polysPtr = res(data.readUInt32LE(off + GEO.POLYS))
        const polyCount = data.readUInt32LE(off + GEO.PCOUNT)
        if (polysPtr < 0 || !polyCount) return 0
        let n = 0
        for (let i = 0; i < polyCount; i++) {
            if ((data.readUInt8(polysPtr + i * 16) & 7) === 0) n++
        }
        return n
    }

    function boundInfo(data, off, bi, m) {
        const h = readHeader(data, off)
        const { source, mats } = readMats(data, off, h.type)
        return {
            bi,
            type: h.type,
            tris: isGeom(h.type) ? data.readUInt32LE(off + GEO.PCOUNT) : 0,
            faces: triangleCount(data, off, h.type),
            bmin: h.bmin.map(round3),
            bmax: h.bmax.map(round3),
            m: m ? m.map(round4) : null,
            matSource: source,
            mats
        }
    }

    function inspect(buf) {
        const { data } = KKCT.rsc7.parse(buf)
        const root = readHeader(data, 0)
        const bounds = []
        const cmp = composite(data)
        if (cmp) {
            for (let i = 0; i < cmp.count; i++) {
                const cp = childOffset(data, cmp, i)
                if (cp < 0) continue
                const m = cmp.t1 >= 0 ? readMatrix(data, cmp.t1 + i * 64) : null
                bounds.push(boundInfo(data, cp, i, m))
            }
        } else {
            bounds.push(boundInfo(data, 0, 0, null))
        }
        return {
            composite: !!cmp,
            root: {
                type: root.type,
                bmin: root.bmin.map(round3),
                bmax: root.bmax.map(round3),
                center: root.center.map(round3)
            },
            bounds
        }
    }

    function geometryByBound(buf, maxTrisPerBound, maxTotal) {
        const perCap = maxTrisPerBound || 4000
        const total = maxTotal || 12000
        const { data } = KKCT.rsc7.parse(buf)
        const root = readHeader(data, 0)
        const out = []
        const cmp = composite(data)
        const offsets = []
        if (cmp) {
            for (let i = 0; i < cmp.count; i++) {
                const cp = childOffset(data, cmp, i)
                if (cp >= 0) offsets.push({ bi: i, off: cp })
            }
        } else {
            offsets.push({ bi: 0, off: 0 })
        }
        let left = total
        let remaining = offsets.length
        for (const { bi, off } of offsets) {
            const type = cmp ? data.readUInt8(off + B.TYPE) : root.type
            const m = cmp && cmp.t1 >= 0 ? readMatrix(data, cmp.t1 + bi * 64).map(round4) : null
            const cap = Math.max(0, Math.min(perCap, Math.floor(left / remaining)))
            const tris = []
            const meta = { polys: [], mats: [] }
            if (cap > 0 && isGeom(type)) {
                extractGeometryTris(data, off, null, tris, cap, meta)
            }
            const used = tris.length / 9
            left -= used
            remaining--
            out.push({ bi, m, tris, mats: meta.mats, capped: used >= cap })
        }
        return out
    }

    function faceData(buf, bi, maxTris) {
        const cap = maxTris || 40000
        const { data } = KKCT.rsc7.parse(buf)
        const cmp = composite(data)
        const off = cmp ? childOffset(data, cmp, bi) : (bi === 0 ? 0 : -1)
        if (off < 0) return null
        const type = data.readUInt8(off + B.TYPE)
        const m = cmp && cmp.t1 >= 0 ? readMatrix(data, cmp.t1 + bi * 64).map(round4) : null
        const tris = []
        const meta = { polys: [], mats: [] }
        if (isGeom(type)) {
            extractGeometryTris(data, off, null, tris, cap, meta)
        }
        return {
            bi,
            m,
            tris,
            polys: meta.polys,
            mats: meta.mats,
            total: isGeom(type) ? data.readUInt32LE(off + GEO.PCOUNT) : 0,
            capped: tris.length / 9 >= cap
        }
    }

    function canMoveVerts(buf, bi) {
        const { data } = KKCT.rsc7.parse(buf)
        const cmp = composite(data)
        const off = cmp ? childOffset(data, cmp, bi) : (bi === 0 ? 0 : -1)
        if (off < 0) return { ok: false, reason: 'that bound was not found' }
        const type = data.readUInt8(off + B.TYPE)
        if (!isGeom(type)) return { ok: false, reason: 'that bound has no geometry to move' }
        if (res(data.readUInt32LE(off + GEO.OCTANTS)) >= 0) {
            return { ok: false, reason: 'this bound carries an octant index that cannot be rebuilt in place, so its geometry cannot be moved' }
        }
        const polysPtr = res(data.readUInt32LE(off + GEO.POLYS))
        const polyCount = data.readUInt32LE(off + GEO.PCOUNT)
        if (polysPtr < 0 || !polyCount) return { ok: false, reason: 'that bound has no polygons' }
        for (let i = 0; i < polyCount; i++) {
            if ((data.readUInt8(polysPtr + i * 16) & 7) !== 0) {
                return { ok: false, reason: 'this bound mixes triangles with box and capsule shapes, which this editor does not move' }
            }
        }
        return { ok: true }
    }

    function slotUsage(buf, bi) {
        const { data } = KKCT.rsc7.parse(buf)
        const cmp = composite(data)
        const off = cmp ? childOffset(data, cmp, bi) : (bi === 0 ? 0 : -1)
        if (off < 0) return null
        const type = data.readUInt8(off + B.TYPE)
        if (!isGeom(type)) return null
        const pmiPtr = res(data.readUInt32LE(off + GEO.POLYMATS))
        const polyCount = data.readUInt32LE(off + GEO.PCOUNT)
        const matCount = data.readUInt8(off + GEO.MATCOUNT)
        if (pmiPtr < 0 || !polyCount || !matCount) return null
        const counts = new Array(matCount).fill(0)
        const of = new Uint8Array(polyCount)
        for (let p = 0; p < polyCount; p++) {
            const slot = data.readUInt8(pmiPtr + p)
            of[p] = slot
            if (slot < matCount) counts[slot]++
        }
        return { matCount, polyCount, counts, slotOf: of, room: materialRoom(data, off) }
    }

    function blockTargets(data) {
        const out = new Set([data.length])
        const push = p => {
            if (p >= 0 && p < data.length) out.add(p)
        }
        const cmp = composite(data)
        if (cmp) {
            push(cmp.children)
            push(cmp.t1)
            push(cmp.t2)
            push(cmp.bbox)
            push(res(data.readUInt32LE(0x90)))
            push(res(data.readUInt32LE(0x98)))
            push(cmp.bvh)
            if (cmp.bvh >= 0) {
                push(res(data.readUInt32LE(cmp.bvh + BVH.NODES)))
                push(res(data.readUInt32LE(cmp.bvh + BVH.TREES)))
            }
        }
        const offs = []
        if (cmp) {
            for (let i = 0; i < cmp.count; i++) {
                const cp = childOffset(data, cmp, i)
                if (cp >= 0) offs.push(cp)
            }
        } else {
            offs.push(0)
        }
        for (const off of offs) {
            push(off)
            const type = data.readUInt8(off + B.TYPE)
            if (!isGeom(type)) continue
            for (const o of [0x78, GEO.POLYS, GEO.VERTS, 0xb8, 0xc0, 0xc8, GEO.MATS, 0xf8, GEO.POLYMATS]) {
                push(res(data.readUInt32LE(off + o)))
            }
            if (type === 8) {
                const bp = res(data.readUInt32LE(off + GEO_BVH))
                push(bp)
                if (bp >= 0) {
                    push(res(data.readUInt32LE(bp + BVH.NODES)))
                    push(res(data.readUInt32LE(bp + BVH.TREES)))
                }
            }
        }
        return [...out].sort((a, b) => a - b)
    }

    let roomCache = null

    function materialRoom(data, off) {
        const mp = res(data.readUInt32LE(off + GEO.MATS))
        const mc = data.readUInt8(off + GEO.MATCOUNT)
        if (mp < 0 || mc <= 0 || mc >= 255) return false
        const end = mp + mc * 8
        if (end + 8 > data.length) return false
        for (let k = end; k < end + 8; k++) {
            if (data[k] !== 0) return false
        }
        if (!roomCache || roomCache.data !== data) {
            roomCache = { data, targets: blockTargets(data) }
        }
        return !roomCache.targets.some(p => p >= end && p < end + 8)
    }

    const EMPTY_BOX = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }

    function union(a, b) {
        return {
            min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
            max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])]
        }
    }

    function rebuildBvh(data, bp, itemBoxes, pad) {
        const nodesPtr = res(data.readUInt32LE(bp + BVH.NODES))
        const nodeCount = data.readUInt32LE(bp + BVH.NCOUNT)
        if (nodesPtr < 0 || !nodeCount || nodeCount > 100000) return
        const treesPtr = res(data.readUInt32LE(bp + BVH.TREES))
        const treeCount = data.readUInt16LE(bp + BVH.TCOUNT)

        const nmin = new Array(nodeCount)
        const nmax = new Array(nodeCount)

        function walk(i) {
            if (i >= nodeCount) return { box: EMPTY_BOX, next: i + 1 }
            const no = nodesPtr + i * 16
            const itemId = data.readInt16LE(no + 12)
            const itemCount = data.readInt16LE(no + 14)
            let box = EMPTY_BOX
            let next
            if (itemCount > 0) {
                for (let k = 0; k < itemCount; k++) {
                    const it = itemBoxes[itemId + k]
                    if (it) box = union(box, it)
                }
                next = i + 1
            } else {
                const total = itemId > 1 ? itemId : 1
                const end = i + total
                let c = i + 1
                while (c < end && c < nodeCount) {
                    const r = walk(c)
                    box = union(box, r.box)
                    c = r.next
                }
                next = end
            }
            nmin[i] = box.min
            nmax[i] = box.max
            return { box, next }
        }

        let idx = 0
        let all = EMPTY_BOX
        let guard = 0
        while (idx < nodeCount && guard++ < nodeCount + 2) {
            const r = walk(idx)
            all = union(all, r.box)
            idx = r.next
        }
        for (const it of itemBoxes) {
            if (it) all = union(all, it)
        }
        if (!Number.isFinite(all.min[0])) return
        all = padded(all, pad || ZERO_PAD)

        const cen = [(all.min[0] + all.max[0]) / 2, (all.min[1] + all.max[1]) / 2, (all.min[2] + all.max[2]) / 2]
        const quant = [0, 0, 0]
        const qinv = [0, 0, 0]
        for (let a = 0; a < 3; a++) {
            const ext = Math.max(Math.abs(all.min[a] - cen[a]), Math.abs(all.max[a] - cen[a]))
            quant[a] = ext / 32767
            if (!(quant[a] > 1e-9)) quant[a] = 1 / 32767
            qinv[a] = 1 / quant[a]
        }
        writeVec3(data, bp + BVH.BBMIN, all.min)
        writeVec3(data, bp + BVH.BBMAX, all.max)
        writeVec3(data, bp + BVH.BBCEN, cen)
        writeVec3(data, bp + BVH.QINV, qinv)
        writeVec3(data, bp + BVH.QUANT, quant)

        const lo = v => Math.max(-32768, Math.min(32767, Math.floor(v)))
        const hi = v => Math.max(-32768, Math.min(32767, Math.ceil(v)))

        const quantize = (off, mn, mx) => {
            for (let a = 0; a < 3; a++) {
                data.writeInt16LE(lo((mn[a] - cen[a]) * qinv[a]), off + a * 2)
                data.writeInt16LE(hi((mx[a] - cen[a]) * qinv[a]), off + 6 + a * 2)
            }
        }

        for (let i = 0; i < nodeCount; i++) {
            const mn = nmin[i]
            if (!mn || !Number.isFinite(mn[0])) continue
            quantize(nodesPtr + i * 16, mn, nmax[i])
        }

        if (treesPtr >= 0) {
            for (let t = 0; t < treeCount; t++) {
                const to = treesPtr + t * 16
                const n1 = data.readInt16LE(to + 12)
                if (n1 < 0 || n1 >= nodeCount) continue
                const mn = nmin[n1]
                if (!mn || !Number.isFinite(mn[0])) continue
                quantize(to, mn, nmax[n1])
            }
        }
    }

    function localExtent(data, off, type) {
        const h = readHeader(data, off)
        if (!isGeom(type)) return { min: h.bmin, max: h.bmax }
        const vertsPtr = res(data.readUInt32LE(off + GEO.VERTS))
        const vertCount = data.readUInt32LE(off + GEO.VCOUNT)
        if (vertsPtr < 0 || !vertCount) return { min: h.bmin, max: h.bmax }
        const q = readVec3(data, off + GEO.QUANTUM)
        const c = readVec3(data, off + GEO.CENTER)
        const lo = [Infinity, Infinity, Infinity]
        const hi = [-Infinity, -Infinity, -Infinity]
        for (let i = 0; i < vertCount; i++) {
            const base = vertsPtr + i * 6
            for (let a = 0; a < 3; a++) {
                const v = data.readInt16LE(base + a * 2)
                if (v < lo[a]) lo[a] = v
                if (v > hi[a]) hi[a] = v
            }
        }
        if (!Number.isFinite(lo[0])) return { min: h.bmin, max: h.bmax }
        const margin = data.readFloatLE(off + 0x2c)
        const pad = Number.isFinite(margin) && margin > 0 ? margin : 0
        return {
            min: [lo[0] * q[0] + c[0] - pad, lo[1] * q[1] + c[1] - pad, lo[2] * q[2] + c[2] - pad],
            max: [hi[0] * q[0] + c[0] + pad, hi[1] * q[1] + c[1] + pad, hi[2] * q[2] + c[2] + pad]
        }
    }

    function childBoxes(data, cmp) {
        const boxes = new Array(cmp.count).fill(null)
        const min = [Infinity, Infinity, Infinity]
        const max = [-Infinity, -Infinity, -Infinity]
        for (let i = 0; i < cmp.count; i++) {
            const cp = childOffset(data, cmp, i)
            if (cp < 0) continue
            const local = localExtent(data, cp, data.readUInt8(cp + B.TYPE))
            const m = cmp.t1 >= 0 ? readMatrix(data, cmp.t1 + i * 64) : null
            const box = aabbOf(local.min, local.max, m)
            boxes[i] = box
            for (let a = 0; a < 3; a++) {
                if (box.min[a] < min[a]) min[a] = box.min[a]
                if (box.max[a] > max[a]) max[a] = box.max[a]
            }
        }
        return { boxes, min, max }
    }

    const ZERO_PAD = { min: [0, 0, 0], max: [0, 0, 0] }

    const MAX_PAD = 0.5

    function measurePad(stored, union) {
        if (!Number.isFinite(union.min[0])) return ZERO_PAD
        const pad = { min: [0, 0, 0], max: [0, 0, 0] }
        for (let a = 0; a < 3; a++) {
            pad.min[a] = Math.min(MAX_PAD, Math.max(0, union.min[a] - stored.min[a]))
            pad.max[a] = Math.min(MAX_PAD, Math.max(0, stored.max[a] - union.max[a]))
        }
        return pad
    }

    function padded(union, pad) {
        return {
            min: [union.min[0] - pad.min[0], union.min[1] - pad.min[1], union.min[2] - pad.min[2]],
            max: [union.max[0] + pad.max[0], union.max[1] + pad.max[1], union.max[2] + pad.max[2]]
        }
    }

    function refreshComposite(data, pads) {
        const cmp = composite(data)
        if (!cmp) return
        const { boxes, min, max } = childBoxes(data, cmp)
        for (let i = 0; i < cmp.count; i++) {
            if (boxes[i] && cmp.bbox >= 0) {
                writeVec3(data, cmp.bbox + i * 32, boxes[i].min)
                writeVec3(data, cmp.bbox + i * 32 + 16, boxes[i].max)
            }
        }
        if (!Number.isFinite(min[0])) return
        const root = padded({ min, max }, (pads && pads.root) || ZERO_PAD)
        const cen = [
            (root.min[0] + root.max[0]) / 2,
            (root.min[1] + root.max[1]) / 2,
            (root.min[2] + root.max[2]) / 2
        ]
        writeVec3(data, B.BOXMIN, root.min)
        writeVec3(data, B.BOXMAX, root.max)
        writeVec3(data, B.BOXCENTER, cen)
        writeVec3(data, B.SPHERECENTER, cen)
        data.writeFloatLE(Math.hypot(root.max[0] - cen[0], root.max[1] - cen[1], root.max[2] - cen[2]), B.SPHERE_R)
        if (cmp.bvh >= 0) rebuildBvh(data, cmp.bvh, boxes, (pads && pads.bvh) || ZERO_PAD)
    }

    function measurePads(data) {
        const cmp = composite(data)
        if (!cmp) return null
        const union = childBoxes(data, cmp)
        const rootStored = { min: readVec3(data, B.BOXMIN), max: readVec3(data, B.BOXMAX) }
        const pads = { root: measurePad(rootStored, union), bvh: ZERO_PAD }
        if (cmp.bvh >= 0) {
            const bvhStored = { min: readVec3(data, cmp.bvh + BVH.BBMIN), max: readVec3(data, cmp.bvh + BVH.BBMAX) }
            pads.bvh = measurePad(bvhStored, union)
        }
        return pads
    }

    function shiftRoot(data, d) {
        const type = data.readUInt8(B.TYPE)
        for (const off of [B.BOXMIN, B.BOXMAX, B.BOXCENTER, B.SPHERECENTER]) {
            const v = readVec3(data, off)
            writeVec3(data, off, [v[0] + d[0], v[1] + d[1], v[2] + d[2]])
        }
        if (isGeom(type)) {
            const c = readVec3(data, GEO.CENTER)
            writeVec3(data, GEO.CENTER, [c[0] + d[0], c[1] + d[1], c[2] + d[2]])
        }
        if (type === 8) {
            const bp = res(data.readUInt32LE(GEO_BVH))
            if (bp >= 0) {
                for (const off of [BVH.BBMIN, BVH.BBMAX, BVH.BBCEN]) {
                    const v = readVec3(data, bp + off)
                    writeVec3(data, bp + off, [v[0] + d[0], v[1] + d[1], v[2] + d[2]])
                }
            }
        }
    }

    function moveVerts(data, cmp, edit) {
        const off = cmp ? childOffset(data, cmp, edit.bi) : (edit.bi === 0 ? 0 : -1)
        if (off < 0) return 'that bound was not found'
        const type = data.readUInt8(off + B.TYPE)
        if (!isGeom(type)) return 'that bound has no geometry to move'
        if (res(data.readUInt32LE(off + GEO.OCTANTS)) >= 0) {
            return 'this bound carries an octant index that cannot be rebuilt in place'
        }
        const vertsPtr = res(data.readUInt32LE(off + GEO.VERTS))
        const polysPtr = res(data.readUInt32LE(off + GEO.POLYS))
        const vertCount = data.readUInt32LE(off + GEO.VCOUNT)
        const polyCount = data.readUInt32LE(off + GEO.PCOUNT)
        if (vertsPtr < 0 || polysPtr < 0 || !vertCount || !polyCount) return 'that bound has no vertex data'
        for (let i = 0; i < polyCount; i++) {
            if ((data.readUInt8(polysPtr + i * 16) & 7) !== 0) {
                return 'this bound mixes triangles with box and capsule shapes, which this editor does not move'
            }
        }

        const q = readVec3(data, off + GEO.QUANTUM)
        const c = readVec3(data, off + GEO.CENTER)
        const verts = new Float64Array(vertCount * 3)
        for (let i = 0; i < vertCount; i++) {
            verts[i * 3] = data.readInt16LE(vertsPtr + i * 6) * q[0] + c[0]
            verts[i * 3 + 1] = data.readInt16LE(vertsPtr + i * 6 + 2) * q[1] + c[1]
            verts[i * 3 + 2] = data.readInt16LE(vertsPtr + i * 6 + 4) * q[2] + c[2]
        }

        const M = cmp && cmp.t1 >= 0 ? readMatrix(data, cmp.t1 + edit.bi * 64) : null
        const toWorld = (x, y, z) => applyM(M, x, y, z)
        const toLocal = (x, y, z) => {
            if (!M) return [x, y, z]
            const dx = x - M[12]
            const dy = y - M[13]
            const dz = z - M[14]
            return [
                dx * M[0] + dy * M[1] + dz * M[2],
                dx * M[4] + dy * M[5] + dz * M[6],
                dx * M[8] + dy * M[9] + dz * M[10]
            ]
        }

        const moving = new Set()
        for (const p of edit.polys) {
            if (!Number.isInteger(p) || p < 0 || p >= polyCount) continue
            const po = polysPtr + p * 16
            for (const o of [4, 6, 8]) {
                const vi = data.readUInt16LE(po + o) & 0x7fff
                if (vi < vertCount) moving.add(vi)
            }
        }
        if (!moving.size) return 'none of those faces are in this bound'

        const e = edit.m
        for (const vi of moving) {
            const w = toWorld(verts[vi * 3], verts[vi * 3 + 1], verts[vi * 3 + 2])
            const t = applyM(e, w[0], w[1], w[2])
            const l = toLocal(t[0], t[1], t[2])
            verts[vi * 3] = l[0]
            verts[vi * 3 + 1] = l[1]
            verts[vi * 3 + 2] = l[2]
        }

        const lo = [Infinity, Infinity, Infinity]
        const hi = [-Infinity, -Infinity, -Infinity]
        for (let i = 0; i < vertCount; i++) {
            for (let a = 0; a < 3; a++) {
                const v = verts[i * 3 + a]
                if (!Number.isFinite(v)) return 'that move produced an invalid position'
                if (v < lo[a]) lo[a] = v
                if (v > hi[a]) hi[a] = v
            }
        }

        const nc = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
        const nq = [0, 0, 0]
        for (let a = 0; a < 3; a++) {
            const half = Math.max(Math.abs(lo[a] - nc[a]), Math.abs(hi[a] - nc[a]))
            nq[a] = half / 32767
            if (!(nq[a] > 1e-9)) nq[a] = 1 / 32767
        }
        const encode = (ptr) => {
            for (let i = 0; i < vertCount; i++) {
                for (let a = 0; a < 3; a++) {
                    const v = Math.round((verts[i * 3 + a] - nc[a]) / nq[a])
                    data.writeInt16LE(Math.max(-32767, Math.min(32767, v)), ptr + i * 6 + a * 2)
                }
            }
        }
        encode(vertsPtr)

        const shrunkPtr = res(data.readUInt32LE(off + GEO.VSHRUNK))
        if (shrunkPtr >= 0) {
            const sv = new Float64Array(vertCount * 3)
            for (let i = 0; i < vertCount; i++) {
                sv[i * 3] = data.readInt16LE(shrunkPtr + i * 6) * q[0] + c[0]
                sv[i * 3 + 1] = data.readInt16LE(shrunkPtr + i * 6 + 2) * q[1] + c[1]
                sv[i * 3 + 2] = data.readInt16LE(shrunkPtr + i * 6 + 4) * q[2] + c[2]
            }
            for (const vi of moving) {
                const w = toWorld(sv[vi * 3], sv[vi * 3 + 1], sv[vi * 3 + 2])
                const t = applyM(e, w[0], w[1], w[2])
                const l = toLocal(t[0], t[1], t[2])
                sv[vi * 3] = l[0]
                sv[vi * 3 + 1] = l[1]
                sv[vi * 3 + 2] = l[2]
            }
            for (let i = 0; i < vertCount; i++) {
                for (let a = 0; a < 3; a++) {
                    const v = Math.round((sv[i * 3 + a] - nc[a]) / nq[a])
                    data.writeInt16LE(Math.max(-32767, Math.min(32767, v)), shrunkPtr + i * 6 + a * 2)
                }
            }
        }

        writeVec3(data, off + GEO.QUANTUM, nq)
        writeVec3(data, off + GEO.CENTER, nc)

        const margin = data.readFloatLE(off + 0x2c)
        const pad = Number.isFinite(margin) && margin > 0 ? margin : 0
        const bmin = [lo[0] - pad, lo[1] - pad, lo[2] - pad]
        const bmax = [hi[0] + pad, hi[1] + pad, hi[2] + pad]
        writeVec3(data, off + B.BOXMIN, bmin)
        writeVec3(data, off + B.BOXMAX, bmax)
        writeVec3(data, off + B.BOXCENTER, nc)
        writeVec3(data, off + B.SPHERECENTER, nc)
        data.writeFloatLE(Math.hypot(bmax[0] - nc[0], bmax[1] - nc[1], bmax[2] - nc[2]), off + B.SPHERE_R)

        if (type === 8) {
            const bp = res(data.readUInt32LE(off + GEO_BVH))
            if (bp >= 0) {
                const boxes = new Array(polyCount)
                for (let i = 0; i < polyCount; i++) {
                    const po = polysPtr + i * 16
                    const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
                    for (const o of [4, 6, 8]) {
                        const vi = data.readUInt16LE(po + o) & 0x7fff
                        if (vi >= vertCount) continue
                        for (let a = 0; a < 3; a++) {
                            const v = verts[vi * 3 + a]
                            if (v < box.min[a]) box.min[a] = v
                            if (v > box.max[a]) box.max[a] = v
                        }
                    }
                    boxes[i] = Number.isFinite(box.min[0]) ? box : null
                }
                rebuildBvh(data, bp, boxes, ZERO_PAD)
            }
        }
        return null
    }

    function patch(buf, edits) {
        if (!edits || !edits.length) throw new Error('no edits')
        const parsed = KKCT.rsc7.parse(buf)
        const data = Buffer.from(parsed.data)
        const cmp = composite(data)
        const pads = measurePads(data)
        const applied = []
        const missed = []
        let moved = false
        let lastError = null

        for (const edit of edits) {
            if (edit.kind === 'boundMatrix') {
                if (!cmp || cmp.t1 < 0 || !Array.isArray(edit.m) || edit.m.length !== 16 || childOffset(data, cmp, edit.bi) < 0) {
                    missed.push(edit)
                    continue
                }
                writeMatrix(data, cmp.t1 + edit.bi * 64, edit.m)
                if (cmp.t2 >= 0) writeMatrix(data, cmp.t2 + edit.bi * 64, edit.m)
                moved = true
                applied.push(edit)
                continue
            }

            if (edit.kind === 'boundShift') {
                if (cmp || !Array.isArray(edit.d) || edit.d.length !== 3) {
                    missed.push(edit)
                    continue
                }
                shiftRoot(data, edit.d)
                applied.push(edit)
                continue
            }

            if (edit.kind === 'moveVerts') {
                if (!Array.isArray(edit.polys) || !Array.isArray(edit.m) || edit.m.length !== 16) {
                    missed.push(edit)
                    continue
                }
                const err = moveVerts(data, cmp, edit)
                if (err) {
                    missed.push(edit)
                    lastError = err
                    continue
                }
                moved = true
                applied.push(edit)
                continue
            }

            if (edit.kind === 'addMaterial') {
                const off = cmp ? childOffset(data, cmp, edit.bi) : (edit.bi === 0 ? 0 : -1)
                if (off < 0 || !isGeom(data.readUInt8(off + B.TYPE))) {
                    missed.push(edit)
                    continue
                }
                const mp = res(data.readUInt32LE(off + GEO.MATS))
                const mc = data.readUInt8(off + GEO.MATCOUNT)
                if (mp < 0 || edit.slot !== mc || !materialRoom(data, off)) {
                    missed.push(edit)
                    continue
                }
                const enc = KKCT.collmats.encode(
                    { type: 0, procId: 0, roomId: 0, pedDensity: 0, flags: 0, colorIndex: 0, unk4: 0 },
                    edit
                )
                data.writeUInt32LE(enc.data1, mp + mc * 8)
                data.writeUInt32LE(enc.data2, mp + mc * 8 + 4)
                data.writeUInt8(mc + 1, off + GEO.MATCOUNT)
                applied.push(edit)
                continue
            }

            if (edit.kind === 'faceMaterial') {
                const off = cmp ? childOffset(data, cmp, edit.bi) : (edit.bi === 0 ? 0 : -1)
                if (off < 0 || !isGeom(data.readUInt8(off + B.TYPE)) || !Array.isArray(edit.polys)) {
                    missed.push(edit)
                    continue
                }
                const pmiPtr = res(data.readUInt32LE(off + GEO.POLYMATS))
                const polyCount = data.readUInt32LE(off + GEO.PCOUNT)
                const matCount = data.readUInt8(off + GEO.MATCOUNT)
                if (pmiPtr < 0 || !polyCount || edit.slot < 0 || edit.slot >= matCount) {
                    missed.push(edit)
                    continue
                }
                let wrote = 0
                for (const poly of edit.polys) {
                    if (!Number.isInteger(poly) || poly < 0 || poly >= polyCount) continue
                    data.writeUInt8(edit.slot, pmiPtr + poly)
                    wrote++
                }
                if (wrote) applied.push(edit)
                else missed.push(edit)
                continue
            }

            if (edit.kind === 'boundMaterial') {
                const off = cmp ? childOffset(data, cmp, edit.bi) : (edit.bi === 0 ? 0 : -1)
                if (off < 0) {
                    missed.push(edit)
                    continue
                }
                const type = data.readUInt8(off + B.TYPE)
                let a1 = off + B.MAT1
                let a2 = off + B.MAT2
                if (edit.slot >= 0) {
                    const mp = res(data.readUInt32LE(off + GEO.MATS))
                    const mc = isGeom(type) ? data.readUInt8(off + GEO.MATCOUNT) : 0
                    if (mp < 0 || edit.slot >= mc) {
                        missed.push(edit)
                        continue
                    }
                    a1 = mp + edit.slot * 8
                    a2 = a1 + 4
                }
                const cur = KKCT.collmats.decode(data.readUInt32LE(a1), data.readUInt32LE(a2))
                const next = {}
                for (const k of ['type', 'flags', 'procId', 'roomId', 'pedDensity', 'colorIndex']) {
                    if (typeof edit[k] === 'number') next[k] = edit[k]
                }
                const enc = KKCT.collmats.encode(cur, next)
                data.writeUInt32LE(enc.data1, a1)
                data.writeUInt32LE(enc.data2, a2)
                applied.push(edit)
                continue
            }

            missed.push(edit)
        }

        if (!applied.length) throw new Error(lastError || 'no edit matched anything in this file')
        if (moved) refreshComposite(data, pads)
        return { buf: KKCT.rsc7.write(parsed, data), applied: applied.length, missed: missed.length }
    }

    return { parse, parseGeometry, inspect, geometryByBound, faceData, slotUsage, canMoveVerts, patch }
})()
})()
