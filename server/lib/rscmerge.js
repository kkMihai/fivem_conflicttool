(() => {
const crypto = require('crypto')

globalThis.KKCT = globalThis.KKCT || {}

KKCT.rscmerge = (() => {
    const align = v => (v + 15) & ~15
    const ptr = (segment, offset) => ((segment << 28) | offset) >>> 0
    const digest = parts => crypto.createHash('sha1').update(JSON.stringify(parts)).digest('hex')

    function source(buf, index) {
        const parsed = KKCT.rsc7.parse(buf)
        const systemSize = KKCT.rsc7.sizeFromFlags(parsed.systemFlags)
        const graphicsSize = KKCT.rsc7.sizeFromFlags(parsed.graphicsFlags)
        if (systemSize < 16 || systemSize + graphicsSize !== parsed.data.length) {
            throw new Error('RSC7 page sizes do not match the file')
        }
        return {
            index,
            parsed,
            system: Buffer.from(parsed.data.subarray(0, systemSize)),
            graphics: Buffer.from(parsed.data.subarray(systemSize)),
            systemSize,
            graphicsSize
        }
    }

    function relocate(data, src, systemDelta, graphicsDelta) {
        let count = 0
        for (let off = 0; off + 8 <= data.length; off += 8) {
            if (data.readUInt32LE(off + 4) !== 0) continue
            const value = data.readUInt32LE(off)
            const segment = value >>> 28
            const offset = value & 0x0fffffff
            if (segment === 5 && offset < src.systemSize) {
                data.writeUInt32LE(ptr(5, offset + systemDelta), off)
                count++
            } else if (segment === 6 && offset < src.graphicsSize) {
                data.writeUInt32LE(ptr(6, offset + graphicsDelta), off)
                count++
            }
        }
        return count
    }

    function workspace(buffers, options) {
        if (!Array.isArray(buffers) || buffers.length < 2) throw new Error('at least two RSC7 copies are required')
        const sources = buffers.map(source)
        const version = sources[0].parsed.version
        if (sources.some(s => s.parsed.version !== version)) throw new Error('RSC7 versions differ')
        const systemPrefix = align((options && options.systemPrefix) || 0)
        let systemCursor = systemPrefix
        let graphicsCursor = 0
        for (const src of sources) {
            src.systemOffset = systemCursor
            src.graphicsOffset = graphicsCursor
            systemCursor = align(systemCursor + src.systemSize)
            graphicsCursor = align(graphicsCursor + src.graphicsSize)
        }
        let system = Buffer.alloc(systemCursor)
        let graphics = Buffer.alloc(graphicsCursor)
        for (const src of sources) {
            const sys = Buffer.from(src.system)
            const gfx = Buffer.from(src.graphics)
            src.relocatedPointers = relocate(sys, src, src.systemOffset, src.graphicsOffset) + relocate(gfx, src, src.systemOffset, src.graphicsOffset)
            sys.copy(system, src.systemOffset)
            gfx.copy(graphics, src.graphicsOffset)
        }

        function alloc(size) {
            const offset = align(system.length)
            system = Buffer.concat([system, Buffer.alloc(offset - system.length + align(size))])
            return offset
        }

        function at(src, value) {
            const segment = value >>> 28
            const offset = value & 0x0fffffff
            if (segment === 5 && offset < src.systemSize) return src.systemOffset + offset
            if (segment === 6 && offset < src.graphicsSize) return system.length + src.graphicsOffset + offset
            return -1
        }

        function virtual(src, value) {
            const segment = value >>> 28
            const offset = value & 0x0fffffff
            if (segment === 5 && offset < src.systemSize) return ptr(5, src.systemOffset + offset)
            if (segment === 6 && offset < src.graphicsSize) return ptr(6, src.graphicsOffset + offset)
            return 0
        }

        function finish(rootSource) {
            const base = rootSource || sources[0]
            const pagesOffset = alloc(32)
            const systemFlags = KKCT.rsc7.onePageFlags(system.length, base.parsed.systemFlags)
            const graphicsFlags = KKCT.rsc7.onePageFlags(graphics.length, base.parsed.graphicsFlags)
            const systemSize = KKCT.rsc7.sizeFromFlags(systemFlags)
            const graphicsSize = KKCT.rsc7.sizeFromFlags(graphicsFlags)
            const finalSystem = Buffer.alloc(systemSize)
            const finalGraphics = Buffer.alloc(graphicsSize)
            system.copy(finalSystem)
            graphics.copy(finalGraphics)
            finalSystem.writeUInt8(1, pagesOffset + 8)
            finalSystem.writeUInt8(graphicsSize ? 1 : 0, pagesOffset + 9)
            finalSystem.writeUInt32LE(ptr(5, pagesOffset), 8)
            finalSystem.writeUInt32LE(0, 12)
            const data = Buffer.concat([finalSystem, finalGraphics])
            return {
                buf: KKCT.rsc7.pack(base.parsed, systemFlags, data, graphicsFlags),
                data,
                systemSize,
                graphicsSize,
                sources,
                pagesOffset
            }
        }

        return {
            sources,
            get system() { return system },
            get graphics() { return graphics },
            alloc,
            at,
            virtual,
            ptr,
            finish
        }
    }

    return { align, ptr, digest, source, workspace }
})()
})()
