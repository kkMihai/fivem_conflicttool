const { test, expect } = require('bun:test')
const fs = require('fs')
const fsp = require('fs/promises')
const os = require('os')
const path = require('path')
const vm = require('vm')

test('scans nested folders concurrently without changing file order', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kkct-scan-'))
    const resourcePath = path.join(root, 'map')
    fs.mkdirSync(resourcePath)
    let active = 0
    let peak = 0
    const trackedPromises = {
        ...fsp,
        async readdir(...args) {
            active++
            peak = Math.max(peak, active)
            try {
                await new Promise(resolve => setTimeout(resolve, 5))
                return await fsp.readdir(...args)
            } finally {
                active--
            }
        }
    }
    try {
        for (let i = 0; i < 40; i++) {
            const dir = path.join(resourcePath, `folder-${String(i).padStart(2, '0')}`)
            fs.mkdirSync(dir)
            fs.writeFileSync(path.join(dir, 'same.ydr'), String(i))
        }
        const expected = fs.readdirSync(resourcePath).map(name => `${name}/same.ydr`)
        const context = {
            require(name) { return name === 'fs/promises' ? trackedPromises : require(name) },
            KKCT: {
                assetkind: { META_FILES: new Set(), create: () => ({ addResource() {} }) },
                names: { add() {} },
                conflicts: { detect: () => [] }
            },
            GetNumResources: () => 2,
            GetCurrentResourceName: () => 'scanner',
            GetResourceByFindIndex: i => i === 0 ? 'scanner' : 'map',
            GetResourceState: () => 'started',
            GetResourcePath: () => resourcePath
        }
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server/scanner.js'), 'utf8'), context)
        context.KKCT.scanner.init(root)
        const scan = await context.KKCT.scanner.run(() => {})
        expect(Array.from(scan.index.get('same.ydr'), entry => entry.rel)).toEqual(expected)
        expect(peak).toBeGreaterThan(1)
        expect(peak).toBeLessThanOrEqual(32)
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})
