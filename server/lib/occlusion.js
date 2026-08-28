(() => {
globalThis.KKCT = globalThis.KKCT || {}

KKCT.occlusion = (() => {
    const MIN_HALF = 0.25
    const MARGIN = 0.5
    const MAX_WASTE = 0.1
    const TOUCH_EPS = 0.3
    const AXIS_NAME = ['length', 'width', 'height']

    function half(box) {
        return [(box.l || 0) / 2, (box.w || 0) / 2, (box.h || 0) / 2]
    }

    function staleBox(list) {
        return list.some(b => !b || typeof b.bi !== 'number')
    }

    function sameRotation(a, b) {
        return Math.abs((a.cz ?? 1) - (b.cz ?? 1)) <= 0.01 && Math.abs((a.sz ?? 0) - (b.sz ?? 0)) <= 0.01
    }

    function toLocal(origin, cz, sz, box) {
        const dx = box.c[0] - origin[0]
        const dy = box.c[1] - origin[1]
        return [dx * cz + dy * sz, -dx * sz + dy * cz, box.c[2] - origin[2]]
    }

    function toWorld(origin, cz, sz, local) {
        return [
            origin[0] + local[0] * cz - local[1] * sz,
            origin[1] + local[0] * sz + local[1] * cz,
            origin[2] + local[2]
        ]
    }

    function spansOf(local, h) {
        return [
            [local[0] - h[0], local[0] + h[0]],
            [local[1] - h[1], local[1] + h[1]],
            [local[2] - h[2], local[2] + h[2]]
        ]
    }

    function overlapDepth(sa, sb) {
        const d = []
        for (let i = 0; i < 3; i++) {
            d.push(Math.min(sa[i][1], sb[i][1]) - Math.max(sa[i][0], sb[i][0]))
        }
        return d
    }

    function boxFields(world, sizes) {
        return {
            iCenterX: Math.round(world[0] * 4),
            iCenterY: Math.round(world[1] * 4),
            iCenterZ: Math.round(world[2] * 4),
            iLength: Math.round(sizes[0] * 4),
            iWidth: Math.round(sizes[1] * 4),
            iHeight: Math.round(sizes[2] * 4)
        }
    }

    function fitsFormat(fields) {
        return Object.values(fields).every(v => v >= -32768 && v <= 32767)
    }

    function afterOf(world, sizes) {
        return {
            c: [Math.round(world[0] * 1000) / 1000, Math.round(world[1] * 1000) / 1000, Math.round(world[2] * 1000) / 1000],
            l: Math.round(sizes[0] * 1000) / 1000,
            w: Math.round(sizes[1] * 1000) / 1000,
            h: Math.round(sizes[2] * 1000) / 1000
        }
    }

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
        if (staleBox([box])) {
            return { ok: false, reason: 'this scan predates the current version, run a fresh scan first' }
        }
        return { ok: true, ...zeroEdit(box) }
    }

    function isGone(box) {
        return (box.l || 0) === 0 && (box.w || 0) === 0 && (box.h || 0) === 0
    }

    function clip(boxes, targetIdx) {
        if (!Array.isArray(boxes) || boxes.length < 2) return { ok: false, reason: 'missing occluder data' }
        if (staleBox(boxes)) {
            return { ok: false, reason: 'this scan predates the current version, run a fresh scan first' }
        }
        const victim = boxes[targetIdx]
        if (!victim) return { ok: false, reason: 'no target picked' }
        const cz = victim.cz ?? 1
        const sz = victim.sz ?? 0
        const origin = victim.c

        let spans = spansOf([0, 0, 0], half(victim))
        const axesTouched = new Set()
        let clipped = 0

        for (let i = 0; i < boxes.length; i++) {
            if (i === targetIdx) continue
            const other = boxes[i]
            if (isGone(other)) continue
            const os = spansOf(toLocal(origin, cz, sz, other), half(other))
            const ov = overlapDepth(spans, os)
            if (ov[0] <= 0 || ov[1] <= 0 || ov[2] <= 0) continue
            if (!sameRotation(victim, other)) {
                return { ok: false, reason: `the ${other.resource || 'other'} occluder is rotated differently, shrinking cannot clear that overlap` }
            }

            let k = 0
            for (let ax = 1; ax < 3; ax++) {
                if (ov[ax] < ov[k]) k = ax
            }
            const center = (spans[k][0] + spans[k][1]) / 2
            const oCenter = (os[k][0] + os[k][1]) / 2
            const next = [spans[k][0], spans[k][1]]
            if (oCenter >= center) next[1] = os[k][0] - MARGIN
            else next[0] = os[k][1] + MARGIN
            if ((next[1] - next[0]) / 2 < MIN_HALF) {
                return { ok: false, reason: `shrinking would leave almost nothing on the ${AXIS_NAME[k]} axis, remove one of them instead` }
            }
            spans = spans.map((s, ax) => (ax === k ? next : s))
            axesTouched.add(AXIS_NAME[k])
            clipped++
        }

        if (!clipped) return { ok: false, reason: 'these do not actually intersect, nothing to shrink' }

        const localC = [
            (spans[0][0] + spans[0][1]) / 2,
            (spans[1][0] + spans[1][1]) / 2,
            (spans[2][0] + spans[2][1]) / 2
        ]
        const sizes = [spans[0][1] - spans[0][0], spans[1][1] - spans[1][0], spans[2][1] - spans[2][0]]
        const world = toWorld(origin, cz, sz, localC)
        const fields = boxFields(world, sizes)
        if (!fitsFormat(fields)) {
            return { ok: false, reason: 'the shrunk box does not fit the file format' }
        }

        return {
            ok: true,
            axis: [...axesTouched].join(' and '),
            cleared: clipped,
            index: victim.bi,
            before: { c: victim.c, l: victim.l, w: victim.w, h: victim.h },
            after: afterOf(world, sizes),
            fields
        }
    }

    function transform(box, next) {
        if (!box) return { ok: false, reason: 'missing occluder data' }
        if (staleBox([box])) {
            return { ok: false, reason: 'this scan predates the current version, run a fresh scan first' }
        }
        if (!next || !Array.isArray(next.c) || next.c.length !== 3) {
            return { ok: false, reason: 'the edit data is incomplete' }
        }
        const world = next.c.map(Number)
        const sizes = [Number(next.l), Number(next.w), Number(next.h)]
        if (world.some(v => !Number.isFinite(v)) || sizes.some(v => !Number.isFinite(v))) {
            return { ok: false, reason: 'the edit data is incomplete' }
        }
        if (sizes.some(v => v / 2 < MIN_HALF)) {
            return { ok: false, reason: 'that box is too thin, keep every side at half a meter or more' }
        }
        let cz = Number(next.cz ?? 1)
        let sz = Number(next.sz ?? 0)
        const m = Math.hypot(cz, sz)
        if (!Number.isFinite(m) || m < 0.001) {
            cz = 1
            sz = 0
        } else {
            cz /= m
            sz /= m
        }
        const fields = {
            ...boxFields(world, sizes),
            iSinZ: Math.round(cz * 0.5 * 32767),
            iCosZ: Math.round(sz * 0.5 * 32767)
        }
        if (!fitsFormat(fields)) {
            return { ok: false, reason: 'the edited box does not fit the file format, it is too large or too far out' }
        }
        return {
            ok: true,
            index: box.bi,
            fields,
            after: {
                ...afterOf(world, sizes),
                cz: Math.round(cz * 1000) / 1000,
                sz: Math.round(sz * 1000) / 1000
            }
        }
    }

    function unionVolume(spansList, uMin, uMax) {
        const grids = [0, 1, 2].map(ax => {
            const vals = []
            for (const s of spansList) {
                vals.push(Math.max(uMin[ax], Math.min(uMax[ax], s[ax][0])))
                vals.push(Math.max(uMin[ax], Math.min(uMax[ax], s[ax][1])))
            }
            return [...new Set(vals)].sort((x, y) => x - y)
        })
        let covered = 0
        for (let xi = 0; xi < grids[0].length - 1; xi++) {
            const x = (grids[0][xi] + grids[0][xi + 1]) / 2
            const dx = grids[0][xi + 1] - grids[0][xi]
            if (dx <= 0) continue
            for (let yi = 0; yi < grids[1].length - 1; yi++) {
                const y = (grids[1][yi] + grids[1][yi + 1]) / 2
                const dy = grids[1][yi + 1] - grids[1][yi]
                if (dy <= 0) continue
                for (let zi = 0; zi < grids[2].length - 1; zi++) {
                    const z = (grids[2][zi] + grids[2][zi + 1]) / 2
                    const dz = grids[2][zi + 1] - grids[2][zi]
                    if (dz <= 0) continue
                    for (const s of spansList) {
                        if (x > s[0][0] && x < s[0][1] && y > s[1][0] && y < s[1][1] && z > s[2][0] && z < s[2][1]) {
                            covered += dx * dy * dz
                            break
                        }
                    }
                }
            }
        }
        return covered
    }

    function merge(boxes) {
        if (!Array.isArray(boxes) || boxes.length < 2) return { ok: false, reason: 'missing occluder data' }
        if (staleBox(boxes)) {
            return { ok: false, reason: 'this scan predates the current version, run a fresh scan first' }
        }
        const live = []
        for (let i = 0; i < boxes.length; i++) {
            if (!isGone(boxes[i])) live.push({ box: boxes[i], i })
        }
        if (live.length < 2) return { ok: false, reason: 'fewer than two occluders are left here' }

        const base = live[0].box
        for (const e of live) {
            if (!sameRotation(base, e.box)) {
                return { ok: false, reason: 'these occluders are rotated differently, their union is not a box' }
            }
        }
        const cz = base.cz ?? 1
        const sz = base.sz ?? 0
        const origin = base.c

        const spansList = live.map(e => spansOf(toLocal(origin, cz, sz, e.box), half(e.box)))

        for (let i = 0; i < spansList.length; i++) {
            let touches = false
            for (let j = 0; j < spansList.length; j++) {
                if (i === j) continue
                const ov = overlapDepth(spansList[i], spansList[j])
                if (ov[0] >= -TOUCH_EPS && ov[1] >= -TOUCH_EPS && ov[2] >= -TOUCH_EPS) {
                    touches = true
                    break
                }
            }
            if (!touches) {
                return { ok: false, reason: `the ${live[i].box.resource || 'detached'} occluder does not touch the others, merging would occlude the gap` }
            }
        }

        const uMin = [Infinity, Infinity, Infinity]
        const uMax = [-Infinity, -Infinity, -Infinity]
        for (const s of spansList) {
            for (let ax = 0; ax < 3; ax++) {
                uMin[ax] = Math.min(uMin[ax], s[ax][0])
                uMax[ax] = Math.max(uMax[ax], s[ax][1])
            }
        }

        let winnerIdx = 0
        let winnerVol = -1
        for (let i = 0; i < live.length; i++) {
            const b = live[i].box
            const vol = b.l * b.w * b.h
            if (vol > winnerVol) {
                winnerVol = vol
                winnerIdx = i
            }
        }

        const wSpans = spansList[winnerIdx]
        const allInsideWinner = spansList.every((s, i) => {
            if (i === winnerIdx) return true
            for (let ax = 0; ax < 3; ax++) {
                if (s[ax][0] < wSpans[ax][0] - 0.01 || s[ax][1] > wSpans[ax][1] + 0.01) return false
            }
            return true
        })

        const zeroed = live.filter((_, i) => i !== winnerIdx).map(e => ({ boxIndex: e.i, ...zeroEdit(e.box) }))

        if (allInsideWinner) {
            return { ok: true, mode: 'contained', expand: null, zeroed, waste: 0 }
        }

        const unionVol = (uMax[0] - uMin[0]) * (uMax[1] - uMin[1]) * (uMax[2] - uMin[2])
        const covered = unionVolume(spansList, uMin, uMax)
        const waste = unionVol > 0 ? (unionVol - covered) / unionVol : 1
        if (waste > MAX_WASTE) {
            return { ok: false, reason: `their union is not box shaped, a merged box would occlude ${Math.round(waste * 100)}% empty space and hide geometry it should not` }
        }

        const localC = [(uMin[0] + uMax[0]) / 2, (uMin[1] + uMax[1]) / 2, (uMin[2] + uMax[2]) / 2]
        const sizes = [uMax[0] - uMin[0], uMax[1] - uMin[1], uMax[2] - uMin[2]]
        const world = toWorld(origin, cz, sz, localC)
        const fields = boxFields(world, sizes)
        if (!fitsFormat(fields)) {
            return { ok: false, reason: 'the merged box does not fit the file format, it is too large or too far out' }
        }

        const winner = live[winnerIdx]
        return {
            ok: true,
            mode: 'union',
            waste: Math.round(waste * 1000) / 1000,
            expand: {
                boxIndex: winner.i,
                index: winner.box.bi,
                fields,
                after: afterOf(world, sizes)
            },
            zeroed
        }
    }

    return { clip, merge, zero, transform }
})()
})()
