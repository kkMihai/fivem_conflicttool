fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'fivem_conflicttool'
author 'kkMihai'
version '1.2.6'
description 'in-game map conflict scanner and resolver'
repository 'https://github.com/kkMihai/fivem_conflicttool'
license 'GPL-3.0-only'

ui_page 'web/dist/index.html'

client_scripts {
    'client/state.lua',
    'client/dataview.lua',
    'client/enforcement.lua',
    'client/freecam.lua',
    'client/markers.lua',
    'client/picking.lua',
    'client/gizmo.lua',
    'client/occledit.lua',
    'client/preview.lua',
    'client/collisionviz.lua',
    'client/colledit.lua',
    'client/facesel.lua',
    'client/nui.lua',
    'client/main.lua'
}

server_scripts {
    'server/lib/joaat.js',
    'server/lib/rsc7.js',
    'server/lib/meta.js',
    'server/lib/ymap.js',
    'server/lib/ytyp.js',
    'server/lib/collmats.js',
    'server/lib/ybn.js',
    'server/lib/collision.js',
    'server/lib/assetkind.js',
    'server/lib/occlusion.js',
    'server/lib/names.js',
    'server/decisions.js',
    'server/ignores.js',
    'server/scanner.js',
    'server/conflicts.js',
    'server/resolver.js',
    'server/backups.js',
    'server/version.js',
    'server/main.js'
}

files {
    'web/dist/index.html',
    'web/dist/assets/*'
}
