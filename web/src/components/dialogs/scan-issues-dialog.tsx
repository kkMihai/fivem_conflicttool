import { Warning } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useStore } from '@/store/use-store'

export function ScanIssuesDialog() {
    const open = useStore(s => s.issuesOpen)
    const errors = useStore(s => s.parseErrors)
    const meta = useStore(s => s.scanMeta)
    const protectedResources = meta?.escrowedResources ?? []

    return (
        <Dialog open={open} onOpenChange={value => useStore.setState({ issuesOpen: value })}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle><Warning className="h-4 w-4 text-cat-occl" aria-hidden="true" /> Scan warnings</DialogTitle>
                    <DialogDescription>
                        {meta?.parseErrorCount ?? 0} unreadable files. Unreadable props cannot appear in the YMAP editor.
                    </DialogDescription>
                </DialogHeader>
                {protectedResources.length > 0 && (
                    <div className="mb-2 rounded-md border border-border bg-muted p-2 text-xs">
                        <div className="font-semibold">Escrow markers found in {protectedResources.length} resources</div>
                        <p className="mt-1 text-muted-foreground">Protected files cannot be scanned or edited. A resource may also contain readable files.</p>
                        <div className="mt-1 max-h-20 overflow-y-auto font-mono text-3xs text-muted-foreground">
                            {protectedResources.join(', ')}
                        </div>
                    </div>
                )}
                <div className="max-h-80 space-y-1 overflow-y-auto">
                    {errors.map((error, index) => (
                        <div key={`${error.resource}/${error.file}/${index}`} className="rounded-md border border-border bg-card p-2">
                            <div className="break-all font-mono text-2xs">{error.resource}/{error.file}</div>
                            <div className="mt-1 text-3xs text-cat-occl">
                                {error.escrowed ? 'Escrow marker found. File could not be read.' : `Unreadable: ${error.msg}`}
                            </div>
                        </div>
                    ))}
                    {errors.length === 0 && <div className="text-xs text-muted-foreground">No unreadable files in this scan.</div>}
                </div>
                {(meta?.parseErrorCount ?? 0) > errors.length && (
                    <div className="mt-2 text-3xs text-muted-foreground">Showing first {errors.length} unreadable files.</div>
                )}
            </DialogContent>
        </Dialog>
    )
}
