import { CheckCircle, CircleNotch, Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { useStore } from '@/store/use-store'

export function ApplyModal() {
    const applyState = useStore(s => s.applyState)
    if (!applyState) return null
    const pct = applyState.total > 0 ? (applyState.step / applyState.total) * 100 : applyState.done ? 100 : 10
    const r = applyState.result

    return (
        <Dialog open={applyState.open} onOpenChange={v => !v && applyState.done && useStore.setState({ applyState: null })}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>
                        {applyState.done ? (
                            <CheckCircle className="h-4 w-4 text-cat-vanilla" aria-hidden="true" />
                        ) : (
                            <CircleNotch className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                        )}
                        {applyState.done ? 'Changes applied' : 'Applying changes…'}
                    </DialogTitle>
                </DialogHeader>
                {!applyState.done ? (
                    <div role="status" aria-atomic="true">
                        <Progress value={pct} label="Apply progress" />
                        <div className="mt-2 truncate text-2xs text-muted-foreground">
                            {applyState.label || 'Preparing…'}
                            {applyState.total > 0 && ` (${applyState.step}/${applyState.total})`}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2" role="status" aria-atomic="true">
                        {r?.summary && (
                            <div className="rounded-md border border-border bg-card p-2 text-2xs">
                                {'restored' in (r.summary ?? {}) ? (
                                    <span>{r.summary.restored} file(s) restored</span>
                                ) : (
                                    <span>
                                        removed {r.summary.removed ?? 0} · moved {r.summary.moved ?? 0}
                                        {r.summary.buried ? ` · buried ${r.summary.buried}` : ''} · assets {r.summary.assets ?? 0} file(s)
                                    </span>
                                )}
                            </div>
                        )}
                        {r?.errors?.length > 0 && (
                            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-3xs text-destructive">
                                {r.errors.slice(0, 4).map((e: any, i: number) => (
                                    <div key={i}>
                                        {e.file}: {e.msg}
                                    </div>
                                ))}
                            </div>
                        )}
                        {r?.restartRequired && (
                            <div className="flex items-center gap-1.5 rounded-md border border-cat-occl/40 bg-cat-occl/10 p-2 text-2xs text-cat-occl">
                                <Warning className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                File changes need a server restart to take effect.
                            </div>
                        )}
                        {r?.permissionHint && (
                            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-3xs text-destructive">
                                <div className="font-bold">The server blocked file moves.</div>
                                <div className="mt-1">Add this line to server.cfg and restart:</div>
                                <div className="mt-1 select-text rounded bg-background px-1.5 py-1 font-mono">
                                    add_unsafe_child_process_permission fivem_conflicttool
                                </div>
                            </div>
                        )}
                        <Button className="w-full" size="sm" onClick={() => useStore.setState({ applyState: null })}>
                            Done
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
