(() => {
globalThis.KKCT = globalThis.KKCT || {}

KKCT.ymap = (() => {
    const round3 = v => Math.round((v ?? 0) * 1000) / 1000
    const round4 = v => Math.round((v ?? 0) * 10000) / 10000
    const box = (mn, mx) => (mn && mx) ? { min: mn.map(round3), max: mx.map(round3) } : null

    function parse(buf) {
        const { data } = KKCT.rsc7.parse(buf)
        const meta = KKCT.meta.parse(data)
        const md = meta.readRoot(KKCT.joaatCase('CMapData'))
        if (!md) throw new Error('no CMapData block')

        const mloHash = KKCT.joaatCase('CMloInstanceDef')
        const entities = []
        for (const e of Array.isArray(md.entities) ? md.entities : []) {
            if (!e || !e.position) continue
            entities.push({
                a: (e.archetypeName ?? 0) >>> 0,
                g: (e.guid ?? 0) >>> 0,
                f: (e.flags ?? 0) >>> 0,
                p: [round3(e.position[0]), round3(e.position[1]), round3(e.position[2])],
                r: e.rotation ? [round4(e.rotation[0]), round4(e.rotation[1]), round4(e.rotation[2]), round4(e.rotation[3])] : [0, 0, 0, 1],
                s: [round3(e.scaleXY ?? 1), round3(e.scaleZ ?? 1)],
                ld: Math.round(e.lodDist ?? 0),
                cld: Math.round(e.childLodDist ?? 0),
                ll: e.lodLevel ?? 0,
                pl: e.priorityLevel ?? 0,
                mlo: e.__struct === mloHash
            })
        }

        const boxOccluders = []
        for (const b of md.boxOccluders || []) {
            if (!b) continue
            boxOccluders.push({
                c: [round3((b.iCenterX ?? 0) / 4), round3((b.iCenterY ?? 0) / 4), round3((b.iCenterZ ?? 0) / 4)],
                l: round3((b.iLength ?? 0) / 4),
                w: round3((b.iWidth ?? 0) / 4),
                h: round3((b.iHeight ?? 0) / 4),
                cz: (b.iCosZ ?? 0) / 32767,
                sz: (b.iSinZ ?? 0) / 32767
            })
        }

        const occludeModels = []
        for (const o of md.occludeModels || []) {
            if (!o) continue
            occludeModels.push({
                bmin: o.bmin ? o.bmin.map(round3) : null,
                bmax: o.bmax ? o.bmax.map(round3) : null,
                tris: o.numTris ? (o.numTris & 0x7fff) : 0
            })
        }

        const carGens = []
        for (const c of md.carGenerators || []) {
            if (!c || !c.position) continue
            carGens.push({ p: c.position.map(round3), m: (c.carModel ?? 0) >>> 0 })
        }

        const distLod = md.DistantLODLightsSOA
        const lodLights = md.LODLightsSOA

        return {
            name: (md.name ?? 0) >>> 0,
            parent: (md.parent ?? 0) >>> 0,
            flags: (md.flags ?? 0) >>> 0,
            contentFlags: (md.contentFlags ?? 0) >>> 0,
            streamingExtents: box(md.streamingExtentsMin, md.streamingExtentsMax),
            entitiesExtents: box(md.entitiesExtentsMin, md.entitiesExtentsMax),
            entities,
            boxOccluders,
            occludeModels,
            carGens,
            physDicts: (md.physicsDictionaries || []).map(h => h >>> 0),
            distLodLights: !!(distLod && Array.isArray(distLod.position) && distLod.position.length),
            lodLights: !!(lodLights && Array.isArray(lodLights.position) && lodLights.position.length)
        }
    }

    return { parse }
})()
})()
