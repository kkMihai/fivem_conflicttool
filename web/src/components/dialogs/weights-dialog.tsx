import { HardDrives, Warning } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useStore } from '@/store/use-store'
import { fmtBytes } from '@/lib/utils'

export function WeightsDialog() {
    const open = useStore(s => s.weightsOpen)
    const weights = useStore(s => s.weights)
    const max = weights[0]?.bytes || 1
    const total = weights.reduce((n, w) => n + w.bytes, 0)
    const oversized = weights.flatMap(w => w.over.map(o => ({ resource: w.name, ...o })))

    return (
        <Dialog open={open} onOpenChange={v => useStore.setState({ weightsOpen: v })}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        <HardDrives className="h-4 w-4 text-primary" aria-hidden="true" />
                        Streaming weight
                    </DialogTitle>
                    <DialogDescription>
                        {fmtBytes(total)} of tracked map assets across {weights.length} resources. Heaviest first.
                    </DialogDescription>
                </DialogHeader>
                {oversized.length > 0 && (
                    <div className="mb-2 rounded-md border border-cat-occl/40 bg-cat-occl/10 p-2 text-3xs text-cat-occl">
                        <div className="flex items-center gap-1.5 font-bold">
                            <Warning className="h-3 w-3" aria-hidden="true" />
                            {oversized.length} file{oversized.length > 1 ? 's' : ''} over 16 MB, may fail to stream
                        </div>
                        <div className="mt-1 space-y-0.5">
                            {oversized.slice(0, 8).map((o, i) => (
                                <div key={i} className="flex gap-2">
                                    <span className="truncate font-mono">
                                        {o.resource}/{o.rel}
                                    </span>
                                    <span className="ml-auto shrink-0">{fmtBytes(o.size)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {weights.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">No scan data yet. Run a scan first.</div>
                ) : (
                    <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                        {weights.slice(0, 60).map(w => (
                            <div key={w.name} className="rounded-md border border-border bg-card px-2 py-1.5">
                                <div className="flex items-center gap-2 text-2xs">
                                    <span className="truncate font-mono font-bold">{w.name}</span>
                                    {w.over.length > 0 && (
                                        <Warning className="h-3 w-3 shrink-0 text-cat-occl" aria-label="Contains files over 16 MB" />
                                    )}
                                    <span className="ml-auto shrink-0 font-mono text-muted-foreground">{fmtBytes(w.bytes)}</span>
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                                        <div
                                            className="h-full rounded-full bg-primary/80"
                                            style={{ width: `${Math.max(1, (w.bytes / max) * 100)}%` }}
                                        />
                                    </div>
                                    <span className="shrink-0 text-3xs text-muted-foreground">{w.files} files</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
