import { defineConfig } from 'bumpp'

export default defineConfig({
    files: ['package.json'],
    execute: 'node tools/sync-version.mjs',
    all: true,
    commit: 'chore: release v%s',
    tag: 'v%s',
    push: true
})
