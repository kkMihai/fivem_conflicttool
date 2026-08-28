import { useStore } from "@/store/use-store";

export function Legend() {
  const collisionTris = useStore((s) => s.collisionTris);
  const collViz = useStore((s) => s.collViz);
  const selectedId = useStore((s) => s.selectedId);
  const conflicts = useStore((s) => s.conflicts);
  const selected = conflicts.find((c) => c.id === selectedId);
  const showColl = collViz || collisionTris > 0;
  const showOccl = !!(selected && selected.boxes && selected.boxes.length);

  const items: [string, string][] = [
    ["bg-res-a", "Resource A"],
    ["bg-res-b", "Resource B"],
    ["bg-cat-vanilla", "Vanilla"],
  ];
  return (
    <div data-panel="" className="chip-glass pointer-events-auto flex items-center gap-3 rounded-lg px-3 py-1.5" role="group" aria-label="Marker legend">
      <span className="text-3xs font-bold text-muted-foreground">
        LEGEND
      </span>
      {items.map(([color, label]) => (
        <span key={label} className="flex items-center gap-1.5 text-3xs">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${color}`} />
          {label}
        </span>
      ))}
      {showColl && (
        <span className="flex items-center gap-1.5 text-3xs text-cat-coll">
          <span aria-hidden="true" className="h-2 w-2 rounded-sm bg-cat-coll" />
          Active Collision Mesh
        </span>
      )}
      {showOccl && (
        <span className="flex items-center gap-1.5 text-3xs text-cat-occl">
          <span aria-hidden="true" className="h-2 w-2 rounded-sm bg-cat-occl" />
          Occluder Box
        </span>
      )}
    </div>
  );
}
