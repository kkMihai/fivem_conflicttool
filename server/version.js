(() => {
globalThis.KKCT = globalThis.KKCT || {}

const RESOURCE = GetCurrentResourceName()
const REPO = 'kkMihai/fivem_conflicttool'
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const RECHECK_MS = 6 * 60 * 60 * 1000
const MIN_GAP_MS = 60 * 1000

const state = {
    current: GetResourceMetadata(RESOURCE, 'version', 0) || '0.0.0',
    latest: null,
    updateAvailable: false,
    url: RELEASES_URL,
    checkedAt: null,
    error: null
}

let pending = null
let lastAttempt = 0

function parse(input) {
    const m = String(input || '')
        .trim()
        .replace(/^v/i, '')
        .match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9a-z.-]+))?/i)
    if (!m) return null
    return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || null }
}

function comparePre(a, b) {
    if (a === b) return 0
    if (!a) return 1
    if (!b) return -1
    const pa = a.split('.')
    const pb = b.split('.')
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i]
        const y = pb[i]
        if (x === undefined) return -1
        if (y === undefined) return 1
        const nx = /^\d+$/.test(x)
        const ny = /^\d+$/.test(y)
        if (nx && ny) {
            if (+x !== +y) return +x < +y ? -1 : 1
        } else if (x !== y) {
            return x < y ? -1 : 1
        }
    }
    return 0
}

function compare(a, b) {
    for (const k of ['major', 'minor', 'patch']) {
        if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1
    }
    return comparePre(a.pre, b.pre)
}

function enabled() {
    return GetConvar('fivem_conflicttool_update_check', 'true') !== 'false'
}

function apply(latestRaw) {
    const current = parse(state.current)
    const latest = parse(latestRaw)
    state.checkedAt = Date.now()
    if (!latest) {
        state.error = `unreadable release tag "${latestRaw}"`
        return
    }
    state.error = null
    state.latest = `${latest.major}.${latest.minor}.${latest.patch}${latest.pre ? `-${latest.pre}` : ''}`
    state.updateAvailable = !!current && compare(current, latest) < 0
    if (state.updateAvailable) {
        console.log(`[fivem_conflicttool] update available: v${state.current} -> v${state.latest} (${RELEASES_URL})`)
    } else {
        console.log(`[fivem_conflicttool] up to date (v${state.current})`)
    }
}

function check(force) {
    if (!enabled()) {
        state.error = 'disabled'
        return Promise.resolve(snapshot())
    }
    const now = Date.now()
    if (pending) return pending
    if (!force && state.checkedAt && now - state.checkedAt < MIN_GAP_MS) return Promise.resolve(snapshot())
    if (now - lastAttempt < MIN_GAP_MS && !force) return Promise.resolve(snapshot())
    lastAttempt = now

    pending = new Promise(resolve => {
        let settled = false
        const done = () => {
            if (settled) return
            settled = true
            pending = null
            resolve(snapshot())
        }
        setTimeout(() => {
            if (!settled) {
                state.error = 'timed out'
                state.checkedAt = Date.now()
            }
            done()
        }, 10000)
        try {
            PerformHttpRequest(
                API_URL,
                (status, body) => {
                    try {
                        if (status === 200) {
                            apply(JSON.parse(body).tag_name)
                        } else {
                            state.error = `github returned ${status}`
                            state.checkedAt = Date.now()
                            console.log(`[fivem_conflicttool] update check failed: ${state.error}`)
                        }
                    } catch (e) {
                        state.error = e.message
                        state.checkedAt = Date.now()
                        console.log(`[fivem_conflicttool] update check failed: ${e.message}`)
                    }
                    done()
                },
                'GET',
                '',
                { 'User-Agent': `${RESOURCE}/${state.current}`, Accept: 'application/vnd.github+json' }
            )
        } catch (e) {
            state.error = e.message
            state.checkedAt = Date.now()
            done()
        }
    })
    return pending
}

function snapshot() {
    return { ...state }
}

KKCT.version = { snapshot, check, current: () => state.current }

setTimeout(() => check(true), 5000)
setInterval(() => check(false), RECHECK_MS)
})()
