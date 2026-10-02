local callbacks = {}
CT = { uiRects = { { 0, 0, 1, 1 } }, uiW = 1920, uiH = 1080 }
RegisterNUICallback = function(name, callback) callbacks[name] = callback end
RegisterNetEvent = function() end
dofile('client/nui.lua')

local function update(data, expected)
    local before = CT.uiRects
    local result
    callbacks.uiRects(data, function(value)
        result = value
        if value then assert(CT.uiW == data.w and CT.uiH == data.h, 'acknowledged before storing viewport') end
    end)
    assert(result == expected, 'unexpected acknowledgment')
    if not expected then assert(CT.uiRects == before and CT.uiW == 1920 and CT.uiH == 1080, 'invalid payload changed geometry') end
end

update(nil, false)
update(false, false)
update({ w = '1920', h = 1080, rects = {} }, false)
update({ w = 0, h = 1080, rects = {} }, false)
update({ w = math.huge, h = 1080, rects = {} }, false)
update({ w = 0 / 0, h = 1080, rects = {} }, false)
update({ w = 1920, h = 1080, rects = false }, false)
update({ w = 1920, h = 1080, rects = { { 0, 0, 1 } } }, false)
update({ w = 1920, h = 1080, rects = { { 0, 0, 1, math.huge } } }, false)
update({ w = 1920, h = 1080, rects = { { 1, 0, 0, 1 } } }, false)
update({ w = 1920, h = 1080, rects = { { 0, 1, 1, 0 } } }, false)
local payload = { w = 2560, h = 1440, rects = { { -0.1, 0, 1.1, 1 } } }
update(payload, true)
payload.rects[1][1] = 1
assert(CT.uiRects[1][1] == -0.1, 'stored rectangle aliases input')
update({ w = 2560, h = 1440, rects = {} }, true)
assert(#CT.uiRects == 0, 'empty hitboxes should allow world interaction')
print('PASS: client hitbox validation')
