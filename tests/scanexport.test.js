const { describe, expect, test } = require('bun:test')
const fs = require('fs')
const os = require('os')
const path = require('path')
const vm = require('vm')

globalThis.KKCT = globalThis.KKCT || {}
require('../server/lib/scanexport.js')

describe('scan exports', () => {
    test('saves each format inside the resource exports folder', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kkct-export-'))
        try {
            for (const [format, extension] of [['csv', 'csv'], ['json', 'json'], ['markdown', 'md'], ['text', 'txt']]) {
                const file = KKCT.scanexport.save(root, 's_abc123', format, 'tree,é\n')
                expect(path.dirname(file)).toBe(path.join(root, 'exports'))
                expect(path.extname(file)).toBe(`.${extension}`)
                expect(fs.readFileSync(file, 'utf8')).toBe('tree,é\n')
            }
        } finally {
            fs.rmSync(root, { recursive: true, force: true })
        }
    })

    test('rejects invalid names, formats, and oversized content', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kkct-export-'))
        try {
            expect(() => KKCT.scanexport.save(root, '../outside', 'csv', 'data')).toThrow()
            expect(() => KKCT.scanexport.save(root, 's_abc123', '../csv', 'data')).toThrow()
            expect(() => KKCT.scanexport.save(root, 's_abc123', 'csv', 'x'.repeat(16 * 1024 * 1024 + 1))).toThrow('too large')
            expect(fs.existsSync(path.join(root, 'exports'))).toBe(false)
        } finally {
            fs.rmSync(root, { recursive: true, force: true })
        }
    })

    test('reports a failed resource write', () => {
        const denied = Object.assign(new Error('permission denied'), { code: 'EACCES' })
        const context = {
            KKCT: {},
            Buffer,
            require(name) {
                if (name === 'fs') return { mkdirSync() {}, writeFileSync() { throw denied } }
                return require(name)
            }
        }
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server/lib/scanexport.js'), 'utf8'), context)
        expect(() => context.KKCT.scanexport.save('resource', 's_abc123', 'csv', 'data')).toThrow('permission denied')
    })
})
