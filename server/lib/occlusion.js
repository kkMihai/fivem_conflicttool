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
            index: victim.bi ?? victim.idx ?? 0,
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

    return { clip }
})()
})()
