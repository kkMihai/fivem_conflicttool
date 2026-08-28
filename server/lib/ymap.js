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

    const EPS = 0.02

    function near(a, b) {
        return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS && Math.abs(a[2] - b[2]) < EPS
    }

    function patch(buf, edits) {
        if (!edits || !edits.length) throw new Error('no edits')
        const res = KKCT.rsc7.parse(buf)
        const data = Buffer.from(res.data)
        const meta = KKCT.meta.parse(data)
        const md = meta.readRoot(KKCT.joaatCase('CMapData'))
        if (!md) throw new Error('no CMapData block')

        const applied = []
        const missed = []

        for (const edit of edits) {
            if (edit.kind === 'entityPos') {
                const list = Array.isArray(md.entities) ? md.entities : []
                const hit = list.find(e => e && e.position && e.__abs && (e.archetypeName >>> 0) === (edit.archetype >>> 0) && near(e.position, edit.from))
                if (!hit) {
                    missed.push(edit)
                    continue
                }
                const f = meta.fieldOffset(hit.__struct, 'position')
                if (!f || (f.type !== meta.T.VEC3 && f.type !== meta.T.VEC4)) {
                    missed.push(edit)
                    continue
                }
                const at = hit.__abs + f.offset
                data.writeFloatLE(edit.to[0], at)
                data.writeFloatLE(edit.to[1], at + 4)
                data.writeFloatLE(edit.to[2], at + 8)
                applied.push(edit)
                continue
            }

            if (edit.kind === 'boxOccluder') {
                const list = Array.isArray(md.boxOccluders) ? md.boxOccluders : []
                const hit = list[edit.index]
                if (!hit || !hit.__abs) {
                    missed.push(edit)
                    continue
                }
                let ok = true
                for (const [name, value] of Object.entries(edit.fields)) {
                    const f = meta.fieldOffset(hit.__struct, name)
                    if (!f || f.type !== meta.T.S16) {
                        ok = false
                        break
                    }
                    const v = Math.max(-32768, Math.min(32767, Math.round(value)))
                    data.writeInt16LE(v, hit.__abs + f.offset)
                }
                if (ok) applied.push(edit)
                else missed.push(edit)
                continue
            }

            missed.push(edit)
        }

        if (!applied.length) throw new Error('no edit matched anything in this file')
        return { buf: KKCT.rsc7.write(res, data), applied: applied.length, missed: missed.length }
    }

    return { parse, patch }
})()
})()
