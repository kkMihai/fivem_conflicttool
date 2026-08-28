import { Archive, ArrowCounterClockwise } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useStore } from '@/store/use-store'
import { fetchNui } from '@/lib/nui'

export function BackupsDialog() {
    const open = useStore(s => s.backupsOpen)
    const backups = useStore(s => s.backups)

    const restore = (id: string) => {
        useStore.setState({
            backupsOpen: false,
            applyState: { open: true, step: 0, total: 0, label: '', done: false, result: null }
        })
        fetchNui('restoreBackup', { id })
    }

    return (
        <Dialog open={open} onOpenChange={v => useStore.setState({ backupsOpen: v })}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        <Archive className="h-4 w-4 text-primary" aria-hidden="true" />
                        Apply bundles
                    </DialogTitle>
                    <DialogDescription>
                        Every apply moves the losing files here instead of deleting them. Restore puts them back.
                    </DialogDescription>
                </DialogHeader>
                {backups.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">No backups yet. Apply some decisions first.</div>
                ) : (
                    <div className="max-h-80 space-y-2 overflow-y-auto">
                        {backups.map(b => (
                            <div key={b.id} className="rounded-lg border border-border bg-card p-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold">{new Date(b.createdAt).toLocaleString()}</span>
                                    {b.current && <Badge variant="success">current</Badge>}
                                    {b.restored && <Badge variant="secondary">restored</Badge>}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="ml-auto"
                                        aria-label={`Restore bundle from ${new Date(b.createdAt).toLocaleString()}`}
                                        disabled={b.restored}
                                        onClick={() => restore(b.id)}
                                    >
                                        <ArrowCounterClockwise aria-hidden="true" />
                                        Restore
                                    </Button>
                                </div>
                                <div className="mt-1 text-3xs text-muted-foreground">
                                    removed {b.summary.removed} · moved {b.summary.moved} · assets {b.summary.assets} · {b.files} file(s)
                                </div>
                                <div className="mt-1 truncate text-3xs font-mono text-muted-foreground">
                                    {b.resources.join(' · ')}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
