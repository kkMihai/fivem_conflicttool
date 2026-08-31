(() => {
globalThis.KKCT = globalThis.KKCT || {}

KKCT.collision = (() => {
    const LIMIT = 8000
    const SCALE_TOL = 0.02

    const round4 = v => Math.round(v * 10000) / 10000
    const round3 = v => Math.round(v * 1000) / 1000
    const finite = v => typeof v === 'number' && Number.isFinite(v)

    function boundOf(ins, bi) {
        if (!ins || !Array.isArray(ins.bounds)) return null
        return ins.bounds.find(b => b.bi === bi) || null
    }

    function rowLength(m, i) {
        return Math.hypot(m[i], m[i + 1], m[i + 2])
    }

    function transform(ins, bi, next) {
        if (!ins || !ins.bounds || !ins.bounds.length) {
            return { ok: false, reason: 'this collision has no bounds to edit, run a fresh scan first' }
        }
        if (!ins.composite) {
            return {
                ok: false,
                reason: 'this ybn is a single bound with no composite wrapper, so it can only be moved, not rotated. Use Move whole ybn instead.'
            }
        }
        const bound = boundOf(ins, bi)
        if (!bound || !bound.m) {
            return { ok: false, reason: 'that bound was not found, run a fresh scan first' }
        }
        const m = next && Array.isArray(next.m) ? next.m.map(Number) : null
        if (!m || m.length !== 16 || m.some(v => !Number.isFinite(v))) {
            return { ok: false, reason: 'the edit data is incomplete' }
        }
        for (const t of [m[12], m[13], m[14]]) {
            if (Math.abs(t) > LIMIT) {
                return { ok: false, reason: 'that puts the collision outside the world bounds' }
            }
        }
        for (const row of [0, 4, 8]) {
            const len = rowLength(m, row)
            if (!(len > 1 - SCALE_TOL && len < 1 + SCALE_TOL)) {
                return { ok: false, reason: 'that edit scales the collision, which this editor does not write. Move and rotate only.' }
            }
        }

        const out = bound.m.slice()
        for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14]) {
            out[i] = round4(m[i])
        }
        return {
            ok: true,
            edits: [{ kind: 'boundMatrix', bi, m: out }],
            after: {
                m: out,
                pos: [round3(out[12]), round3(out[13]), round3(out[14])]
            }
        }
    }

    function shiftAll(ins, delta) {
        if (!ins || !ins.bounds || !ins.bounds.length) {
            return { ok: false, reason: 'this collision has no bounds to move, run a fresh scan first' }
        }
        const d = Array.isArray(delta) ? delta.map(Number) : null
        if (!d || d.length !== 3 || d.some(v => !Number.isFinite(v))) {
            return { ok: false, reason: 'the move data is incomplete' }
        }
        if (d.every(v => Math.abs(v) < 0.0005)) {
            return { ok: false, reason: 'nothing moved' }
        }
        if (d.some(v => Math.abs(v) > LIMIT)) {
            return { ok: false, reason: 'that move is too far' }
        }
        if (!ins.composite) {
            const c = ins.root.center
            if (c.some((v, i) => Math.abs(v + d[i]) > LIMIT)) {
                return { ok: false, reason: 'that puts the collision outside the world bounds' }
            }
            return { ok: true, edits: [{ kind: 'boundShift', d: d.map(round4) }], after: { delta: d.map(round3) } }
        }
        const edits = []
        for (const b of ins.bounds) {
            if (!b.m) continue
            const out = b.m.slice()
            out[12] = round4(out[12] + d[0])
            out[13] = round4(out[13] + d[1])
            out[14] = round4(out[14] + d[2])
            if (Math.abs(out[12]) > LIMIT || Math.abs(out[13]) > LIMIT || Math.abs(out[14]) > LIMIT) {
                return { ok: false, reason: 'that puts the collision outside the world bounds' }
            }
            edits.push({ kind: 'boundMatrix', bi: b.bi, m: out })
        }
        if (!edits.length) {
            return { ok: false, reason: 'these bounds carry no transform, so they cannot be moved' }
        }
        return { ok: true, edits, after: { delta: d.map(round3) } }
    }

    const RANGE = {
        type: [0, KKCT.collmats.NAMES.length - 1],
        flags: [0, 0xffff],
        procId: [0, 255],
        roomId: [0, 31],
        pedDensity: [0, 7],
        colorIndex: [0, 255]
    }

    function material(ins, bi, slot, next) {
        const bound = boundOf(ins, bi)
        if (!bound) {
            return { ok: false, reason: 'that bound was not found, run a fresh scan first' }
        }
        const mat = bound.mats.find(m => m.slot === slot)
        if (!mat) {
            return { ok: false, reason: 'that material slot was not found, run a fresh scan first' }
        }
        const supplied = {}
        let changed = 0
        for (const [key, [lo, hi]] of Object.entries(RANGE)) {
            if (!(key in (next || {}))) continue
            const v = Number(next[key])
            if (!finite(v) || v < lo || v > hi || v !== Math.floor(v)) {
                return { ok: false, reason: `${key} must be a whole number between ${lo} and ${hi}` }
            }
            supplied[key] = v
            changed++
        }
        if (!changed) {
            return { ok: false, reason: 'nothing to change on that material' }
        }
        const edit = { kind: 'boundMaterial', bi, slot }
        for (const key of Object.keys(RANGE)) {
            edit[key] = key in supplied ? supplied[key] : (mat[key] ?? 0)
        }
        const after = { ...mat, ...supplied }
        after.name = KKCT.collmats.name(after.type)
        return { ok: true, edits: [edit], after }
    }

    const MAT_FIELDS = ['type', 'procId', 'roomId', 'pedDensity', 'flags', 'colorIndex']

    const sameMat = (a, b) => MAT_FIELDS.every(k => (a[k] ?? 0) === (b[k] ?? 0))

    function assignFaces(ins, usage, bi, polys, want) {
        const bound = boundOf(ins, bi)
        if (!bound) {
            return { ok: false, reason: 'that bound was not found, run a fresh scan first' }
        }
        if (!usage) {
            return { ok: false, reason: 'this bound has no per face material data, so faces cannot be painted' }
        }
        if (!Array.isArray(polys) || !polys.length) {
            return { ok: false, reason: 'no faces are selected' }
        }
        const picked = []
        const seen = new Set()
        for (const p of polys) {
            const v = Number(p)
            if (!Number.isInteger(v) || v < 0 || v >= usage.polyCount || seen.has(v)) continue
            seen.add(v)
            picked.push(v)
        }
        if (!picked.length) {
            return { ok: false, reason: 'none of those faces are in this bound, run a fresh scan first' }
        }
        const type = Number(want.type)
        if (!finite(type) || type < 0 || type > RANGE.type[1] || type !== Math.floor(type)) {
            return { ok: false, reason: `surface must be a whole number between 0 and ${RANGE.type[1]}` }
        }
        const base = bound.mats.find(m => m.slot === usage.slotOf[picked[0]]) || bound.mats[0] || {}
        const target = {}
        for (const k of MAT_FIELDS) target[k] = base[k] ?? 0
        target.type = type
        if (want.flags !== undefined) {
            const f = Number(want.flags)
            if (!finite(f) || f < 0 || f > 0xffff || f !== Math.floor(f)) {
                return { ok: false, reason: 'flags must be a whole number between 0 and 65535' }
            }
            target.flags = f
        }

        const exact = bound.mats.find(m => m.slot >= 0 && sameMat(m, target))
        if (exact) {
            if (picked.every(p => usage.slotOf[p] === exact.slot)) {
                return { ok: false, reason: `those faces are already ${KKCT.collmats.name(type)}` }
            }
            return {
                ok: true,
                edits: [{ kind: 'faceMaterial', bi, slot: exact.slot, polys: picked }],
                after: { slot: exact.slot, name: KKCT.collmats.name(type), faces: picked.length, mode: 'reused' }
            }
        }

        const selectedPer = new Array(usage.matCount).fill(0)
        for (const p of picked) {
            const s = usage.slotOf[p]
            if (s < usage.matCount) selectedPer[s]++
        }
        let retype = -1
        for (let s = 0; s < usage.matCount; s++) {
            if (usage.counts[s] > 0 && selectedPer[s] === usage.counts[s]) {
                if (retype < 0 || usage.counts[s] > usage.counts[retype]) retype = s
            }
        }
        if (retype >= 0) {
            const edits = [{ kind: 'boundMaterial', bi, slot: retype, ...target }]
            if (picked.some(p => usage.slotOf[p] !== retype)) {
                edits.push({ kind: 'faceMaterial', bi, slot: retype, polys: picked })
            }
            return {
                ok: true,
                edits,
                after: { slot: retype, name: KKCT.collmats.name(type), faces: picked.length, mode: 'retyped' }
            }
        }

        let free = -1
        for (let s = 0; s < usage.matCount; s++) {
            if (usage.counts[s] === 0) {
                free = s
                break
            }
        }
        if (free >= 0) {
            return {
                ok: true,
                edits: [
                    { kind: 'boundMaterial', bi, slot: free, ...target },
                    { kind: 'faceMaterial', bi, slot: free, polys: picked }
                ],
                after: { slot: free, name: KKCT.collmats.name(type), faces: picked.length, mode: 'freed' }
            }
        }

        if (usage.room && usage.matCount < 255) {
            const slot = usage.matCount
            return {
                ok: true,
                edits: [
                    { kind: 'addMaterial', bi, slot, ...target },
                    { kind: 'faceMaterial', bi, slot, polys: picked }
                ],
                after: { slot, name: KKCT.collmats.name(type), faces: picked.length, mode: 'added' }
            }
        }

        let smallest = null
        for (let s = 0; s < usage.matCount; s++) {
            if (usage.counts[s] > 0 && (smallest === null || usage.counts[s] < usage.counts[smallest])) smallest = s
        }
        const hint = smallest === null
            ? ''
            : ` The smallest is ${bound.mats.find(m => m.slot === smallest)?.name ?? 'one surface'} at ${usage.counts[smallest]} ${usage.counts[smallest] === 1 ? 'face' : 'faces'}, so selecting all of that one and retyping it frees a slot.`
        return {
            ok: false,
            reason: `this bound holds ${usage.matCount} surfaces, all of them in use, and the file has no room for another.${hint}`
        }
    }

    function moveFaces(ins, can, bi, polys, m) {
        const bound = boundOf(ins, bi)
        if (!bound) {
            return { ok: false, reason: 'that bound was not found, run a fresh scan first' }
        }
        if (!can || !can.ok) {
            return { ok: false, reason: can ? can.reason : 'that bound cannot be moved' }
        }
        if (!Array.isArray(polys) || !polys.length) {
            return { ok: false, reason: 'no faces are selected' }
        }
        const mat = Array.isArray(m) ? m.map(Number) : null
        if (!mat || mat.length !== 16 || mat.some(v => !Number.isFinite(v))) {
            return { ok: false, reason: 'the move data is incomplete' }
        }
        for (const row of [0, 4, 8]) {
            const len = rowLength(mat, row)
            if (!(len > 1 - SCALE_TOL && len < 1 + SCALE_TOL)) {
                return { ok: false, reason: 'that edit scales the faces, which this editor does not write. Move and rotate only.' }
            }
        }
        for (const t of [mat[12], mat[13], mat[14]]) {
            if (Math.abs(t) > LIMIT * 2) {
                return { ok: false, reason: 'that move is too far' }
            }
        }
        const picked = [...new Set(polys.map(Number).filter(Number.isInteger))]
        if (!picked.length) {
            return { ok: false, reason: 'no faces are selected' }
        }
        return {
            ok: true,
            edits: [{ kind: 'moveVerts', bi, polys: picked, m: mat.map(round4) }],
            after: { faces: picked.length }
        }
    }

    const PROBE_EPS = 0.05
    const PROBE_CELL = 0.5

    function centroidGrid(tris) {
        const g = new Map()
        for (let i = 0; i + 8 < tris.length; i += 9) {
            const cx = (tris[i] + tris[i + 3] + tris[i + 6]) / 3
            const cy = (tris[i + 1] + tris[i + 4] + tris[i + 7]) / 3
            const cz = (tris[i + 2] + tris[i + 5] + tris[i + 8]) / 3
            const k = `${Math.floor(cx / PROBE_CELL)}_${Math.floor(cy / PROBE_CELL)}_${Math.floor(cz / PROBE_CELL)}`
            let b = g.get(k)
            if (!b) {
                b = []
                g.set(k, b)
            }
            b.push(cx, cy, cz)
        }
        return g
    }

    function gridHas(g, x, y, z) {
        const gx = Math.floor(x / PROBE_CELL)
        const gy = Math.floor(y / PROBE_CELL)
        const gz = Math.floor(z / PROBE_CELL)
        for (let ax = -1; ax <= 1; ax++) {
            for (let ay = -1; ay <= 1; ay++) {
                for (let az = -1; az <= 1; az++) {
                    const b = g.get(`${gx + ax}_${gy + ay}_${gz + az}`)
                    if (!b) continue
                    for (let i = 0; i < b.length; i += 3) {
                        const dx = b[i] - x
                        const dy = b[i + 1] - y
                        const dz = b[i + 2] - z
                        if (dx * dx + dy * dy + dz * dz <= PROBE_EPS * PROBE_EPS) return true
                    }
                }
            }
        }
        return false
    }

    function probeSets(copies, maxPerCopy) {
        const cap = maxPerCopy || 60
        const grids = copies.map(c => centroidGrid(c.tris))
        const out = []
        for (let ci = 0; ci < copies.length; ci++) {
            const { resource, tris } = copies[ci]
            const unique = []
            for (let i = 0; i + 8 < tris.length; i += 9) {
                const cx = (tris[i] + tris[i + 3] + tris[i + 6]) / 3
                const cy = (tris[i + 1] + tris[i + 4] + tris[i + 7]) / 3
                const cz = (tris[i + 2] + tris[i + 5] + tris[i + 8]) / 3
                let shared = false
                for (let oi = 0; oi < grids.length && !shared; oi++) {
                    if (oi === ci) continue
                    if (gridHas(grids[oi], cx, cy, cz)) shared = true
                }
                if (shared) continue
                const ux = tris[i + 3] - tris[i]
                const uy = tris[i + 4] - tris[i + 1]
                const uz = tris[i + 5] - tris[i + 2]
                const vx = tris[i + 6] - tris[i]
                const vy = tris[i + 7] - tris[i + 1]
                const vz = tris[i + 8] - tris[i + 2]
                const nx = uy * vz - uz * vy
                const ny = uz * vx - ux * vz
                const nz = ux * vy - uy * vx
                const nl = Math.hypot(nx, ny, nz)
                if (!(nl > 1e-6)) continue
                unique.push({ c: [round3(cx), round3(cy), round3(cz)], n: [round4(nx / nl), round4(ny / nl), round4(nz / nl)] })
            }
            const points = []
            if (unique.length) {
                const step = unique.length / Math.min(cap, unique.length)
                for (let k = 0; k < Math.min(cap, unique.length); k++) {
                    points.push(unique[Math.floor(k * step)])
                }
            }
            out.push({ resource, unique: unique.length, total: Math.floor(tris.length / 9), points })
        }
        return out
    }

    return { transform, shiftAll, material, assignFaces, moveFaces, probeSets }
})()
})()
