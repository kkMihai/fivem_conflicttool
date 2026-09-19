import { useRef, useState } from 'react'
import { ClipboardText, FloppyDisk } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { buildScanExport, EXPORT_FIELDS, EXPORT_PRESETS, type ExportField, type ExportFormat } from '@/lib/export-scan'
import { fetchNui, useNuiEvent } from '@/lib/nui'
import { useStore } from '@/store/use-store'

const FORMATS: { id: ExportFormat; label: string }[] = [
    { id: 'csv', label: 'Spreadsheet (CSV)' },
    { id: 'json', label: 'Full data (JSON)' },
    { id: 'markdown', label: 'Table (Markdown)' },
    { id: 'text', label: 'Plain text' }
]

export function ExportDialog() {
    const open = useStore(s => s.exportOpen)
    const meta = useStore(s => s.scanMeta)
    const conflicts = useStore(s => s.conflicts)
    const resolved = useStore(s => s.resolved)
    const filtered = useStore(s => s.filtered)
    const setNotice = useStore(s => s.setNotice)
    const [format, setFormat] = useState<ExportFormat>('csv')
    const [fields, setFields] = useState<ExportField[]>(EXPORT_PRESETS.csv)
    const [custom, setCustom] = useState(false)
    const [scope, setScope] = useState<'all' | 'visible'>('all')
    const [saving, setSaving] = useState(false)
    const [savedPath, setSavedPath] = useState<string | null>(null)
    const requestId = useRef(0)
    const pendingTimeout = useRef<number | null>(null)
    const results = scope === 'visible' ? filtered() : conflicts

    useNuiEvent<{ requestId: number; ok: boolean; path?: string; reason?: string }>('exportScanResult', result => {
        if (result.requestId !== requestId.current) return
        if (pendingTimeout.current !== null) window.clearTimeout(pendingTimeout.current)
        pendingTimeout.current = null
        setSaving(false)
        if (result.ok && result.path) {
            setSavedPath(result.path)
            setNotice('Saved scan export in fivem_conflicttool/exports.', 'success')
        } else {
            setNotice(result.reason ?? 'Could not save scan export.')
        }
    })

    const changeFormat = (next: ExportFormat) => {
        setFormat(next)
        if (!custom) setFields(EXPORT_PRESETS[next])
    }

    const changeCustom = (on: boolean) => {
        setCustom(on)
        if (!on) setFields(EXPORT_PRESETS[format])
    }

    const toggleField = (field: ExportField) => {
        setFields(current => current.includes(field) ? current.length > 1 ? current.filter(item => item !== field) : current : EXPORT_FIELDS.map(([key]) => key).filter(key => key === field || current.includes(key)))
    }

    const content = () => buildScanExport(format, fields, results, resolved, meta)

    const copy = async () => {
        const value = content()
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value)
            } else {
                const input = document.createElement('textarea')
                input.value = value
                input.style.position = 'fixed'
                input.style.opacity = '0'
                document.body.appendChild(input)
                input.select()
                const copied = document.execCommand('copy')
                input.remove()
                if (!copied) throw new Error('Clipboard unavailable')
            }
            setNotice(`Copied ${results.length} scan entries.`, 'success')
        } catch {
            setNotice('Could not copy scan results. Use Save to resource instead.')
        }
    }

    const save = async () => {
        if (!meta) return
        const id = ++requestId.current
        setSaving(true)
        setSavedPath(null)
        pendingTimeout.current = window.setTimeout(() => {
            if (id === requestId.current) {
                setSaving(false)
                setNotice('Export timed out. Check the server logs and exports folder.')
            }
        }, 30000)
        try {
            const sent = await fetchNui('exportScan', { requestId: id, scanId: meta.scanId, format, content: content() })
            if (!sent) {
                if (pendingTimeout.current !== null) window.clearTimeout(pendingTimeout.current)
                pendingTimeout.current = null
                setSaving(false)
                setNotice('Could not send scan export to the server.')
            }
        } catch {
            if (pendingTimeout.current !== null) window.clearTimeout(pendingTimeout.current)
            pendingTimeout.current = null
            setSaving(false)
            setNotice('Could not prepare scan export.')
        }
    }

    return (
        <Dialog open={open} onOpenChange={value => useStore.setState({ exportOpen: value })}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle><FloppyDisk className="h-4 w-4" aria-hidden="true" /> Export scan results</DialogTitle>
                    <DialogDescription>Copy scan results or save them in the server's fivem_conflicttool/exports folder.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <label className="block text-xs font-semibold">
                        Format
                        <select
                            value={format}
                            onChange={event => changeFormat(event.target.value as ExportFormat)}
                            className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {FORMATS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                        </select>
                    </label>
                    <label className="block text-xs font-semibold">
                        Entries
                        <select
                            value={scope}
                            onChange={event => setScope(event.target.value as 'all' | 'visible')}
                            className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <option value="all">Entire scan ({conflicts.length})</option>
                            <option value="visible">Current filters ({filtered().length})</option>
                        </select>
                    </label>
                    <label className="flex min-h-8 items-center gap-2 text-xs font-semibold">
                        <input type="checkbox" checked={custom} onChange={event => changeCustom(event.target.checked)} className="accent-primary" />
                        Choose columns
                    </label>
                    {custom && (
                        <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-card p-2" role="group" aria-label="Export columns">
                            {EXPORT_FIELDS.map(([key, label]) => (
                                <label key={key} className="flex min-h-7 items-center gap-2 text-xs">
                                    <input type="checkbox" checked={fields.includes(key)} onChange={() => toggleField(key)} className="accent-primary" />
                                    {label}
                                </label>
                            ))}
                        </div>
                    )}
                    <div className="text-3xs text-muted-foreground">{results.length} entries · {fields.length} columns</div>
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="secondary" onClick={copy} disabled={!meta}><ClipboardText /> Copy</Button>
                        <Button onClick={save} disabled={!meta || saving}><FloppyDisk /> {saving ? 'Saving…' : 'Save to resource'}</Button>
                    </div>
                    {savedPath && <p className="break-all text-3xs text-muted-foreground" role="status">Saved: <span className="font-mono">{savedPath}</span></p>}
                </div>
            </DialogContent>
        </Dialog>
    )
}
