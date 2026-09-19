(() => {
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

globalThis.KKCT = globalThis.KKCT || {}

KKCT.scanexport = (() => {
    const extensions = { csv: 'csv', json: 'json', markdown: 'md', text: 'txt' }
    const maxBytes = 16 * 1024 * 1024

    function save(root, scanId, format, content) {
        if (typeof scanId !== 'string' || !/^s_[a-z0-9]+$/.test(scanId)) throw new Error('Run a fresh scan before exporting.')
        if (!Object.hasOwn(extensions, format)) throw new Error('Unsupported export format.')
        if (typeof content !== 'string' || !content.length) throw new Error('Export is empty.')
        const bytes = Buffer.byteLength(content, 'utf8')
        if (bytes > maxBytes) throw new Error('Export is too large. Use Current filters to save fewer entries.')

        const dir = path.join(root, 'exports')
        fs.mkdirSync(dir, { recursive: true })
        const name = `conflicttool-scan-${scanId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extensions[format]}`
        const file = path.join(dir, name)
        fs.writeFileSync(file, content, { encoding: 'utf8', flag: 'wx' })
        if (fs.statSync(file).size !== bytes) throw new Error('Export file did not verify after writing.')
        return file
    }

    return { save }
})()
})()
