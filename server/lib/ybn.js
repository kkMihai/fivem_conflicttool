(() => {
globalThis.KKCT = globalThis.KKCT || {}

KKCT.ybn = (() => {
    const res = lo => KKCT.rsc7.resolve(lo)
    const round3 = v => Math.round(v * 1000) / 1000

    function readVec3(data, off) {
        return [data.readFloatLE(off), data.readFloatLE(off + 4), data.readFloatLE(off + 8)]
    }

    function readHeader(data, off) {
        return {
            type: data.readUInt8(off + 0x10),
            radius: data.readFloatLE(off + 0x14),
            bmax: readVec3(data, off + 0x20),
            bmin: readVec3(data, off + 0x30),
            center: readVec3(data, off + 0x40)
        }
    }

    function parse(buf) {
        const { data } = KKCT.rsc7.parse(buf)
        const root = readHeader(data, 0)
        const out = { type: root.type, bmin: root.bmin.map(round3), bmax: root.bmax.map(round3), children: 0, tris: 0 }
        if (root.type === 10) {
            const count = data.readUInt16LE(0xa0)
            out.children = count
            let tris = 0
            const childrenPtr = res(data.readUInt32LE(0x70))
            if (childrenPtr >= 0) {
                for (let i = 0; i < count; i++) {
                    const cp = res(data.readUInt32LE(childrenPtr + i * 8))
                    if (cp < 0) continue
                    const ch = readHeader(data, cp)
                    if (ch.type === 4 || ch.type === 8) {
                        tris += data.readUInt32LE(cp + 0xd4)
                    }
                }
            }
            out.tris = tris
        } else if (root.type === 4 || root.type === 8) {
            out.tris = data.readUInt32LE(0xd4)
        }
        return out
    }

    function extractGeometryTris(data, off, transform, out, maxTris) {
        const vertsPtr = res(data.readUInt32LE(off + 0xb0))
        const polysPtr = res(data.readUInt32LE(off + 0x88))
        const vertCount = data.readUInt32LE(off + 0xd0)
        const polyCount = data.readUInt32LE(off + 0xd4)
        if (vertsPtr < 0 || polysPtr < 0 || !vertCount || !polyCount) return
        const qx = data.readFloatLE(off + 0x90)
        const qy = data.readFloatLE(off + 0x94)
        const qz = data.readFloatLE(off + 0x98)
        const cx = data.readFloatLE(off + 0xa0)
        const cy = data.readFloatLE(off + 0xa4)
        const cz = data.readFloatLE(off + 0xa8)
        const verts = new Float32Array(vertCount * 3)
        for (let i = 0; i < vertCount; i++) {
            let x = data.readInt16LE(vertsPtr + i * 6) * qx + cx
            let y = data.readInt16LE(vertsPtr + i * 6 + 2) * qy + cy
            let z = data.readInt16LE(vertsPtr + i * 6 + 4) * qz + cz
            if (transform) {
                const tx = transform[0] * x + transform[4] * y + transform[8] * z + transform[12]
                const ty = transform[1] * x + transform[5] * y + transform[9] * z + transform[13]
                const tz = transform[2] * x + transform[6] * y + transform[10] * z + transform[14]
                x = tx; y = ty; z = tz
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
            out.push(
                round3(verts[i1 * 3]), round3(verts[i1 * 3 + 1]), round3(verts[i1 * 3 + 2]),
                round3(verts[i2 * 3]), round3(verts[i2 * 3 + 1]), round3(verts[i2 * 3 + 2]),
                round3(verts[i3 * 3]), round3(verts[i3 * 3 + 1]), round3(verts[i3 * 3 + 2])
            )
        }
    }

    function readMatrix(data, off) {
        const m = new Array(16)
        for (let i = 0; i < 16; i++) {
            m[i] = data.readFloatLE(off + i * 4)
        }
        return m
    }

    function parseGeometry(buf, maxTris) {
        const cap = maxTris || 12000
        const { data } = KKCT.rsc7.parse(buf)
        const root = readHeader(data, 0)
        const tris = []
        if (root.type === 4 || root.type === 8) {
            extractGeometryTris(data, 0, null, tris, cap)
        } else if (root.type === 10) {
            const count = data.readUInt16LE(0xa0)
            const childrenPtr = res(data.readUInt32LE(0x70))
            const t1Ptr = res(data.readUInt32LE(0x78))
            if (childrenPtr >= 0) {
                for (let i = 0; i < count; i++) {
                    if (tris.length / 9 >= cap) break
                    const cp = res(data.readUInt32LE(childrenPtr + i * 8))
                    if (cp < 0) continue
                    const ch = readHeader(data, cp)
                    if (ch.type === 4 || ch.type === 8) {
                        const m = t1Ptr >= 0 ? readMatrix(data, t1Ptr + i * 64) : null
                        extractGeometryTris(data, cp, m, tris, cap)
                    }
                }
            }
        }
        return tris
    }

    return { parse, parseGeometry }
})()
})()
