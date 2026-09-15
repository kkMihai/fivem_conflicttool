(() => {
const zlib = require('zlib')

globalThis.KKCT = globalThis.KKCT || {}

KKCT.rsc7 = {
    sizeFromFlags(flags) {
        const base = 0x200 << (flags & 0xf)
        const units =
            ((flags >>> 27) & 1) +
            (((flags >>> 26) & 1) << 1) +
            (((flags >>> 25) & 1) << 2) +
            (((flags >>> 24) & 1) << 3) +
            (((flags >>> 17) & 0x7f) << 4) +
            (((flags >>> 11) & 0x3f) << 5) +
            (((flags >>> 7) & 0xf) << 6) +
            (((flags >>> 5) & 3) << 7) +
            (((flags >>> 4) & 1) << 8)
        return base * units
    },
    onePageFlags(size, sourceFlags) {
        if (!size) return sourceFlags & 0xf0000000
        let shift = 0
        let page = 0x2000
        while (page < size && shift < 15) {
            page *= 2
            shift++
        }
        if (page < size) throw new Error('merged RSC7 segment is too large')
        return ((sourceFlags & 0xf0000000) | 0x00020000 | shift) >>> 0
    },
    parse(buf) {
        if (buf.length < 16 || buf.readUInt32LE(0) !== 0x37435352) {
            throw new Error('not an RSC7 resource')
        }
        const version = buf.readUInt32LE(4)
        const systemFlags = buf.readUInt32LE(8)
        const graphicsFlags = buf.readUInt32LE(12)
        const data = zlib.inflateRawSync(buf.subarray(16))
        return { version, systemFlags, graphicsFlags, data }
    },
    write(parsed, data) {
        if (data.length !== parsed.data.length) {
            throw new Error(`rsc7 write needs the same length, got ${data.length} want ${parsed.data.length}`)
        }
        const head = Buffer.alloc(16)
        head.writeUInt32LE(0x37435352, 0)
        head.writeUInt32LE(parsed.version, 4)
        head.writeUInt32LE(parsed.systemFlags, 8)
        head.writeUInt32LE(parsed.graphicsFlags, 12)
        return Buffer.concat([head, zlib.deflateRawSync(data, { level: 9 })])
    },
    pack(head, systemFlags, data, graphicsFlags) {
        const out = Buffer.alloc(16)
        out.writeUInt32LE(0x37435352, 0)
        out.writeUInt32LE(head.version >>> 0, 4)
        out.writeUInt32LE(systemFlags >>> 0, 8)
        out.writeUInt32LE((graphicsFlags === undefined ? head.graphicsFlags : graphicsFlags) >>> 0, 12)
        return Buffer.concat([out, zlib.deflateRawSync(data, { level: 9 })])
    },
    resolve(lo, systemSize) {
        if (!lo) return -1
        const seg = lo >>> 28
        if (seg === 5) return lo & 0x0fffffff
        if (seg === 6 && Number.isInteger(systemSize)) return systemSize + (lo & 0x0fffffff)
        return -1
    }
}
})()
