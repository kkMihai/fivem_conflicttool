import { ArrowCircleUp, ArrowUUpLeft, ArrowLineDown, ClockCounterClockwise, Eye, EyeSlash, Keyboard, Pulse, ShieldCheck, Sparkle, Stack } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { ConflictList } from '@/components/conflicts/conflict-list'
import { useStore } from '@/store/use-store'
import { fetchNui } from '@/lib/nui'
import { cn, timeAgo } from '@/lib/utils'

const SHORTCUTS: [string, string][] = [
    ['Look around', 'Hold RMB'],
    ['Select / drag gizmo', 'LMB'],
    ['Move camera', 'WASD'],
    ['Up / Down', 'E / Q'],
    ['Fast / slow camera', 'Shift / Ctrl'],
    ['Hide / show UI', 'H'],
    ['Next conflict', 'Tab'],
    ['Keep / Remove', 'K / R'],
    ['Review / Move / Rotate', '1 / 2 / 3'],
    ['Local or global axes', 'X'],
    ['Toggle grid snap', 'G'],
    ['Snap to ground', 'F'],
    ['Finish transform', 'Enter'],
    ['Undo decision', 'Ctrl+Z']
]

function DockHeader() {
    const scanMeta = useStore(s => s.scanMeta)
    const scanning = useStore(s => s.scanning)
    const showVanilla = useStore(s => s.showVanilla)
    const setShowVanilla = useStore(s => s.setShowVanilla)
    const onlyNew = useStore(s => s.onlyNew)
    const setOnlyNew = useStore(s => s.setOnlyNew)
    const showIgnored = useStore(s => s.showIgnored)
    const setShowIgnored = useStore(s => s.setShowIgnored)
    const showHidden = useStore(s => s.showHidden)
    const setShowHidden = useStore(s => s.setShowHidden)
    const version = useStore(s => s.version)
    const outdated = !!version?.updateAvailable && !!version.latest
    const newCount = scanMeta?.newCount ?? 0
    const ignoredCount = scanMeta?.ignoredCount ?? 0
    const hiddenCount = scanMeta?.hiddenCount ?? 0

    return (
        <div className="border-b border-border px-3 pb-2.5 pt-3">
            <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md border border-ring/30 bg-muted">
                    <Stack className="h-4 w-4 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0 leading-tight">
                    <div className="text-xs font-bold">Conflict Tool</div>
                    <div className="flex items-center gap-1">
                        <span className="font-mono text-3xs text-muted-foreground">v{version?.current ?? __APP_VERSION__}</span>
                        {outdated && (
                            <button
                                type="button"
                                onClick={() => fetchNui('checkUpdate')}
                                title={`Update available: v${version?.latest}, download it at ${version?.url}`}
                                aria-label={`Update available, version ${version?.latest}. Download at ${version?.url}`}
                                className="flex min-h-6 items-center gap-1 rounded-full border border-cat-occl/40 bg-cat-occl/10 px-1.5 text-3xs font-semibold text-cat-occl transition-colors duration-150 hover:bg-cat-occl/20 cursor-pointer"
                            >
                                <ArrowCircleUp className="h-3 w-3" aria-hidden="true" />
                                <span className="font-mono">v{version?.latest}</span>
                            </button>
                        )}
                    </div>
                </div>
                <div
                    role="status"
                    aria-atomic="true"
                    className={cn(
                        'ml-auto flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1 text-3xs',
                        scanning ? 'text-primary' : 'text-muted-foreground'
                    )}
                >
                    <Pulse aria-hidden="true" className={cn('h-3 w-3', scanning ? 'animate-pulse text-primary' : 'text-cat-coll')} />
                    {scanning ? 'scanning…' : `scan ${timeAgo(scanMeta?.scannedAt)}`}
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 px-0"
                    aria-label="Hide UI and look at the world, press H to bring it back"
                    title="Hide UI and look at the world (H to bring it back)"
                    onClick={() => useStore.setState({ uiHidden: true })}
                >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => setShowVanilla(!showVanilla)}
                    aria-pressed={showVanilla}
                    title="Show conflicts that only involve base-game assets"
                    className={cn(
                        'flex min-h-6 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-3xs font-semibold transition-colors duration-150 cursor-pointer',
                        showVanilla ? 'border-cat-vanilla/50 bg-cat-vanilla/10 text-cat-vanilla' : 'border-border bg-card text-muted-foreground hover:border-ring/30 hover:text-foreground'
                    )}
                >
                    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                    Vanilla
                </button>
                {newCount > 0 && (
                    <button
                        type="button"
                        onClick={() => setOnlyNew(!onlyNew)}
                        aria-pressed={onlyNew}
                        title="Show only conflicts that appeared since the previous scan"
                        className={cn(
                            'flex min-h-6 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-3xs font-semibold transition-colors duration-150 cursor-pointer',
                            onlyNew ? 'border-ring/60 bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-ring/30 hover:text-foreground'
                        )}
                    >
                        <Sparkle className="h-3 w-3" aria-hidden="true" />
                        New ({newCount})
                    </button>
                )}
                {ignoredCount > 0 && (
                    <button
                        type="button"
                        onClick={() => setShowIgnored(!showIgnored)}
                        aria-pressed={showIgnored}
                        title="Show conflicts you marked as intentional"
                        className={cn(
                            'flex min-h-6 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-3xs font-semibold transition-colors duration-150 cursor-pointer',
                            showIgnored ? 'border-ring/50 bg-accent text-foreground' : 'border-border bg-card text-muted-foreground hover:border-ring/30 hover:text-foreground'
                        )}
                    >
                        <EyeSlash className="h-3 w-3" aria-hidden="true" />
                        Ignored ({ignoredCount})
                    </button>
                )}
                {hiddenCount > 0 && (
                    <button
                        type="button"
                        onClick={() => setShowHidden(!showHidden)}
                        aria-pressed={showHidden}
                        title="Show props that sit far under the map in every copy, so no load order makes them visible"
                        className={cn(
                            'flex min-h-6 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-3xs font-semibold transition-colors duration-150 cursor-pointer',
                            showHidden ? 'border-ring/50 bg-accent text-foreground' : 'border-border bg-card text-muted-foreground hover:border-ring/30 hover:text-foreground'
                        )}
                    >
                        <ArrowLineDown className="h-3 w-3" aria-hidden="true" />
                        Under map ({hiddenCount})
                    </button>
                )}
            </div>
        </div>
    )
}

function DockFooter() {
    const history = useStore(s => s.history)
    const undo = useStore(s => s.undo)
    const scanMeta = useStore(s => s.scanMeta)
    const selectedId = useStore(s => s.selectedId)
    useStore(s => s.conflicts)
    useStore(s => s.tab)
    useStore(s => s.search)
    useStore(s => s.hiddenExts)
    useStore(s => s.hiddenKinds)
    useStore(s => s.resourceFilter)
    const list = useStore(s => s.filtered)()
    const idx = list.findIndex(c => c.id === selectedId)
    const [shortcutsOpen, setShortcutsOpen] = useState(false)

    return (
        <div className="border-t border-border">
            <div className="flex items-center gap-2 px-3 py-1.5">
                <ClockCounterClockwise className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                <span className="text-3xs font-semibold">{history.length} decisions</span>
                {history[0] && (
                    <span className="truncate font-mono text-3xs text-muted-foreground">
                        {history[0].action} {history[0].label}
                    </span>
                )}
                {history.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 px-0" title="Undo last decision (Ctrl+Z)" aria-label="Undo last decision" onClick={undo}>
                        <ArrowUUpLeft className="h-3 w-3" aria-hidden="true" />
                    </Button>
                )}
                <button
                    type="button"
                    onClick={() => setShortcutsOpen(!shortcutsOpen)}
                    aria-expanded={shortcutsOpen}
                    className={cn('ml-auto flex min-h-6 items-center gap-1 rounded-sm px-1.5 py-1 text-3xs font-semibold cursor-pointer', shortcutsOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
                >
                    <Keyboard className="h-3 w-3" aria-hidden="true" />
                    Keys
                </button>
            </div>
            {shortcutsOpen && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border bg-background px-3 py-2">
                    {SHORTCUTS.map(([label, key]) => (
                        <div key={label} className="flex items-center text-3xs text-muted-foreground">
                            <span className="truncate">{label}</span>
                            <span className="ml-auto flex gap-0.5 pl-1">
                                {key.split(' / ').map(k => (
                                    <Kbd key={k} className="text-3xs">
                                        {k}
                                    </Kbd>
                                ))}
                            </span>
                        </div>
                    ))}
                </div>
            )}
            <div className="flex items-center gap-2 border-t border-border px-3 py-1 text-3xs text-muted-foreground">
                {scanMeta && <span>{scanMeta.modPackCount} mod packs</span>}
                {scanMeta && scanMeta.parseErrorCount > 0 && <span className="text-cat-occl">{scanMeta.parseErrorCount} unreadable</span>}
                {idx >= 0 && (
                    <span className="ml-auto font-mono">
                        [{idx + 1}/{list.length}]
                    </span>
                )}
            </div>
        </div>
    )
}

export function Dock() {
    return (
        <div data-panel="" className="panel animate-rise pointer-events-auto flex h-full w-dock shrink-0 flex-col overflow-hidden rounded-xl" role="region" aria-label="Conflict list">
            <DockHeader />
            <ConflictList />
            <DockFooter />
        </div>
    )
}
