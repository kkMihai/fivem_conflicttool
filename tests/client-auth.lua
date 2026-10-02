local tests = 0

local function fixture(ready, hidden)
    local commands, events, handlers = {}, {}, {}
    local calls = { server = {}, chat = {}, logs = {}, notifications = {}, nui = {}, threads = {}, stopped = {} }
    local timers, now, notification = {}, 0, nil
    local env = setmetatable({}, { __index = _G })
    local ct = {
        open = false,
        uiReady = ready == true,
        cursorMode = false,
        typing = false,
        overUi = false,
        camLook = false,
        uiW = 0,
        uiH = 0,
        uiRects = {},
        Freecam = {
            Start = function() calls.started = (calls.started or 0) + 1 end,
            Stop = function() calls.stopped.freecam = true end,
            ClearMove = function() end
        },
        NuiSend = function(action, data) calls.nui[#calls.nui + 1] = { action, data } end
    }
    for _, name in ipairs({ 'OcclEdit', 'CollEdit', 'FaceSel', 'Gizmo', 'Preview', 'CollisionViz' }) do
        ct[name] = {
            Stop = function() calls.stopped[name] = true end,
            Reset = function() calls.stopped[name] = true end,
            Clear = function() calls.stopped[name] = true end
        }
    end
    env.CT = ct
    env.SetNuiFocus = function(on, cursor) calls.focus = { on, cursor } end
    env.SetNuiFocusKeepInput = function(on) calls.keepInput = on end
    env.EnterCursorMode = function() calls.cursor = true end
    env.LeaveCursorMode = function() calls.cursor = false end
    env.IsRadarHidden = function() return hidden == true end
    env.DisplayRadar = function(on) calls.radar = on end
    env.RegisterCommand = function(name, callback) commands[name] = callback end
    env.RegisterKeyMapping = function() end
    env.RegisterNetEvent = function(name, callback) events[name] = callback end
    env.AddEventHandler = function(name, callback) handlers[name] = callback end
    env.GetCurrentResourceName = function() return 'fivem_conflicttool' end
    env.TriggerServerEvent = function(name, ...) calls.server[#calls.server + 1] = { name, ... } end
    env.TriggerEvent = function(name, data)
        if name == 'chat:addMessage' then calls.chat[#calls.chat + 1] = data end
    end
    env.CreateThread = function(callback) calls.threads[#calls.threads + 1] = callback end
    env.SetTimeout = function(delay, callback) timers[#timers + 1] = { at = now + delay, callback = callback } end
    env.GetGameTimer = function() return now end
    env.BeginTextCommandThefeedPost = function(command)
        assert(command == 'STRING')
        notification = ''
    end
    env.AddTextComponentSubstringPlayerName = function(text) notification = notification .. text end
    env.EndTextCommandThefeedPostTicker = function()
        calls.notifications[#calls.notifications + 1] = notification
    end
    env.print = function(text) calls.logs[#calls.logs + 1] = text end
    assert(loadfile('client/main.lua', 't', env))()
    local function advance(ms)
        local target = now + ms
        while true do
            local index
            for i, timer in ipairs(timers) do
                if timer.at <= target and (not index or timer.at < timers[index].at) then index = i end
            end
            if not index then break end
            local timer = table.remove(timers, index)
            now = timer.at
            timer.callback()
        end
        now = target
    end
    return { ct = ct, calls = calls, command = commands.conflicttool, result = events['kk_ct:authResult'],
        stop = handlers.onResourceStop, advance = advance }
end

local function test(name, callback)
    callback()
    tests = tests + 1
    print('PASS ' .. name)
end

local function request(f)
    f.command()
    local event = f.calls.server[#f.calls.server]
    assert(event[1] == 'kk_ct:auth')
    assert(type(event[2]) == 'number')
    return event[2]
end

local function failure(f, word)
    assert(not f.ct.open)
    assert(#f.calls.notifications == 1)
    assert(#f.calls.chat == 1)
    assert(#f.calls.logs == 1)
    assert(f.calls.logs[1]:find('/conflicttool', 1, true))
    assert(f.calls.logs[1]:find(word, 1, true))
end

test('unsolicited results do not open or notify', function()
    local f = fixture(true)
    f.result(true, nil, 1)
    f.result(false, 'denied', 1)
    assert(not f.ct.open)
    assert(#f.calls.notifications == 0 and #f.calls.logs == 0)
end)

test('pending commands send one request', function()
    local f = fixture(true)
    request(f)
    f.command()
    assert(#f.calls.server == 1)
    f.advance(9999)
    assert(#f.calls.notifications == 0)
end)

test('permission denial notifies and allows retry', function()
    local f = fixture(true)
    local id = request(f)
    f.result(false, 'denied', id)
    failure(f, 'denied')
    assert(f.calls.notifications[1]:find('No permission', 1, true))
    assert(request(f) ~= id)
end)

test('server initialization failure differs from denial', function()
    local f = fixture(true)
    f.result(false, 'unavailable', request(f))
    failure(f, 'unavailable')
    assert(f.calls.notifications[1]:find('unavailable', 1, true))
end)

test('authorization timeout notifies and ignores late result', function()
    local f = fixture(true)
    local id = request(f)
    f.advance(10000)
    failure(f, 'timed out')
    assert(f.calls.notifications[1]:find('did not respond', 1, true))
    f.result(true, nil, id)
    assert(not f.ct.open)
    assert(#f.calls.notifications == 1)
end)

test('retry rejects earlier correlated response', function()
    local f = fixture(true)
    local first = request(f)
    f.advance(10000)
    local second = request(f)
    f.result(true, nil, first)
    assert(not f.ct.open)
    f.result(true, nil, second)
    assert(f.ct.open)
end)

test('legacy boolean response is accepted only while pending', function()
    local f = fixture(true)
    request(f)
    f.result(true)
    assert(f.ct.open)
    f.ct.Close()
    f.result(true)
    assert(not f.ct.open)
end)

test('successful authorization preserves open and close workflow', function()
    local f = fixture(true)
    f.result(true, nil, request(f))
    assert(f.ct.open and f.ct.picking)
    assert(f.calls.focus[1] and f.calls.keepInput and not f.calls.radar)
    assert(f.calls.server[2][1] == 'kk_ct:getState')
    f.calls.threads[#f.calls.threads]()
    assert(f.calls.started == 1)
    f.command()
    assert(not f.ct.open and not f.ct.picking)
    assert(not f.calls.focus[1] and not f.calls.keepInput and f.calls.radar)
    assert(f.calls.nui[#f.calls.nui][1] == 'setVisible' and f.calls.nui[#f.calls.nui][2] == false)
    for _, name in ipairs({ 'freecam', 'OcclEdit', 'CollEdit', 'FaceSel', 'Gizmo', 'Preview', 'CollisionViz' }) do
        assert(f.calls.stopped[name])
    end
    f.advance(10000)
    assert(#f.calls.notifications == 0)
end)

test('close clears pending authorization while already closed', function()
    local f = fixture(true)
    local id = request(f)
    f.ct.Close()
    f.result(true, nil, id)
    f.advance(10000)
    assert(not f.ct.open and #f.calls.notifications == 0)
    assert(request(f) ~= id)
end)

test('closed session cannot start a delayed camera thread', function()
    local f = fixture(true)
    f.result(true, nil, request(f))
    local start = f.calls.threads[#f.calls.threads]
    f.ct.Close()
    start()
    assert(f.calls.started == nil)
end)

test('resource stop clears pending timers and restores open focus', function()
    local f = fixture(true)
    local id = request(f)
    f.stop('other_resource')
    f.result(true, nil, id)
    assert(f.ct.open)
    f.stop('fivem_conflicttool')
    assert(not f.calls.focus[1] and not f.calls.keepInput and f.calls.radar)
    assert(f.calls.stopped.freecam)
    f.advance(10000)
    assert(#f.calls.notifications == 0)
    local pending = fixture(true)
    local pendingId = request(pending)
    pending.stop('fivem_conflicttool')
    pending.result(true, nil, pendingId)
    pending.advance(10000)
    assert(not pending.ct.open and #pending.calls.notifications == 0)
end)

test('missing UI handshake times out and restores hidden radar state', function()
    local f = fixture(false, true)
    f.result(true, nil, request(f))
    assert(f.ct.open)
    f.advance(10000)
    failure(f, 'UI load timed out')
    assert(not f.calls.focus[1] and not f.calls.keepInput and not f.calls.radar)
    assert(f.calls.stopped.freecam)
end)

test('UI handshake cancels loading failure and previous open timer stays stale', function()
    local f = fixture(false)
    f.result(true, nil, request(f))
    f.advance(5000)
    f.ct.Close()
    f.result(true, nil, request(f))
    f.advance(5000)
    assert(f.ct.open and #f.calls.notifications == 0)
    f.ct.uiReady = true
    f.advance(5000)
    assert(f.ct.open and #f.calls.notifications == 0)
end)

test('UI reload after initial timeout still closes failed loading', function()
    local f = fixture(true)
    f.result(true, nil, request(f))
    f.advance(10000)
    assert(f.ct.open and #f.calls.notifications == 0)
    f.ct.uiReady = false
    f.ct.WaitForUi()
    f.advance(9999)
    assert(f.ct.open and #f.calls.notifications == 0)
    f.advance(1)
    failure(f, 'UI load timed out')
    assert(not f.calls.focus[1] and not f.calls.keepInput and f.calls.radar)
    assert(f.calls.stopped.freecam)
end)

test('earlier UI reload timer cannot close replacement loading period', function()
    local f = fixture(true)
    f.result(true, nil, request(f))
    f.advance(10000)
    f.ct.uiReady = false
    f.ct.WaitForUi()
    f.advance(5000)
    f.ct.uiReady = true
    f.ct.uiReady = false
    f.ct.WaitForUi()
    f.advance(5000)
    assert(f.ct.open and #f.calls.notifications == 0)
    f.advance(5000)
    failure(f, 'UI load timed out')
    assert(not f.calls.focus[1] and not f.calls.keepInput and f.calls.radar)
end)

print(('%d client authorization tests passed'):format(tests))
