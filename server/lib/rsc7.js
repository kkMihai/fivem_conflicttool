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
    resolve(lo) {
        if (!lo) return -1
        const seg = lo >>> 28
        if (seg !== 5) return -1
        return lo & 0x0fffffff
    }
}
})()
