CT.Gizmo = {
    active = false,
    entity = nil,
    mode = 'translate',
    pendingMode = nil,
    heldCmd = nil,
    gridSnap = false,
    snapStep = 0.1,
    space = 'global',
    supported = nil
}

local GZ = CT.Gizmo
local dragActive = false

function GZ.EmitSpace()
    SendNUIMessage({ action = 'gizmoSpace', data = GZ.space })
end

local function applyModeNow(mode)
    GZ.pendingMode = nil
    local cmd = mode == 'rotate' and 'gizmoRotation' or (mode == 'scale' and 'gizmoScale' or 'gizmoTranslation')
    if GZ.heldCmd == cmd then return end
    if GZ.heldCmd then
        ExecuteCommand('-' .. GZ.heldCmd)
    end
    ExecuteCommand('+' .. cmd)
    GZ.heldCmd = cmd
end

local function flushPendingMode()
    if GZ.pendingMode then
        applyModeNow(GZ.pendingMode)
    end
end

function GZ.FlushMode()
    flushPendingMode()
end

function GZ.DragStart()
    if not GZ.active or dragActive then return end
    dragActive = true
    ExecuteCommand('+gizmoSelect')
end

function GZ.DragStop()
    if not dragActive then return end
    dragActive = false
    ExecuteCommand('-gizmoSelect')
end

RegisterCommand('+kkctGizmoTranslate', function()
    if not CT.open or CT.typing then return end
    if not GZ.active and not CT.OcclEdit.active then
        SendNUIMessage({ action = 'keybind', data = { key = 'mode', value = 'translate' } })
        return
    end
    GZ.mode = 'translate'
    if CT.OcclEdit.active then CT.OcclEdit.ClearFace() end
    applyModeNow('translate')
    SendNUIMessage({ action = 'gizmoMode', data = 'translate' })
end, false)

RegisterCommand('-kkctGizmoTranslate', function() end, false)

RegisterKeyMapping('+kkctGizmoTranslate', 'Conflict tool: gizmo move mode', 'keyboard', '2')

RegisterCommand('+kkctGizmoRotate', function()
    if not CT.open or CT.typing then return end
    if not GZ.active and not CT.OcclEdit.active then
        SendNUIMessage({ action = 'keybind', data = { key = 'mode', value = 'rotate' } })
        return
    end
    GZ.mode = 'rotate'
    if CT.OcclEdit.active then CT.OcclEdit.ClearFace() end
    applyModeNow('rotate')
    SendNUIMessage({ action = 'gizmoMode', data = 'rotate' })
end, false)

RegisterCommand('-kkctGizmoRotate', function() end, false)

RegisterKeyMapping('+kkctGizmoRotate', 'Conflict tool: gizmo rotate mode', 'keyboard', '3')

RegisterCommand('+kkctGizmoScale', function()
    if not CT.open or CT.typing then return end
    if not CT.OcclEdit.active then return end
    GZ.mode = 'scale'
    if CT.OcclEdit.active then CT.OcclEdit.ClearFace() end
    applyModeNow('scale')
    SendNUIMessage({ action = 'gizmoMode', data = 'scale' })
end, false)

RegisterCommand('-kkctGizmoScale', function() end, false)

RegisterKeyMapping('+kkctGizmoScale', 'Conflict tool: gizmo resize mode', 'keyboard', '4')

RegisterCommand('+kkctGizmoSpace', function()
    if not CT.open or CT.typing then return end
    if not GZ.active and not CT.OcclEdit.active then return end
    GZ.space = GZ.space == 'local' and 'global' or 'local'
    ExecuteCommand('+gizmoLocal')
    GZ.EmitSpace()
end, false)

RegisterCommand('-kkctGizmoSpace', function()
    ExecuteCommand('-gizmoLocal')
end, false)

RegisterKeyMapping('+kkctGizmoSpace', 'Conflict tool: gizmo local or global axes', 'keyboard', 'X')

RegisterCommand('kkct_debug', function()
    local e = GZ.entity
    local pos = e and DoesEntityExist(e) and GetEntityCoords(e) or nil
    print(('[kkct_debug] gizmo active=%s session=%d drag=%s entity=%s exists=%s pos=%s frozen=%s typing=%s overUi=%s mode=%s'):format(
        tostring(GZ.active), session, tostring(dragActive), tostring(e),
        tostring(e and DoesEntityExist(e) or false),
        pos and ('%.2f %.2f %.2f'):format(pos.x, pos.y, pos.z) or 'nil',
        tostring(e and DoesEntityExist(e) and IsEntityPositionFrozen(e) or 'n/a'),
        tostring(CT.typing), tostring(CT.overUi), tostring(CT.mode)))
    if e and DoesEntityExist(e) then
        SetEntityCoordsNoOffset(e, pos.x, pos.y, pos.z + 2.0, false, false, false)
        local after = GetEntityCoords(e)
        print(('[kkct_debug] nudge +2z: now %.2f %.2f %.2f (moved=%s)'):format(after.x, after.y, after.z, tostring(math.abs(after.z - pos.z - 2.0) < 0.01)))
        SetEntityCoordsNoOffset(e, pos.x, pos.y, pos.z, false, false, false)
    end
end, false)

local function makeEntityMatrix(entity)
    local f, r, u, a = GetEntityMatrix(entity)
    local view = DataView.ArrayBuffer(64)
    view:SetFloat32(0, r[1]):SetFloat32(4, r[2]):SetFloat32(8, r[3]):SetFloat32(12, 0)
    view:SetFloat32(16, f[1]):SetFloat32(20, f[2]):SetFloat32(24, f[3]):SetFloat32(28, 0)
    view:SetFloat32(32, u[1]):SetFloat32(36, u[2]):SetFloat32(40, u[3]):SetFloat32(44, 0)
    view:SetFloat32(48, a[1]):SetFloat32(52, a[2]):SetFloat32(56, a[3]):SetFloat32(60, 1)
    return view
end

local function normalize(x, y, z)
    local len = math.sqrt(x * x + y * y + z * z)
    if len == 0 then return 0, 0, 0 end
    return x / len, y / len, z / len
end

local function snap(v)
    local s = GZ.snapStep
    return math.floor(v / s + 0.5) * s
end

local function applyEntityMatrix(entity, view)
    local x1, y1, z1 = view:GetFloat32(16), view:GetFloat32(20), view:GetFloat32(24)
    local x2, y2, z2 = view:GetFloat32(0), view:GetFloat32(4), view:GetFloat32(8)
    local x3, y3, z3 = view:GetFloat32(32), view:GetFloat32(36), view:GetFloat32(40)
    local tx, ty, tz = view:GetFloat32(48), view:GetFloat32(52), view:GetFloat32(56)
    x1, y1, z1 = normalize(x1, y1, z1)
    x2, y2, z2 = normalize(x2, y2, z2)
    x3, y3, z3 = normalize(x3, y3, z3)
    if GZ.gridSnap then
        tx, ty, tz = snap(tx), snap(ty), snap(tz)
    end
    SetEntityMatrix(entity, x1, y1, z1, x2, y2, z2, x3, y3, z3, tx, ty, tz)
end

function GZ.SetMode(mode)
    GZ.mode = mode
    if not GZ.active then return end
    GZ.pendingMode = mode
end

function GZ.SnapToGround()
    if GZ.entity and DoesEntityExist(GZ.entity) then
        PlaceObjectOnGroundProperly_2(GZ.entity)
        GZ.Emit()
    end
end

function GZ.SetTransform(pos, rotDeg)
    if not (GZ.entity and DoesEntityExist(GZ.entity)) then return end
    if pos then
        SetEntityCoordsNoOffset(GZ.entity, pos[1], pos[2], pos[3], false, false, false)
    end
    if rotDeg then
        SetEntityRotation(GZ.entity, rotDeg[1], rotDeg[2], rotDeg[3], 2, true)
    end
    GZ.Emit()
end

function GZ.Emit()
    if not (GZ.entity and DoesEntityExist(GZ.entity)) then return end
    local p = GetEntityCoords(GZ.entity)
    local r = GetEntityRotation(GZ.entity, 2)
    local qx, qy, qz, qw = GetEntityQuaternion(GZ.entity)
    SendNUIMessage({ action = 'gizmoTransform', data = { pos = { p.x, p.y, p.z }, rot = { r.x, r.y, r.z }, quat = { qx, qy, qz, qw } } })
end

local session = 0

function GZ.Start(entity)
    if GZ.active then GZ.Stop(false) end
    GZ.entity = entity
    GZ.active = true
    session = session + 1
    local mySession = session
    GZ.pendingMode = GZ.mode
    GZ.EmitSpace()
    CT.mode = 'transform'
    SetEntityDrawOutline(entity, true)
    if not GZ.supported then
        local ok, res = pcall(function()
            local view = makeEntityMatrix(entity)
            return Citizen.InvokeNative(0xEB2EDCA2, view:Buffer(), 'kk_ct_gizmo_probe', Citizen.ReturnResultAnyway())
        end)
        GZ.supported = ok and res ~= nil
        if not GZ.supported then
            SendNUIMessage({ action = 'notice', data = 'Gizmo native is unavailable, use the numeric inputs to move this object.' })
        end
    end
    CreateThread(function()
        local emitAt = 0
        while GZ.active and session == mySession and DoesEntityExist(entity) do
            Wait(0)
            if not (GZ.active and session == mySession) then break end
            DisableControlAction(0, 24, true)
            DisableControlAction(0, 25, true)
            DisableControlAction(0, 140, true)
            DisablePlayerFiring(PlayerId(), true)
            if dragActive and not IsDisabledControlPressed(0, 24) and not IsControlPressed(0, 24) then
                GZ.DragStop()
            end
            if GZ.supported then
                local view = makeEntityMatrix(entity)
                local changed = Citizen.InvokeNative(0xEB2EDCA2, view:Buffer(), 'kk_ct_gizmo', Citizen.ReturnResultAnyway())
                if changed then
                    applyEntityMatrix(entity, view)
                end
            end
            local now = GetGameTimer()
            if now - emitAt > 100 then
                GZ.Emit()
                emitAt = now
            end
        end
        if dragActive then
            dragActive = false
            ExecuteCommand('-gizmoSelect')
        end
        if DoesEntityExist(entity) then
            SetEntityDrawOutline(entity, false)
        end
        if GZ.active and session == mySession and GZ.entity == entity then
            GZ.Stop(false)
            CT.Preview.Reset()
            CT.ApplyFocus()
            SendNUIMessage({ action = 'gizmoLost' })
        end
    end)
end

function GZ.Stop(commit)
    if not GZ.active then return nil end
    GZ.active = false
    session = session + 1
    GZ.DragStop()
    CT.mode = 'browse'
    local result = nil
    if GZ.entity and DoesEntityExist(GZ.entity) then
        local p = GetEntityCoords(GZ.entity)
        local qx, qy, qz, qw = GetEntityQuaternion(GZ.entity)
        local r = GetEntityRotation(GZ.entity, 2)
        result = { pos = { p.x, p.y, p.z }, quat = { qx, qy, qz, qw }, rot = { r.x, r.y, r.z } }
        SetEntityDrawOutline(GZ.entity, false)
    end
    GZ.entity = nil
    return commit and result or nil
end
