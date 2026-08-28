(() => {
const fs = require('fs')
const path = require('path')

globalThis.KKCT = globalThis.KKCT || {}

KKCT.ignores = (() => {
    let root = null
    let map = {}
    let seen = new Set()

    const igPath = () => path.join(root, 'data', 'ignores.json')
    const seenPath = () => path.join(root, 'data', 'seen-keys.json')

    function init(rootDir) {
        root = rootDir
        try {
            if (fs.existsSync(igPath())) map = JSON.parse(fs.readFileSync(igPath(), 'utf8')) || {}
        } catch (e) {
            map = {}
        }
        try {
            if (fs.existsSync(seenPath())) seen = new Set(JSON.parse(fs.readFileSync(seenPath(), 'utf8')))
        } catch (e) {
            seen = new Set()
        }
    }

    function saveIgnores() {
        try {
            fs.writeFileSync(igPath(), JSON.stringify(map, null, 2))
        } catch (e) {
            console.log(`[fivem_conflicttool] ignores save failed: ${e.message}`)
        }
    }

    function set(key, on, info) {
        if (on) {
            map[key] = {
                title: (info && info.title) || '',
                cat: (info && info.cat) || '',
                by: (info && info.by) || '',
                at: new Date().toISOString()
            }
        } else {
            delete map[key]
        }
        saveIgnores()
    }

    function markScan(conflicts) {
        const firstScan = seen.size === 0
        let added = false
        for (const c of conflicts) {
            c.ignored = !!map[c.key]
            c.isNew = !firstScan && !seen.has(c.key)
            if (!seen.has(c.key)) {
                seen.add(c.key)
                added = true
            }
        }
        if (added) {
            try {
                fs.writeFileSync(seenPath(), JSON.stringify([...seen]))
            } catch (e) {
                console.log(`[fivem_conflicttool] seen-keys save failed: ${e.message}`)
            }
        }
    }

    return { init, set, markScan, has: k => !!map[k], count: () => Object.keys(map).length }
})()
})()
