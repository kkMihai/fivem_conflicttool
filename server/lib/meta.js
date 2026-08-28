(() => {
globalThis.KKCT = globalThis.KKCT || {}

const FIELD_NAMES = [
    'name', 'parent', 'flags', 'contentFlags', 'streamingExtentsMin', 'streamingExtentsMax',
    'entitiesExtentsMin', 'entitiesExtentsMax', 'entities', 'containerLods', 'boxOccluders',
    'occludeModels', 'physicsDictionaries', 'instancedData', 'timeCycleModifiers', 'carGenerators',
    'LODLightsSOA', 'DistantLODLightsSOA', 'block', 'archetypeName', 'guid', 'position', 'rotation',
    'scaleXY', 'scaleZ', 'parentIndex', 'lodDist', 'childLodDist', 'lodLevel', 'numChildren',
    'priorityLevel', 'ambientOcclusionMultiplier', 'artificialAmbientOcclusion', 'tintValue',
    'iCenterX', 'iCenterY', 'iCenterZ', 'iCosZ', 'iLength', 'iWidth', 'iHeight', 'iSinZ',
    'bmin', 'bmax', 'dataSize', 'numVertsInBytes', 'numTris', 'orientX', 'orientY',
    'perpendicularLength', 'carModel', 'popGroup', 'livery', 'archetypes', 'dependencies',
    'assetName', 'assetType', 'bbMin', 'bbMax', 'bsCentre', 'bsRadius', 'textureDictionary',
    'physicsDictionary', 'drawableDictionary', 'hdTextureDist', 'specialAttribute',
    'RGBI', 'numStreetLights', 'category', 'direction', 'falloff', 'falloffExponent',
    'timeAndStateFlags', 'hash', 'intensity', 'capsule', 'extensions', 'exteriorName', 'blockName',
    'version', 'level', 'order', 'startTime', 'endTime'
]

KKCT.meta = (() => {
    const fieldNameByHash = new Map()
    let initialized = false

    function init() {
        if (initialized) return
        for (const n of FIELD_NAMES) {
            fieldNameByHash.set(KKCT.joaatCase(n), n)
        }
        initialized = true
    }

    const T = {
        BOOL: 0x01, S8: 0x10, U8: 0x11, S16: 0x12, U16: 0x13, S32: 0x14, U32: 0x15,
        FLOAT: 0x21, VEC3: 0x33, VEC4: 0x34, BYTE_ENUM: 0x60, INT_ENUM: 0x62,
        INT_FLAGS1: 0x63, SHORT_FLAGS: 0x64, INT_FLAGS2: 0x65, HASH: 0x4a, ARRAY: 0x52,
        CHAR_ARRAY: 0x40, BYTE_ARRAY: 0x50, DATA_PTR: 0x59, CHAR_PTR: 0x44,
        STRUCT_PTR: 0x07, STRUCT: 0x05
    }

    function parse(data) {
        init()
        if (data.length < 0x50) throw new Error('meta too small')
        if (data.readInt32LE(0x10) !== 0x50524430) throw new Error('not a META resource')
        const res = KKCT.rsc7.resolve
        const structPtr = res(data.readUInt32LE(0x20))
        const blocksPtr = res(data.readUInt32LE(0x30))
        const structCount = data.readInt16LE(0x48)
        const blockCount = data.readInt16LE(0x4c)

        const structures = new Map()
        for (let i = 0; i < structCount; i++) {
            const base = structPtr + i * 32
            const nameHash = data.readUInt32LE(base)
            const entriesPtr = res(data.readUInt32LE(base + 0x10))
            const size = data.readInt32LE(base + 0x18)
            const entriesCount = data.readInt16LE(base + 0x1e)
            const entries = []
            for (let j = 0; j < entriesCount; j++) {
                const eb = entriesPtr + j * 16
                entries.push({
                    nameHash: data.readUInt32LE(eb),
                    offset: data.readInt32LE(eb + 4),
                    type: data.readUInt8(eb + 8),
                    refIdx: data.readInt16LE(eb + 10),
                    refKey: data.readUInt32LE(eb + 12)
                })
            }
            structures.set(nameHash, { nameHash, size, entries })
        }

        const blocks = []
        for (let i = 0; i < blockCount; i++) {
            const base = blocksPtr + i * 16
            blocks.push({
                nameHash: data.readUInt32LE(base),
                length: data.readInt32LE(base + 4),
                ptr: res(data.readUInt32LE(base + 8))
            })
        }

        function mp(off) {
            const v = data.readUInt32LE(off)
            if (!v) return null
            const bi = (v & 0xfff) - 1
            const bo = (v >>> 12) & 0xfffff
            if (bi < 0 || bi >= blocks.length) return null
            return { abs: blocks[bi].ptr + bo, block: blocks[bi] }
        }

        function elemSize(info) {
            switch (info.type) {
                case T.BOOL: case T.S8: case T.U8: case T.BYTE_ENUM: return 1
                case T.S16: case T.U16: case T.SHORT_FLAGS: return 2
                case T.S32: case T.U32: case T.FLOAT: case T.HASH: case T.INT_ENUM: case T.INT_FLAGS1: case T.INT_FLAGS2: return 4
                case T.STRUCT_PTR: return 8
                case T.VEC3: return 12
                case T.VEC4: return 16
                case T.STRUCT: {
                    const si = structures.get(info.refKey)
                    return si ? si.size : 0
                }
                default: return 0
            }
        }

        function readScalar(off, type) {
            switch (type) {
                case T.BOOL: return data.readUInt8(off) !== 0
                case T.S8: return data.readInt8(off)
                case T.U8: case T.BYTE_ENUM: return data.readUInt8(off)
                case T.S16: return data.readInt16LE(off)
                case T.U16: case T.SHORT_FLAGS: return data.readUInt16LE(off)
                case T.S32: case T.INT_ENUM: return data.readInt32LE(off)
                case T.U32: case T.HASH: case T.INT_FLAGS1: case T.INT_FLAGS2: return data.readUInt32LE(off)
                case T.FLOAT: return data.readFloatLE(off)
                case T.VEC3: return [data.readFloatLE(off), data.readFloatLE(off + 4), data.readFloatLE(off + 8)]
                case T.VEC4: return [data.readFloatLE(off), data.readFloatLE(off + 4), data.readFloatLE(off + 8), data.readFloatLE(off + 12)]
                default: return null
            }
        }

        function readStructAt(structHash, abs, depth) {
            const info = structures.get(structHash)
            if (!info || depth > 6) return null
            const obj = { __struct: structHash, __abs: abs }
            for (const e of info.entries) {
                const fname = fieldNameByHash.get(e.nameHash)
                if (!fname) continue
                const off = abs + e.offset
                if (e.type === T.ARRAY) {
                    obj[fname] = readArray(off, info.entries[e.refIdx], depth + 1)
                } else if (e.type === T.STRUCT) {
                    obj[fname] = readStructAt(e.refKey, off, depth + 1)
                } else if (e.type === T.STRUCT_PTR) {
                    const p = mp(off)
                    obj[fname] = p ? readStructAt(p.block.nameHash, p.abs, depth + 1) : null
                } else if (e.type === T.CHAR_PTR) {
                    const p = mp(off)
                    obj[fname] = p ? readCString(p.abs) : null
                } else {
                    obj[fname] = readScalar(off, e.type)
                }
            }
            return obj
        }

        function readArray(off, elemInfo, depth) {
            if (!elemInfo) return []
            const p = mp(off)
            const count = data.readUInt16LE(off + 8)
            if (!p || !count) return []
            const out = []
            const capped = Math.min(count, 65535)
            if (elemInfo.type === T.STRUCT_PTR) {
                for (let i = 0; i < capped; i++) {
                    const ep = mp(p.abs + i * 8)
                    out.push(ep ? readStructAt(ep.block.nameHash, ep.abs, depth + 1) : null)
                }
                return out
            }
            const stride = elemSize(elemInfo)
            if (!stride) return []
            for (let i = 0; i < capped; i++) {
                const eo = p.abs + i * stride
                if (elemInfo.type === T.STRUCT) {
                    out.push(readStructAt(elemInfo.refKey, eo, depth + 1))
                } else {
                    out.push(readScalar(eo, elemInfo.type))
                }
            }
            return out
        }

        function readCString(abs) {
            let end = abs
            while (end < data.length && data[end] !== 0) end++
            return data.toString('utf8', abs, end)
        }

        function findBlock(structHash) {
            for (const b of blocks) {
                if (b.nameHash === structHash) return b
            }
            return null
        }

        function readRoot(structHash) {
            const b = findBlock(structHash)
            if (!b) return null
            return readStructAt(structHash, b.ptr, 0)
        }

        function fieldOffset(structHash, name) {
            const info = structures.get(structHash)
            if (!info) return null
            const h = KKCT.joaatCase(name)
            for (const e of info.entries) {
                if (e.nameHash === h) return { offset: e.offset, type: e.type }
            }
            return null
        }

        return { data, structures, blocks, findBlock, readRoot, readStructAt, fieldOffset, T }
    }

    return { parse, T }
})()
})()
