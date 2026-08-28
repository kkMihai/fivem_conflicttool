import { CircleNotch } from '@phosphor-icons/react'
import { Progress } from '@/components/ui/progress'
import { useStore } from '@/store/use-store'

export function ScanProgress() {
    const scanning = useStore(s => s.scanning)
    const p = useStore(s => s.scanProgress)
    if (!scanning) return null
    const pct = p && p.total > 0 ? (p.current / p.total) * 100 : 5

    return (
        <div data-panel="" className="panel animate-rise pointer-events-auto w-scan rounded-xl p-3" role="status" aria-atomic="true">
            <div className="flex items-center gap-2 text-xs font-bold">
                <CircleNotch className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
                Scanning server…
            </div>
            <Progress className="mt-2" value={pct} label="Scan progress" />
            <div className="mt-1.5 flex text-3xs text-muted-foreground">
                <span className="capitalize">{p?.phase ?? 'starting'}</span>
                <span className="mx-1">·</span>
                <span className="truncate font-mono">{p?.resource}</span>
                {p && p.total > 0 && (
                    <span className="ml-auto">
                        {p.current}/{p.total}
                    </span>
                )}
            </div>
        </div>
    )
}
