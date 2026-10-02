export interface UiRects {
    rects: number[][]
    w: number
    h: number
}

export function readUiRects(document: Document, viewport: Pick<Window, 'innerWidth' | 'innerHeight'>): UiRects {
    const w = viewport.innerWidth || 1
    const h = viewport.innerHeight || 1
    const rects = document.querySelector('[role="dialog"],[role="menu"],[role="listbox"]')
        ? [[0, 0, 1, 1]]
        : Array.from(document.querySelectorAll('[data-panel]'))
            .map(el => el.getBoundingClientRect())
            .filter(r => r.width > 1 && r.height > 1)
            .map(r => [r.left / w, r.top / h, r.right / w, r.bottom / h])
    return { rects, w, h }
}
