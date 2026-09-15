(() => {
globalThis.KKCT = globalThis.KKCT || {}

KKCT.ymap = (() => {
    const round3 = v => Math.round((v ?? 0) * 1000) / 1000
    const round4 = v => Math.round((v ?? 0) * 10000) / 10000
    const box = (mn, mx) => (mn && mx) ? { min: mn.map(round3), max: mx.map(round3) } : null

    function occlMag(b) {
        return Math.hypot(b.iSinZ ?? 0, b.iCosZ ?? 0)
    }

    function occlCos(b) {
        const m = occlMag(b)
        return m > 0 ? (b.iSinZ ?? 0) / m : 1
    }

    function occlSin(b) {
        const m = occlMag(b)
        return m > 0 ? (b.iCosZ ?? 0) / m : 0
    }

    function arrayLen(meta, soa, pick) {
        if (!soa) return 0
        const info = meta.structures.get(soa.__struct)
        if (!info) return 0
        const entry = info.entries.find(pick)
        if (!entry) return 0
        const off = soa.__abs + entry.offset
        if (off < 0 || off + 10 > meta.data.length) return 0
        const v = meta.data.readUInt32LE(off)
        const bi = (v & 0xfff) - 1
        if (!v || bi < 0 || bi >= meta.blocks.length) return 0
        return meta.data.readUInt16LE(off + 8)
    }

    function parse(buf) {
        const { data } = KKCT.rsc7.parse(buf)
        const meta = KKCT.meta.parse(data)
        const md = meta.readRoot(KKCT.joaatCase('CMapData'))
        if (!md) throw new Error('no CMapData block')

        const mloHash = KKCT.joaatCase('CMloInstanceDef')
        const entities = []
        let lodParents = 0
        for (const e of Array.isArray(md.entities) ? md.entities : []) {
            if (!e || !e.position) continue
            if ((e.numChildren ?? 0) > 0) lodParents++
            const mlo = e.__struct === mloHash
            let r = [0, 0, 0, 1]
            if (e.rotation) {
                r = mlo
                    ? [round4(e.rotation[0]), round4(e.rotation[1]), round4(e.rotation[2]), round4(e.rotation[3])]
                    : [round4(-e.rotation[0]), round4(-e.rotation[1]), round4(-e.rotation[2]), round4(e.rotation[3])]
            }
            entities.push({
                a: (e.archetypeName ?? 0) >>> 0,
                g: (e.guid ?? 0) >>> 0,
                f: (e.flags ?? 0) >>> 0,
                p: [round3(e.position[0]), round3(e.position[1]), round3(e.position[2])],
                r,
                s: [round3(e.scaleXY ?? 1), round3(e.scaleZ ?? 1)],
                ld: Math.round(e.lodDist ?? 0),
                cld: Math.round(e.childLodDist ?? 0),
                ll: e.lodLevel ?? 0,
                pl: e.priorityLevel ?? 0,
                mlo
            })
        }

        const boxOccluders = []
        const rawBoxes = md.boxOccluders || []
        for (let bi = 0; bi < rawBoxes.length; bi++) {
            const b = rawBoxes[bi]
            if (!b) continue
            boxOccluders.push({
                bi,
                c: [round3((b.iCenterX ?? 0) / 4), round3((b.iCenterY ?? 0) / 4), round3((b.iCenterZ ?? 0) / 4)],
                l: round3((b.iLength ?? 0) / 4),
                w: round3((b.iWidth ?? 0) / 4),
                h: round3((b.iHeight ?? 0) / 4),
                cz: occlCos(b),
                sz: occlSin(b)
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

        const distSoa = md.DistantLODLightsSOA
        const lodSoa = md.LODLightsSOA
        const positionHash = KKCT.joaatCase('position')
        const lights = {
            lod: arrayLen(meta, lodSoa, e => e.offset === 72 && e.type === meta.T.ARRAY),
            dist: arrayLen(meta, distSoa, e => e.nameHash === positionHash && e.type === meta.T.ARRAY),
            street: (distSoa && distSoa.numStreetLights) || 0
        }

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
            distLodLights: lights.dist > 0,
            lodLights: lights.lod > 0,
            lodParents,
            lights
        }
    }

    const rpos = p => `${Math.round(p[0] * 4)}_${Math.round(p[1] * 4)}_${Math.round(p[2] * 4)}`

    const HIDDEN_DROP = 200
    const HIDDEN_DEEP = -5000
    const HIDDEN_SCREEN = -250
    const NEIGHBOUR_R2 = 150 * 150

    const hiddenCache = new WeakMap()

    function hidden(e, entities) {
        if (e.p[2] < HIDDEN_DEEP) return true
        if (e.p[2] >= HIDDEN_SCREEN) return false
        if (!entities) return false
        let seen = hiddenCache.get(entities)
        if (!seen) {
            seen = new Map()
            hiddenCache.set(entities, seen)
        }
        const key = `${e.a}_${e.g}_${rpos(e.p)}`
        const memo = seen.get(key)
        if (memo !== undefined) return memo
        const near = []
        for (const o of entities) {
            if (o === e || o.mlo) continue
            const dx = o.p[0] - e.p[0], dy = o.p[1] - e.p[1]
            if (dx * dx + dy * dy <= NEIGHBOUR_R2) near.push(o.p[2])
        }
        let result = false
        if (near.length) {
            near.sort((a, b) => a - b)
            result = near[Math.floor(near.length / 2)] - e.p[2] > HIDDEN_DROP
        }
        seen.set(key, result)
        return result
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

        const patchMloHash = KKCT.joaatCase('CMloInstanceDef')

        for (const edit of edits) {
            if (edit.kind === 'entityPos') {
                const list = Array.isArray(md.entities) ? md.entities : []
                const hit = list.find(e => e && e.position && e.__abs && e.__struct !== patchMloHash && (e.archetypeName >>> 0) === (edit.archetype >>> 0) && near(e.position, edit.from))
                if (!hit) {
                    missed.push(edit)
                    continue
                }
                const f = meta.fieldOffset(hit.__struct, 'position')
                if (!f || (f.type !== meta.T.VEC3 && f.type !== meta.T.VEC4)) {
                    missed.push(edit)
                    continue
                }
                let fr = null
                if (edit.rot) {
                    fr = meta.fieldOffset(hit.__struct, 'rotation')
                    if (!fr || fr.type !== meta.T.VEC4) {
                        missed.push(edit)
                        continue
                    }
                }
                const at = hit.__abs + f.offset
                data.writeFloatLE(edit.to[0], at)
                data.writeFloatLE(edit.to[1], at + 4)
                data.writeFloatLE(edit.to[2], at + 8)
                if (fr) {
                    const rat = hit.__abs + fr.offset
                    data.writeFloatLE(-edit.rot[0], rat)
                    data.writeFloatLE(-edit.rot[1], rat + 4)
                    data.writeFloatLE(-edit.rot[2], rat + 8)
                    data.writeFloatLE(edit.rot[3], rat + 12)
                }
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

    return { parse, patch, hidden }
})()
})()
