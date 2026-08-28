(() => {
globalThis.KKCT = globalThis.KKCT || {}

KKCT.occlusion = (() => {
    const MIN_HALF = 0.25
    const MARGIN = 0.5
    const AXIS_FIELD = ['iLength', 'iWidth', 'iHeight']
    const AXIS_NAME = ['length', 'width', 'height']

    function half(box) {
        return [(box.l || 0) / 2, (box.w || 0) / 2, (box.h || 0) / 2]
    }

    function clip(a, b, target) {
        if (!a || !b) return { ok: false, reason: 'missing occluder data' }
        if (target !== 'a' && target !== 'b') return { ok: false, reason: 'no target picked' }
        if (typeof a.bi !== 'number' || typeof b.bi !== 'number') {
            return { ok: false, reason: 'this scan predates the current version, run a fresh scan first' }
        }
        const cz = a.cz ?? 1
        const sz = a.sz ?? 0
        if (Math.abs(cz - (b.cz ?? 1)) > 0.01 || Math.abs(sz - (b.sz ?? 0)) > 0.01) {
            return { ok: false, reason: 'the two occluders are rotated differently, shrinking one cannot clear the overlap' }
        }

        const dx = b.c[0] - a.c[0]
        const dy = b.c[1] - a.c[1]
        const local = [dx * cz + dy * sz, -dx * sz + dy * cz, b.c[2] - a.c[2]]
        const ah = half(a)
        const bh = half(b)

        const overlap = [
            ah[0] + bh[0] - Math.abs(local[0]),
            ah[1] + bh[1] - Math.abs(local[1]),
            ah[2] + bh[2] - Math.abs(local[2])
        ]
        if (overlap[0] <= 0 || overlap[1] <= 0 || overlap[2] <= 0) {
            return { ok: false, reason: 'these two do not actually intersect, nothing to shrink' }
        }

        let k = 0
        for (let i = 1; i < 3; i++) {
            if (overlap[i] < overlap[k]) k = i
        }

        const keeper = target === 'a' ? b : a
        const keeperHalf = target === 'a' ? bh : ah
        const victimHalf = target === 'a' ? ah : bh
        const victimLocal = target === 'a' ? [0, 0, 0] : local
        const keeperLocal = target === 'a' ? local : [0, 0, 0]

        const vMin = victimLocal[k] - victimHalf[k]
        const vMax = victimLocal[k] + victimHalf[k]
        const kMin = keeperLocal[k] - keeperHalf[k]
        const kMax = keeperLocal[k] + keeperHalf[k]

        let newMin = vMin
        let newMax = vMax
        if (keeperLocal[k] >= victimLocal[k]) newMax = kMin - MARGIN
        else newMin = kMax + MARGIN

        const newHalf = (newMax - newMin) / 2
        if (newHalf < MIN_HALF) {
            return { ok: false, reason: `shrinking would leave almost nothing on the ${AXIS_NAME[k]} axis, remove one of them instead` }
        }

        const newLocal = [...victimLocal]
        newLocal[k] = (newMax + newMin) / 2

        const worldX = a.c[0] + newLocal[0] * cz - newLocal[1] * sz
        const worldY = a.c[1] + newLocal[0] * sz + newLocal[1] * cz
        const worldZ = a.c[2] + newLocal[2]

        const victim = target === 'a' ? a : b
        const fields = {
            iCenterX: Math.round(worldX * 4),
            iCenterY: Math.round(worldY * 4),
            iCenterZ: Math.round(worldZ * 4)
        }
        fields[AXIS_FIELD[k]] = Math.round(newHalf * 2 * 4)

        return {
            ok: true,
            axis: AXIS_NAME[k],
            overlap: Math.round(overlap[k] * 100) / 100,
            index: victim.bi,
            before: { c: victim.c, l: victim.l, w: victim.w, h: victim.h },
            after: {
                c: [Math.round(worldX * 1000) / 1000, Math.round(worldY * 1000) / 1000, Math.round(worldZ * 1000) / 1000],
                l: k === 0 ? Math.round(newHalf * 2 * 1000) / 1000 : victim.l,
                w: k === 1 ? Math.round(newHalf * 2 * 1000) / 1000 : victim.w,
                h: k === 2 ? Math.round(newHalf * 2 * 1000) / 1000 : victim.h
            },
            fields
        }
    }

    const MAX_WASTE = 0.1
    const TOUCH_EPS = 0.3

    function zeroEdit(box) {
        return {
            index: box.bi,
            fields: {
                iCenterX: Math.round(box.c[0] * 4),
                iCenterY: Math.round(box.c[1] * 4),
                iCenterZ: Math.round(box.c[2] * 4),
                iLength: 0,
                iWidth: 0,
                iHeight: 0
            },
            after: { c: box.c, l: 0, w: 0, h: 0 }
        }
    }

    function zero(box) {
        if (!box) return { ok: false, reason: 'missing occluder data' }
        if (typeof box.bi !== 'number') {
            return { ok: false, reason: 'this scan predates the current version, run a fresh scan first' }
        }
        return { ok: true, ...zeroEdit(box) }
    }

    function merge(a, b) {
        if (!a || !b) return { ok: false, reason: 'missing occluder data' }
        if (typeof a.bi !== 'number' || typeof b.bi !== 'number') {
            return { ok: false, reason: 'this scan predates the current version, run a fresh scan first' }
        }
        const cz = a.cz ?? 1
        const sz = a.sz ?? 0
        if (Math.abs(cz - (b.cz ?? 1)) > 0.01 || Math.abs(sz - (b.sz ?? 0)) > 0.01) {
            return { ok: false, reason: 'the two occluders are rotated differently, their union is not a box' }
        }

        const dx = b.c[0] - a.c[0]
        const dy = b.c[1] - a.c[1]
        const local = [dx * cz + dy * sz, -dx * sz + dy * cz, b.c[2] - a.c[2]]
        const ah = half(a)
        const bh = half(b)

        const uMin = []
        const uMax = []
        let interVol = 1
        let touching = true
        let aInB = true
        let bInA = true
        for (let i = 0; i < 3; i++) {
            const aMin = -ah[i]
            const aMax = ah[i]
            const bMin = local[i] - bh[i]
            const bMax = local[i] + bh[i]
            uMin.push(Math.min(aMin, bMin))
            uMax.push(Math.max(aMax, bMax))
            const inter = Math.min(aMax, bMax) - Math.max(aMin, bMin)
            if (inter < -TOUCH_EPS) touching = false
            interVol *= Math.max(inter, 0)
            if (aMin < bMin - 0.01 || aMax > bMax + 0.01) aInB = false
            if (bMin < aMin - 0.01 || bMax > aMax + 0.01) bInA = false
        }
        if (!touching) {
            return { ok: false, reason: 'these two do not touch, merging them would occlude the gap between them' }
        }

        const volA = a.l * a.w * a.h
        const volB = b.l * b.w * b.h

        if (bInA) {
            return { ok: true, mode: 'contained', expand: null, zero: { box: 'b', ...zeroEdit(b) }, waste: 0 }
        }
        if (aInB) {
            return { ok: true, mode: 'contained', expand: null, zero: { box: 'a', ...zeroEdit(a) }, waste: 0 }
        }

        const unionVol = (uMax[0] - uMin[0]) * (uMax[1] - uMin[1]) * (uMax[2] - uMin[2])
        const covered = volA + volB - interVol
        const waste = unionVol > 0 ? (unionVol - covered) / unionVol : 1
        if (waste > MAX_WASTE) {
            return { ok: false, reason: `their union is not box shaped, a merged box would occlude ${Math.round(waste * 100)}% empty space and hide geometry it should not` }
        }

        const winner = volA >= volB ? 'a' : 'b'
        const wBox = winner === 'a' ? a : b
        const lBox = winner === 'a' ? b : a
        const cLocal = [(uMin[0] + uMax[0]) / 2, (uMin[1] + uMax[1]) / 2, (uMin[2] + uMax[2]) / 2]
        const worldX = a.c[0] + cLocal[0] * cz - cLocal[1] * sz
        const worldY = a.c[1] + cLocal[0] * sz + cLocal[1] * cz
        const worldZ = a.c[2] + cLocal[2]
        const sizes = [uMax[0] - uMin[0], uMax[1] - uMin[1], uMax[2] - uMin[2]]

        const fields = {
            iCenterX: Math.round(worldX * 4),
            iCenterY: Math.round(worldY * 4),
            iCenterZ: Math.round(worldZ * 4),
            iLength: Math.round(sizes[0] * 4),
            iWidth: Math.round(sizes[1] * 4),
            iHeight: Math.round(sizes[2] * 4)
        }
        for (const v of Object.values(fields)) {
            if (v < -32768 || v > 32767) {
                return { ok: false, reason: 'the merged box does not fit the file format, it is too large or too far out' }
            }
        }

        return {
            ok: true,
            mode: 'union',
            waste: Math.round(waste * 1000) / 1000,
            expand: {
                box: winner,
                index: wBox.bi ?? 0,
                fields,
                after: {
                    c: [Math.round(worldX * 1000) / 1000, Math.round(worldY * 1000) / 1000, Math.round(worldZ * 1000) / 1000],
                    l: Math.round(sizes[0] * 1000) / 1000,
                    w: Math.round(sizes[1] * 1000) / 1000,
                    h: Math.round(sizes[2] * 1000) / 1000
                }
            },
            zero: { box: winner === 'a' ? 'b' : 'a', ...zeroEdit(lBox) }
        }
    }

    return { clip, merge, zero }
})()
})()
