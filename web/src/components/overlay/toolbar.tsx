import * as React from 'react'
import { Archive, ArrowClockwise, ArrowsClockwise, ArrowsOutCardinal, Binoculars, CheckCircle, Cube, HardDrives, Lightning, MapPin, Scan } from '@phosphor-icons/react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useStore } from '@/store/use-store'
import { fetchNui } from '@/lib/nui'
import { cn } from '@/lib/utils'

const ToolItem = React.forwardRef<
    HTMLButtonElement,
    {
        icon: React.ReactNode
        label: string
        active?: boolean
        disabled?: boolean
        title?: string
        onClick?: () => void
    } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ icon, label, active, disabled, title, onClick, ...props }, ref) => (
    <button
        ref={ref}
        type="button"
        title={title}
        aria-label={title ?? label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className={cn(
            'flex min-h-9.5 min-w-11.5 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 py-1 text-3xs font-semibold transition-colors duration-150 [&_svg]:h-4 [&_svg]:w-4',
            active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            disabled && 'pointer-events-none opacity-50'
        )}
        {...props}
    >
        <span aria-hidden="true" className="contents">
            {icon}
        </span>
        <span aria-hidden="true" className="whitespace-nowrap leading-none">
            {label}
        </span>
    </button>
))
ToolItem.displayName = 'ToolItem'

function Sep() {
    return <span aria-hidden="true" className="mx-0.5 h-7 w-px self-center bg-border" />
}

export function Toolbar() {
    const scanning = useStore(s => s.scanning)
    const scanMeta = useStore(s => s.scanMeta)
    const decisions = useStore(s => s.decisions)
    const collViz = useStore(s => s.collViz)
    const toggleCollViz = useStore(s => s.toggleCollViz)
    const worldVisuals = useStore(s => s.worldVisuals)
    const toggleWorldVisuals = useStore(s => s.toggleWorldVisuals)
    const xray = useStore(s => s.xray)
    const toggleXray = useStore(s => s.toggleXray)
    const selectedId = useStore(s => s.selectedId)
    const conflicts = useStore(s => s.conflicts)
    const enterMode = useStore(s => s.enterMode)

    const pending = decisions.assetsPending
    const canResolve = !!decisions.entities || pending > 0
    const autoRes = scanMeta?.autoRes ?? 0
    const collCount = scanMeta?.counts.coll ?? 0
    const sel = conflicts.find(c => c.id === selectedId)
    const canTransform = !!sel?.entity

    const openApply = () => {
        useStore.setState({ applyState: { open: true, step: 0, total: 0, label: '', done: false, result: null } })
        fetchNui('apply')
    }

    const clearQueued = () => {
        fetchNui('clearQueued')
        const resolved = { ...useStore.getState().resolved }
        for (const id of Object.keys(resolved)) {
            if (resolved[id].startsWith('queued')) delete resolved[id]
        }
        useStore.setState({ resolved })
    }

    return (
        <div data-panel="" className="chip-glass pointer-events-auto flex max-w-full flex-wrap items-stretch justify-center gap-0.5 rounded-2xl px-1.5 py-1.5" role="toolbar" aria-label="Conflict tool actions">
            <ToolItem icon={<Binoculars />} label="Review" active title="Review mode (1)" onClick={() => enterMode('review')} />
            <ToolItem icon={<ArrowsOutCardinal />} label="Move" disabled={!canTransform} title="Move selected object (2)" onClick={() => enterMode('translate')} />
            <ToolItem icon={<ArrowClockwise />} label="Rotate" disabled={!canTransform} title="Rotate selected object (3)" onClick={() => enterMode('rotate')} />
            <Sep />
            <ToolItem
                icon={<ArrowsClockwise className={cn(scanning && 'animate-spin')} />}
                label={scanMeta ? 'Re-scan' : 'Scan'}
                disabled={scanning}
                title="Scan the server for conflicts"
                onClick={() => fetchNui('requestScan', { force: true })}
            />
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <ToolItem icon={<Lightning />} label={`Auto (${autoRes})`} disabled={!autoRes} title="Auto-resolve safe conflicts" />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="center">
                    <DropdownMenuItem onClick={() => fetchNui('autoResolve', { scope: 'all' })}>Resolve everything safe</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => fetchNui('autoResolve', { scope: 'assets' })}>Duplicate files only</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => fetchNui('autoResolve', { scope: 'props' })}>Double-placed props only</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={clearQueued}>
                        Clear queued file decisions
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <ToolItem icon={<Archive />} label="Backups" title="Apply bundles and restore" onClick={() => useStore.setState({ backupsOpen: true })} />
            <ToolItem icon={<HardDrives />} label="Weight" title="Streaming weight per resource" onClick={() => useStore.setState({ weightsOpen: true })} />
            <Sep />
            <ToolItem icon={<Cube />} label={`Coll (${collCount})`} active={collViz} title="Draw all conflicting collision meshes" onClick={toggleCollViz} />
            <ToolItem icon={<MapPin />} label="Markers" active={worldVisuals} title="Toggle in-world markers and meshes" onClick={toggleWorldVisuals} />
            <ToolItem icon={<Scan />} label="X-ray" active={xray} title="Draw world visuals through walls" onClick={toggleXray} />
            <button
                type="button"
                disabled={!canResolve}
                onClick={openApply}
                title="Apply every queued decision"
                aria-label={pending > 0 ? `Resolve, ${pending} queued file decisions` : 'Resolve queued decisions'}
                className="ml-1 flex cursor-pointer items-center gap-1.5 self-center rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-colors duration-150 hover:bg-primary/85 disabled:pointer-events-none disabled:opacity-40 [&_svg]:h-4 [&_svg]:w-4"
            >
                <CheckCircle aria-hidden="true" />
                <span aria-hidden="true">Resolve</span>
                {pending > 0 && (
                    <span className="opacity-80" aria-hidden="true">
                        ({pending})
                    </span>
                )}
            </button>
        </div>
    )
}
