(() => {
globalThis.KKCT = globalThis.KKCT || {}

KKCT.mergevote = (() => {
    const GONE = {}
    const EMPTY = new Map()

    function row(pick, result, conflict, unresolved) {
        return { pick, result, conflict, unresolved }
    }

    function latestState(states, state) {
        for (let i = states.length - 1; i >= 0; i--) {
            const item = states[i].item
            const current = !item || item.gone ? GONE : item.sig
            if (current === state) return states[i].copy
        }
        return -1
    }

    function distinctSigs(holders) {
        return new Set(holders.map(s => s.item.sig)).size
    }

    function identical(states) {
        const first = states[0].item
        if (!first || first.gone) return false
        for (const s of states) {
            if (!s.item || s.item.sig !== first.sig || !s.item.gone !== !first.gone) return false
        }
        return true
    }

    function union(states, holders) {
        const present = holders.filter(s => !s.item.gone)
        if (!present.length) return row(latestState(states, GONE), 'removed', false, false)
        const top = present[present.length - 1]
        const conflict = distinctSigs(present) > 1
        const lacking = holders.length < states.length
        const result = conflict ? 'changed' : lacking || present.length < holders.length ? 'added' : 'kept'
        return row(top.copy, result, conflict, conflict || lacking)
    }

    function threeWay(states, holders) {
        const n = states.length
        const counts = new Map()
        for (const s of states) {
            const state = !s.item || s.item.gone ? GONE : s.item.sig
            counts.set(state, (counts.get(state) || 0) + 1)
        }
        let chosen = GONE
        let majority = false
        for (const [state, count] of counts) {
            if (count * 2 > n) {
                chosen = state
                majority = true
                break
            }
        }
        if (!majority) {
            const winner = states[n - 1]
            chosen = !winner.item || winner.item.gone ? GONE : winner.item.sig
        }
        const conflict = !majority && counts.size > 1
        if (chosen === GONE) return row(latestState(states, GONE), 'removed', conflict, conflict)
        const presentSigs = new Set(holders.filter(s => !s.item.gone).map(s => s.item.sig))
        const result = counts.size === 1 ? 'kept' : presentSigs.size > 1 ? 'changed' : 'added'
        return row(latestState(states, chosen), result, conflict, conflict)
    }

    function run(opts) {
        const views = (opts && opts.views) || []
        const flags = (opts && opts.voters) || []
        const policy = opts && opts.policy === 'union' ? 'union' : 'three-way'
        const viewOf = i => views[i] || EMPTY
        const voters = []
        for (let i = 0; i < views.length; i++) {
            if (flags[i] !== false) voters.push(i)
        }
        const effective = policy === 'union' || voters.length < 3 ? 'union' : 'three-way'

        const held = new Map()
        for (const i of voters) {
            for (const [key, item] of viewOf(i)) {
                if (item) held.set(key, (held.get(key) || 0) + 1)
            }
        }

        const rows = new Map()
        const totals = { merged: 0, added: 0, removed: 0, changed: 0, conflicts: 0, unresolved: 0 }
        for (const key of held.keys()) {
            const states = voters.map(i => ({ copy: i, item: viewOf(i).get(key) }))
            const holders = states.filter(s => s.item)
            let r
            if (identical(states)) r = row(states[states.length - 1].copy, 'kept', false, false)
            else if (effective === 'union') r = union(states, holders)
            else r = threeWay(states, holders)
            rows.set(key, r)
            if (r.result === 'removed') totals.removed++
            else totals.merged++
            if (r.result === 'added') totals.added++
            if (r.result === 'changed') totals.changed++
            if (r.conflict) totals.conflicts++
            if (r.unresolved) totals.unresolved++
        }

        const perCopy = []
        for (let i = 0; i < views.length; i++) {
            const own = flags[i] !== false ? 1 : 0
            const stats = { total: 0, shared: 0, onlyHere: 0, removed: 0, lost: 0 }
            for (const [key, item] of viewOf(i)) {
                if (!item) continue
                stats.total++
                const count = held.get(key) || 0
                if (voters.length && count === voters.length) stats.shared++
                if (count === own) stats.onlyHere++
                const r = rows.get(key)
                if (!r) continue
                if (r.result === 'removed') {
                    if (!item.gone) stats.removed++
                } else if (r.pick >= 0 && viewOf(r.pick).get(key).sig !== item.sig) {
                    stats.lost++
                }
            }
            perCopy.push(stats)
        }

        return { effective, rows, perCopy, totals }
    }

    return { run }
})()
})()
