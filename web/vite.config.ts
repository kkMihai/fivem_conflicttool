import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'))

function applyAlpha(color: string, pct: number): string | null {
    const hex = color.match(/^#([0-9a-fA-F]{3,8})$/)
    if (hex) {
        const h = hex[1]
        const full = h.length === 3 || h.length === 4 ? h.split('').map(c => c + c).join('') : h
        if (full.length !== 6 && full.length !== 8) return null
        const r = parseInt(full.slice(0, 2), 16)
        const g = parseInt(full.slice(2, 4), 16)
        const b = parseInt(full.slice(4, 6), 16)
        const base = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1
        return `rgb(${r} ${g} ${b} / ${Math.round(base * pct * 100) / 100}%)`
    }
    const fn = color.match(/^(rgb|hsl)a?\(([^)]*)\)$/)
    if (fn) {
        const parts = fn[2].split('/')[0].trim()
        return `${fn[1]}(${parts} / ${pct}%)`
    }
    return null
}

function unwrapSupports(css: string): { css: string; count: number } {
    const open = /@supports\s*\(\s*color:\s*color-mix\([^)]*\)[^)]*\)\s*\{/g
    let out = ''
    let index = 0
    let count = 0
    let match: RegExpExecArray | null

    while ((match = open.exec(css)) !== null) {
        const bodyStart = match.index + match[0].length
        let depth = 1
        let i = bodyStart
        while (i < css.length && depth > 0) {
            if (css[i] === '{') depth++
            else if (css[i] === '}') depth--
            i++
        }
        if (depth !== 0) break
        out += css.slice(index, match.index) + css.slice(bodyStart, i - 1)
        index = i
        open.lastIndex = i
        count++
    }
    out += css.slice(index)
    return { css: out, count }
}

function flattenColorMix(): Plugin {
    const MIX = /color-mix\(in (?:oklab|srgb|srgb-linear), var\(--([a-z0-9-]+)\) ([\d.]+)%, transparent\)/g

    return {
        name: 'flatten-color-mix',
        enforce: 'post',
        writeBundle(options, bundle) {
            const outDir = options.dir ?? path.resolve(__dirname, 'dist')
            for (const name of Object.keys(bundle)) {
                if (!name.endsWith('.css')) continue
                const file = path.join(outDir, name)
                const css = fs.readFileSync(file, 'utf8')
                const tokens = new Map<string, string>()
                for (const m of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?)\([^)]*\))/g)) {
                    tokens.set(m[1], m[2].trim())
                }

                let flattened = 0
                let missing = 0
                const unwrapped = unwrapSupports(css)
                const out = unwrapped.css.replace(MIX, (whole, token: string, pct: string) => {
                    const value = tokens.get(token)
                    if (!value) {
                        missing++
                        return whole
                    }
                    const withAlpha = applyAlpha(value, Number(pct))
                    if (!withAlpha) {
                        missing++
                        return whole
                    }
                    flattened++
                    return withAlpha
                })
                fs.writeFileSync(file, out)
                console.log(`flatten-color-mix: ${name} ${flattened} replaced, ${unwrapped.count} @supports unwrapped${missing ? `, ${missing} left` : ""}`)
            }
        }
    }
}

export default defineConfig({
    base: './',
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version)
    },
    plugins: [react(), tailwindcss(), flattenColorMix()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src')
        }
    },
    build: {
        target: 'chrome103',
        outDir: 'dist',
        assetsDir: 'assets',
        emptyOutDir: true
    }
})
