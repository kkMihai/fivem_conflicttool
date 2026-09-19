import type { Conflict, ScanMeta } from '@/types'

export const EXPORT_FIELDS = [
    ['category', 'Category'],
    ['kind', 'Type'],
    ['severity', 'Severity'],
    ['title', 'Title'],
    ['resource', 'Resources'],
    ['file', 'File'],
    ['status', 'Status'],
    ['position', 'Position'],
    ['summary', 'Summary']
] as const

export type ExportField = (typeof EXPORT_FIELDS)[number][0]
export type ExportFormat = 'csv' | 'json' | 'markdown' | 'text'

export const EXPORT_PRESETS: Record<ExportFormat, ExportField[]> = {
    csv: ['category', 'kind', 'severity', 'title', 'resource', 'file', 'status'],
    json: EXPORT_FIELDS.map(([key]) => key),
    markdown: ['category', 'kind', 'title', 'resource', 'file', 'status'],
    text: ['category', 'title', 'resource', 'file', 'status']
}

function fieldValue(conflict: Conflict, field: ExportField, resolved: Record<string, string>): string {
    switch (field) {
        case 'category': return conflict.cat
        case 'kind': return conflict.kind
        case 'severity': return conflict.sev
        case 'title': return conflict.title
        case 'resource': return conflict.resources.map(resource => resource.name).join(', ')
        case 'file': return conflict.file
        case 'status': return resolved[conflict.id] ?? (conflict.ignored ? 'ignored' : 'open')
        case 'position': return conflict.pos?.join(', ') ?? ''
        case 'summary': return conflict.explain.summary
    }
}

const csvCell = (value: string) => {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
    return `"${safe.replaceAll('"', '""')}"`
}
const markdownCell = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', ' ')

export function buildScanExport(
    format: ExportFormat,
    fields: ExportField[],
    conflicts: Conflict[],
    resolved: Record<string, string>,
    meta: ScanMeta | null
): string {
    const labels = fields.map(field => EXPORT_FIELDS.find(([key]) => key === field)?.[1] ?? field)
    const rows = conflicts.map(conflict => fields.map(field => fieldValue(conflict, field, resolved)))
    if (format === 'csv') return [labels, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
    if (format === 'json') {
        return JSON.stringify({ scan: meta && { id: meta.scanId, scannedAt: meta.scannedAt, files: meta.fileCount, unreadable: meta.parseErrorCount }, results: rows.map(row => Object.fromEntries(fields.map((field, index) => [field, row[index]]))) }, null, 2) + '\n'
    }
    if (format === 'markdown') {
        const table = [labels, labels.map(() => '---'), ...rows].map(row => `| ${row.map(markdownCell).join(' | ')} |`)
        return [`# Scan results`, '', `Scanned: ${meta?.scannedAt ?? 'unknown'}`, `Entries: ${rows.length}`, '', ...table, ''].join('\n')
    }
    return [`Scan results`, `Scanned: ${meta?.scannedAt ?? 'unknown'}`, `Entries: ${rows.length}`, '', ...rows.map(row => row.map((value, index) => `${labels[index]}: ${value}`).join(' | ')), ''].join('\n')
}
