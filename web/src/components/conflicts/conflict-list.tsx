import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CaretDown, Car, Files, FunnelSimple, MagnifyingGlass, X } from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ConflictRow } from '@/components/conflicts/conflict-row'
import { useStore, type Tab } from '@/store/use-store'
import type { AssetKind } from '@/types'
import { cn, extOf } from '@/lib/utils'

const KIND_LABELS: [AssetKind, string][] = [
    ['vehicle', 'Vehicles'],
    ['ped', 'Peds & clothing'],
    ['weapon', 'Weapons'],
    ['map', 'Map files'],
    ['prop', 'Props'],
    ['other', 'Other']
]

const TABS: { id: Tab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'coll', label: 'Coll' },
    { id: 'occl', label: 'Occl' },
    { id: 'prop', label: 'Prop' },
    { id: 'asset', label: 'Asset' }
]

export function ConflictList() {
    const tab = useStore(s => s.tab)
    const setTab = useStore(s => s.setTab)
    const search = useStore(s => s.search)
    const setSearch = useStore(s => s.setSearch)
    const conflicts = useStore(s => s.conflicts)
    const resolved = useStore(s => s.resolved)
    const selectedId = useStore(s => s.selectedId)
    const select = useStore(s => s.select)
    const resourceFilter = useStore(s => s.resourceFilter)
    const setResourceFilter = useStore(s => s.setResourceFilter)
    const hiddenExts = useStore(s => s.hiddenExts)
    const toggleExt = useStore(s => s.toggleExt)
    const showAllExts = useStore(s => s.showAllExts)
    const hiddenKinds = useStore(s => s.hiddenKinds)
    const toggleKind = useStore(s => s.toggleKind)
    const showAllKinds = useStore(s => s.showAllKinds)
    const scanMeta = useStore(s => s.scanMeta)
    useStore(s => s.showIgnored)
    useStore(s => s.onlyNew)
    useStore(s => s.showVanilla)
    useStore(s => s.showHidden)
    const checked = useStore(s => s.checked)
    const toggleChecked = useStore(s => s.toggleChecked)
    const clearChecked = useStore(s => s.clearChecked)
    const bulkIgnore = useStore(s => s.bulkIgnore)
    const bulkDecide = useStore(s => s.bulkDecide)
    const list = useStore(s => s.filtered)()
    const checkedList = conflicts.filter(c => checked[c.id])
    const anyEntity = checkedList.some(c => c.entity && !resolved[c.id])
    const allIgnored = checkedList.length > 0 && checkedList.every(c => c.ignored)

    const parentRef = useRef<HTMLDivElement>(null)
    const virtualizer = useVirtualizer({
        count: list.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 74,
        overscan: 8
    })

    const resources = [...new Set(conflicts.flatMap(c => c.resources.map(r => r.name)))].sort()
    const extCounts = new Map<string, number>()
    for (const c of conflicts) {
        const e = extOf(c.file)
        extCounts.set(e, (extCounts.get(e) ?? 0) + 1)
    }
    const exts = [...extCounts.entries()].sort((a, b) => b[1] - a[1])
    const hiddenList = exts.filter(([e]) => hiddenExts[e]).map(([e]) => e)
    const kindCounts = new Map<string, number>()
    for (const c of conflicts) {
        const k = c.akind ?? 'other'
        kindCounts.set(k, (kindCounts.get(k) ?? 0) + 1)
    }
    const kinds = KIND_LABELS.filter(([k]) => (kindCounts.get(k) ?? 0) > 0)
    const hiddenKindList = kinds.filter(([k]) => hiddenKinds[k])
    const counts = scanMeta?.counts

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-1.5 px-3 pt-2">
                <div className="relative flex-1">
                    <MagnifyingGlass className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        className="pl-6"
                        aria-label="Search conflicts by model or script"
                        placeholder="Search model or script…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            title="Filter by script"
                            aria-label={resourceFilter ? `Filter by script: ${resourceFilter}` : 'Filter by script'}
                            className={cn('shrink-0', resourceFilter && 'text-primary')}
                        >
                            <FunnelSimple aria-hidden="true" />
                            <CaretDown className="h-3 w-3" aria-hidden="true" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                        <DropdownMenuItem onClick={() => setResourceFilter(null)}>All scripts</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {resources.map(r => (
                            <DropdownMenuItem key={r} onClick={() => setResourceFilter(r)}>
                                <span className="truncate">{r}</span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            title="Filter by file type"
                            aria-label={hiddenList.length ? `Filter by file type, ${hiddenList.length} hidden` : 'Filter by file type'}
                            className={cn('shrink-0', hiddenList.length > 0 && 'text-primary')}
                        >
                            <Files aria-hidden="true" />
                            <CaretDown className="h-3 w-3" aria-hidden="true" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                        <DropdownMenuItem onSelect={e => { e.preventDefault(); showAllExts() }}>Show all file types</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {exts.map(([e, n]) => (
                            <DropdownMenuCheckboxItem
                                key={e}
                                checked={!hiddenExts[e]}
                                onSelect={ev => ev.preventDefault()}
                                onCheckedChange={() => toggleExt(e)}
                            >
                                <span className="font-mono">.{e}</span>
                                <span className="ml-auto pl-3 text-muted-foreground">{n}</span>
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            title="Filter by asset kind"
                            aria-label={hiddenKindList.length ? `Filter by asset kind, ${hiddenKindList.length} hidden` : 'Filter by asset kind'}
                            className={cn('shrink-0', hiddenKindList.length > 0 && 'text-primary')}
                        >
                            <Car aria-hidden="true" />
                            <CaretDown className="h-3 w-3" aria-hidden="true" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                        <DropdownMenuItem onSelect={e => { e.preventDefault(); showAllKinds() }}>Show all asset kinds</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {kinds.map(([k, label]) => (
                            <DropdownMenuCheckboxItem
                                key={k}
                                checked={!hiddenKinds[k]}
                                onSelect={ev => ev.preventDefault()}
                                onCheckedChange={() => toggleKind(k)}
                            >
                                <span>{label}</span>
                                <span className="ml-auto pl-3 text-muted-foreground">{kindCounts.get(k)}</span>
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {hiddenKindList.length > 0 && (
                <button
                    type="button"
                    onClick={showAllKinds}
                    aria-label={`Show all asset kinds, ${hiddenKindList.length} hidden`}
                    className="mx-3 mt-1.5 flex min-h-6 items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-3xs text-primary transition-colors duration-150 hover:bg-primary/20 cursor-pointer"
                >
                    <span className="truncate">hiding: {hiddenKindList.map(([, l]) => l.toLowerCase()).join(', ')}</span>
                    <span className="ml-auto pl-1" aria-hidden="true">×</span>
                </button>
            )}
            {hiddenList.length > 0 && (
                <button
                    type="button"
                    onClick={showAllExts}
                    aria-label={`Show all file types, ${hiddenList.length} hidden`}
                    className="mx-3 mt-1.5 flex min-h-6 items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-3xs text-primary transition-colors duration-150 hover:bg-primary/20 cursor-pointer"
                >
                    <span className="truncate">hidden: <span className="font-mono">{hiddenList.map(e => `.${e}`).join(' ')}</span></span>
                    <span className="ml-auto pl-1" aria-hidden="true">×</span>
                </button>
            )}
            {resourceFilter && (
                <button
                    type="button"
                    onClick={() => setResourceFilter(null)}
                    aria-label={`Clear script filter ${resourceFilter}`}
                    className="mx-3 mt-1.5 flex min-h-6 items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-3xs text-primary transition-colors duration-150 hover:bg-primary/20 cursor-pointer"
                >
                    <span className="truncate">script: <span className="font-mono">{resourceFilter}</span></span>
                    <span className="ml-auto" aria-hidden="true">×</span>
                </button>
            )}
            <div className="mx-3 mt-2 flex gap-0.5 rounded-lg border border-border bg-background p-0.5" role="group" aria-label="Filter conflicts by category">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        aria-pressed={tab === t.id}
                        className={cn(
                            'min-h-6 flex-1 rounded-md px-1 py-1.5 text-3xs font-semibold transition-colors duration-150 cursor-pointer',
                            tab === t.id
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                        )}
                    >
                        {t.label}
                        {counts && t.id !== 'all' && <span className="opacity-85"> {counts[t.id]}</span>}
                        {counts && t.id === 'all' && <span className="opacity-85"> {counts.all}</span>}
                    </button>
                ))}
            </div>
            <div ref={parentRef} className="mt-2 min-h-0 flex-1 overflow-y-auto px-3 pb-2">
                {list.length === 0 ? (
                    <div className="mt-8 text-center text-xs text-muted-foreground">No conflicts here. Run a scan or relax the filters.</div>
                ) : (
                    <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
                        {virtualizer.getVirtualItems().map(vi => {
                            const c = list[vi.index]
                            return (
                                <div
                                    key={c.id}
                                    data-index={vi.index}
                                    ref={virtualizer.measureElement}
                                    className="absolute left-0 top-0 w-full pb-1.5"
                                    style={{ transform: `translateY(${vi.start}px)` }}
                                >
                                    <ConflictRow
                                        conflict={c}
                                        index={vi.index + 1}
                                        selected={selectedId === c.id}
                                        resolved={resolved[c.id]}
                                        checked={!!checked[c.id]}
                                        onCheck={shift => toggleChecked(c.id, shift)}
                                        onClick={() => select(c.id === selectedId ? null : c.id)}
                                    />
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
            {checkedList.length > 0 && (
                <div className="flex items-center gap-1.5 border-t border-border bg-background px-3 py-1.5" role="group" aria-label="Bulk actions">
                    <span className="text-3xs font-semibold" role="status" aria-atomic="true">
                        {checkedList.length} selected<span className="sr-only"> conflicts</span>
                    </span>
                    <span className="text-3xs text-muted-foreground">shift-click = range</span>
                    <div className="ml-auto flex items-center gap-1">
                        {anyEntity && (
                            <Button size="sm" variant="secondary" onClick={() => bulkDecide('keep')}>
                                Keep
                            </Button>
                        )}
                        {anyEntity && (
                            <Button size="sm" variant="destructive" onClick={() => bulkDecide('remove')}>
                                Remove
                            </Button>
                        )}
                        <Button size="sm" variant="secondary" onClick={() => bulkIgnore(!allIgnored)}>
                            {allIgnored ? 'Unignore' : 'Ignore'}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6.5 w-6.5 px-0" aria-label="Clear selection" onClick={clearChecked}>
                            <X aria-hidden="true" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
