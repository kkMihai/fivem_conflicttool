(() => {
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

globalThis.KKCT = globalThis.KKCT || {}

KKCT.names = (() => {
    const byHash = new Map()
    let loaded = false

    function add(name) {
        if (!name) return
        const n = String(name).toLowerCase()
        const h = KKCT.joaat(n)
        if (!byHash.has(h)) byHash.set(h, n)
    }

    function loadDictionary(rootDir) {
        if (loaded) return
        loaded = true
        try {
            const p = path.join(rootDir, 'server', 'data', 'propnames.txt.gz')
            if (fs.existsSync(p)) {
                const text = zlib.gunzipSync(fs.readFileSync(p)).toString('utf8')
                for (const line of text.split('\n')) {
                    const n = line.trim()
                    if (n) add(n)
                }
            }
        } catch (e) {
            console.log(`[fivem_conflicttool] propnames load failed: ${e.message}`)
        }
    }

    function resolve(hash) {
        const h = hash >>> 0
        return byHash.get(h) || `hash_${h.toString(16).toUpperCase().padStart(8, '0')}`
    }

    function known(hash) {
        return byHash.has(hash >>> 0)
    }

    return { add, loadDictionary, resolve, known, size: () => byHash.size }
})()
})()
