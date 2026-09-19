import { describe, expect, test } from 'bun:test'
import { buildScanExport } from '../web/src/lib/export-scan'
import type { Conflict } from '../web/src/types'

const conflict = {
    id: 'one',
    cat: 'prop',
    kind: 'ymap-file',
    sev: 'cosmetic',
    title: 'tree, "large"',
    file: 'trees.ymap',
    resources: [{ name: 'tree_pack' }],
    pos: null,
    ignored: false,
    explain: { summary: 'One | two' }
} as Conflict

describe('scan export', () => {
    test('quotes CSV values and respects selected columns', () => {
        const result = buildScanExport('csv', ['title', 'resource'], [conflict], {}, null)
        expect(result).toBe('"Title","Resources"\r\n"tree, ""large""","tree_pack"\r\n')
    })

    test('exports scan metadata and edited status as JSON', () => {
        const result = JSON.parse(buildScanExport('json', ['file', 'status'], [conflict], { one: 'queued' }, {
            scanId: 'scan-1', scannedAt: '2026-09-19', fileCount: 1, parseErrorCount: 0
        } as any))
        expect(result.scan.id).toBe('scan-1')
        expect(result.results).toEqual([{ file: 'trees.ymap', status: 'queued' }])
    })

    test('escapes pipes in Markdown cells', () => {
        const result = buildScanExport('markdown', ['summary'], [conflict], {}, null)
        expect(result).toContain('One \\| two')
    })

    test('keeps spreadsheet formulas as text', () => {
        const result = buildScanExport('csv', ['title'], [{ ...conflict, title: '=1+1' }], {}, null)
        expect(result).toContain("\"'=1+1\"")
    })
})
