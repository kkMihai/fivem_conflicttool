(() => {
const zlib = require('zlib')

globalThis.KKCT = globalThis.KKCT || {}

KKCT.rsc7 = {
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
    resolve(lo) {
        if (!lo) return -1
        const seg = lo >>> 28
        if (seg !== 5) return -1
        return lo & 0x0fffffff
    }
}
})()
