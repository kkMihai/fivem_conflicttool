local callbacks, messages, requests = {}, {}, {}
local focusUpdates = 0
local waits = 0
CT = { open = false, uiRects = {}, uiW = 0, uiH = 0 }
CT.ApplyFocus = function() focusUpdates = focusUpdates + 1 end
CT.WaitForUi = function() waits = waits + 1 end
RegisterNUICallback = function(name, callback) callbacks[name] = callback end
RegisterNetEvent = function() end
SendNUIMessage = function(message) messages[#messages + 1] = message end
TriggerServerEvent = function(event) requests[#requests + 1] = event end
dofile('client/nui.lua')
assert(CT.uiReady == false, 'UI must start unready')

local function ready(session, visible)
    local acknowledged
    callbacks.uiReady({ session = session }, function(value)
        acknowledged = value
        assert(CT.uiReady, 'acknowledged before readiness was stored')
        assert(messages[#messages].action == 'setVisible' and messages[#messages].data == visible, 'visibility was not replayed before acknowledgment')
    end)
    assert(acknowledged == true, 'readiness not acknowledged')
end

ready('first', false)
assert(#requests == 0, 'closed tool requested state')
CT.open = true
ready('first', true)
assert(requests[#requests] == 'kk_ct:getState', 'late readiness did not request state')
CT.uiW, CT.uiH = 1920, 1080
CT.uiRects = { { 0, 0, 1, 1 } }
CT.typing, CT.camLook, CT.overUi = true, true, false
callbacks.uiUnloaded({ session = 'first' }, function(value) assert(value == true) end)
assert(not CT.uiReady and CT.uiW == 0 and CT.uiH == 0 and #CT.uiRects == 0, 'unload kept stale geometry')
assert(not CT.typing and not CT.camLook and CT.overUi and focusUpdates == 1, 'unload did not restore UI input')
assert(waits == 1, 'unload did not rearm the UI loading timeout')
ready('second', true)
callbacks.uiUnloaded({ session = 'first' }, function(value) assert(value == false) end)
assert(CT.uiReady, 'late unload invalidated the new page')
assert(waits == 1, 'stale unload restarted the loading timeout')
CT.open = false
ready('second', false)
assert(messages[#messages].data == false, 'closed visibility was not replayed')
print('PASS: client readiness and reload replay')
