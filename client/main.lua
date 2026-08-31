local function setCursorMode(on)
    if on == CT.cursorMode then return end
    CT.cursorMode = on
    if on then
        EnterCursorMode()
    else
        LeaveCursorMode()
    end
end

function CT.ApplyFocus()
    if not CT.open then
        setCursorMode(false)
        SetNuiFocus(false, false)
        return
    end
    if CT.camLook then
        CT.overUi = false
        setCursorMode(false)
        SetNuiFocus(false, false)
        return
    end
    if CT.typing or CT.overUi then
        SetNuiFocus(true, true)
        SetNuiFocusKeepInput(not CT.typing)
        setCursorMode(false)
        if CT.typing then
            CT.Freecam.ClearMove()
        end
        return
    end
    setCursorMode(true)
    SetNuiFocus(false, false)
end

CreateThread(function()
    while true do
        if CT.open and not CT.camLook and not CT.typing then
            Wait(0)
            local w, h = CT.uiW, CT.uiH
            if w > 0 and h > 0 then
                local cx, cy = GetNuiCursorPosition()
                local nx, ny = cx / w, cy / h
                local m = CT.overUi and 0.006 or 0.0
                local over = false
                local rects = CT.uiRects
                for i = 1, #rects do
                    local r = rects[i]
                    if nx >= r[1] - m and nx <= r[3] + m and ny >= r[2] - m and ny <= r[4] + m then
                        over = true
                        break
                    end
                end
                if over ~= CT.overUi then
                    CT.overUi = over
                    CT.ApplyFocus()
                end
            end
        else
            Wait(120)
        end
    end
end)

local radarWasVisible = true

function CT.Open()
    if CT.open then return end
    CT.open = true
    radarWasVisible = not IsRadarHidden()
    DisplayRadar(false)
    CT.typing = false
    CT.overUi = true
    CT.camLook = false
    CT.picking = true
    CT.NuiSend('setVisible', true)
    CT.ApplyFocus()
    CreateThread(function()
        local ok, err = pcall(CT.Freecam.Start)
        if not ok then
            print('[fivem_conflicttool] freecam error: ' .. tostring(err))
        end
    end)
    TriggerServerEvent('kk_ct:getState')
end

function CT.Close()
    if not CT.open then return end
    CT.open = false
    DisplayRadar(radarWasVisible)
    CT.picking = false
    CT.OcclEdit.Stop(true)
    CT.CollEdit.Stop(true)
    CT.FaceSel.Stop()
    CT.Gizmo.Stop(false)
    CT.Preview.Reset()
    CT.CollisionViz.Clear()
    CT.Freecam.Stop()
    setCursorMode(false)
    SetNuiFocus(false, false)
    CT.NuiSend('setVisible', false)
end

local function bindTap(cmd, desc, key, fn)
    RegisterCommand(cmd, function()
        if not CT.open or CT.typing then return end
        fn()
    end, false)
    RegisterKeyMapping(cmd, desc, 'keyboard', key)
end

RegisterCommand('+kkctPrimary', function()
    if not CT.open or CT.typing or CT.overUi then return end
    CT.Gizmo.FlushMode()
    if CT.Gizmo.active then
        CT.Gizmo.DragStart()
    elseif CT.OcclEdit.active then
        CT.OcclEdit.DragStart()
    elseif CT.CollEdit.active then
        CT.CollEdit.DragStart()
    elseif CT.FaceSel.moving then
        CT.FaceSel.GizmoDragStart()
    elseif CT.FaceSel.active then
        CT.FaceSel.Press()
    else
        CT.Picking.Click()
    end
end, false)

RegisterCommand('-kkctPrimary', function()
    CT.Gizmo.DragStop()
    CT.OcclEdit.DragStop()
    CT.CollEdit.DragStop()
    CT.FaceSel.GizmoDragStop()
    CT.FaceSel.Release()
end, false)

RegisterKeyMapping('+kkctPrimary', 'Conflict tool: select object / drag gizmo', 'MOUSE_BUTTON', 'MOUSE_LEFT')

local lookAt = 0
local lookYaw, lookPitch = 0.0, 0.0

local function camAngles()
    if CT.Freecam.active then
        return CT.Freecam.rot.z, CT.Freecam.rot.x
    end
    local r = GetGameplayCamRot(2)
    return r.z, r.x
end

local function angleDelta(a, b)
    local d = (a - b) % 360.0
    if d > 180.0 then d = 360.0 - d end
    return d
end

RegisterCommand('+kkctLook', function()
    if not CT.open or CT.typing or CT.overUi then return end
    CT.Gizmo.FlushMode()
    lookAt = GetGameTimer()
    lookYaw, lookPitch = camAngles()
    CT.camLook = true
    CT.ApplyFocus()
end, false)

RegisterCommand('-kkctLook', function()
    if not CT.camLook then return end
    CT.camLook = false
    CT.ApplyFocus()
    local yaw, pitch = camAngles()
    if GetGameTimer() - lookAt < 260 and angleDelta(yaw, lookYaw) < 2.0 and angleDelta(pitch, lookPitch) < 2.0 then
        CT.Picking.Context()
    end
end, false)

RegisterKeyMapping('+kkctLook', 'Conflict tool: hold to look around', 'MOUSE_BUTTON', 'MOUSE_RIGHT')

bindTap('kkctHideUi', 'Conflict tool: hide or show UI', 'H', function()
    CT.NuiSend('keybind', { key = 'hideui' })
end)

bindTap('kkctNext', 'Conflict tool: next conflict', 'TAB', function()
    CT.NuiSend('keybind', { key = 'tab' })
end)

bindTap('kkctKeep', 'Conflict tool: keep selected', 'K', function()
    CT.NuiSend('keybind', { key = 'keep' })
end)

bindTap('kkctRemove', 'Conflict tool: remove selected', 'R', function()
    CT.NuiSend('keybind', { key = 'remove' })
end)

bindTap('kkctGrid', 'Conflict tool: toggle grid snap', 'G', function()
    CT.Gizmo.gridSnap = not CT.Gizmo.gridSnap
    CT.NuiSend('keybind', { key = 'grid', value = CT.Gizmo.gridSnap })
end)

bindTap('kkctGround', 'Conflict tool: snap object to ground', 'F', function()
    if CT.mode == 'transform' then
        CT.Gizmo.SnapToGround()
    end
end)

bindTap('kkctCommit', 'Conflict tool: finish transform', 'RETURN', function()
    if CT.FaceSel.moving then
        CT.FaceSel.ApplyMove()
    elseif CT.OcclEdit.active then
        CT.OcclEdit.Apply()
    elseif CT.CollEdit.active then
        CT.CollEdit.Apply()
    elseif CT.mode == 'transform' then
        CT.NuiSend('keybind', { key = 'commit' })
    end
end)

bindTap('kkctReview', 'Conflict tool: review mode', '1', function()
    CT.NuiSend('keybind', { key = 'mode', value = 'review' })
end)

RegisterCommand('conflicttool', function()
    if CT.open then
        CT.Close()
    else
        TriggerServerEvent('kk_ct:auth')
    end
end, false)

TriggerEvent('chat:addSuggestion', '/conflicttool', 'Open the map conflict tool')

RegisterNetEvent('kk_ct:authResult', function(ok)
    if ok then
        CT.Open()
    else
        TriggerEvent('chat:addMessage', { color = { 239, 68, 68 }, args = { 'fivem_conflicttool', 'No permission (ace fivem_conflicttool)' } })
    end
end)

CreateThread(function()
    while true do
        if CT.open then
            Wait(0)
            DisplayRadar(false)
            DisableAllControlActions(0)
            EnableControlAction(0, 245, true)
            if not CT.typing and IsDisabledControlPressed(0, 36) and IsDisabledControlJustPressed(0, 20) then
                CT.NuiSend('keybind', { key = 'undo' })
            end
            if CT.FaceSel.active and not CT.overUi and not CT.typing then
                CT.FaceSel.Tick()
                if IsDisabledControlJustPressed(0, 241) then
                    CT.FaceSel.SetBrush(0.2)
                elseif IsDisabledControlJustPressed(0, 242) then
                    CT.FaceSel.SetBrush(-0.2)
                end
            end
        else
            Wait(300)
        end
    end
end)

AddEventHandler('onResourceStop', function(res)
    if res == GetCurrentResourceName() then
        if CT.open then
            setCursorMode(false)
            SetNuiFocus(false, false)
            CT.Freecam.Stop()
            DisplayRadar(radarWasVisible)
        end
    end
end)
