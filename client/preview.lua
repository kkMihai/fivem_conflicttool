CT.Preview = {
    hides = {},
    ghost = nil,
    ghostModel = nil,
    group = nil
}

local PV = CT.Preview

function PV.Hide(model, pos, radius)
    local r = (radius or 0.25) + 0.0
    local x, y, z = pos[1] + 0.0, pos[2] + 0.0, pos[3] + 0.0
    CreateModelHideExcludingScriptObjects(x, y, z, r, model, true)
    local h = { x = x, y = y, z = z, r = r, hash = model, obj = nil }
    local obj = GetClosestObjectOfType(x, y, z, r + 0.5, model, false, false, false)
    if obj and obj ~= 0 and not DoesEntityBelongToThisScript(obj, true) then
        SetEntityVisible(obj, false, false)
        SetEntityCollision(obj, false, false)
        h.obj = obj
    end
    PV.hides[#PV.hides + 1] = h
end

local function unhide(h)
    RemoveModelHide(h.x, h.y, h.z, h.r, h.hash, false)
    if h.obj and DoesEntityExist(h.obj) and GetEntityModel(h.obj) == h.hash then
        SetEntityVisible(h.obj, true, false)
        SetEntityCollision(h.obj, true, true)
    end
end

function PV.SpawnGhost(model, pos, rot)
    PV.RemoveGhost()
    if not IsModelValid(model) then return nil end
    RequestModel(model)
    local deadline = GetGameTimer() + 5000
    while not HasModelLoaded(model) and GetGameTimer() < deadline do
        Wait(10)
    end
    if not HasModelLoaded(model) then return nil end
    local obj = CreateObjectNoOffset(model, pos[1] + 0.0, pos[2] + 0.0, pos[3] + 0.0, false, false, false)
    if not obj or obj == 0 then return nil end
    if rot then
        SetEntityQuaternion(obj, rot[1] + 0.0, rot[2] + 0.0, rot[3] + 0.0, rot[4] + 0.0)
    end
    FreezeEntityPosition(obj, true)
    SetEntityCollision(obj, false, false)
    SetEntityAlpha(obj, 210, false)
    SetModelAsNoLongerNeeded(model)
    PV.ghost = obj
    PV.ghostModel = model
    return obj
end

function PV.StartLiveGroup(entries, anchorIndex)
    PV.RestoreGroup()
    local used = {}
    local group = { objects = {}, anchor = nil, origin = nil }
    local missing = 0
    for index, item in ipairs(entries) do
        local p = item.pos
        local obj = GetClosestObjectOfType(p[1] + 0.0, p[2] + 0.0, p[3] + 0.0, 0.75, item.model, false, false, false)
        if obj and obj ~= 0 and not used[obj] and DoesEntityExist(obj) and
            (GetEntityModel(obj) & 0xffffffff) == (item.model & 0xffffffff) and
            not DoesEntityBelongToThisScript(obj, true) then
            local at = GetEntityCoords(obj)
            local dx, dy, dz = at.x - p[1], at.y - p[2], at.z - p[3]
            if dx * dx + dy * dy + dz * dz <= 0.75 * 0.75 then
                local qx, qy, qz, qw = GetEntityQuaternion(obj)
                used[obj] = true
                group.objects[#group.objects + 1] = { h = obj, model = item.model, pos = { at.x, at.y, at.z }, rot = { qx, qy, qz, qw } }
                if item.index == anchorIndex then
                    group.anchor = obj
                    group.origin = { at.x, at.y, at.z }
                end
            else
                missing = missing + 1
            end
        else
            missing = missing + 1
        end
        if index % 25 == 0 then Wait(0) end
    end
    if not group.anchor then return nil, missing end
    PV.group = group
    return group.anchor, missing
end

function PV.MoveGroup(anchorPos)
    local group = PV.group
    if not group then return end
    local origin = group.origin
    local dx, dy, dz = anchorPos.x - origin[1], anchorPos.y - origin[2], anchorPos.z - origin[3]
    for _, item in ipairs(group.objects) do
        if item.h ~= group.anchor and DoesEntityExist(item.h) and (GetEntityModel(item.h) & 0xffffffff) == (item.model & 0xffffffff) then
            local p = item.pos
            SetEntityCoordsNoOffset(item.h, p[1] + dx, p[2] + dy, p[3] + dz, false, false, false)
        end
    end
end

function PV.RestoreGroup()
    local group = PV.group
    PV.group = nil
    if not group then return end
    for _, item in ipairs(group.objects) do
        if DoesEntityExist(item.h) and (GetEntityModel(item.h) & 0xffffffff) == (item.model & 0xffffffff) then
            local p, r = item.pos, item.rot
            SetEntityCoordsNoOffset(item.h, p[1], p[2], p[3], false, false, false)
            SetEntityQuaternion(item.h, r[1], r[2], r[3], r[4])
        end
    end
end

function PV.RemoveGhost()
    local g, m = PV.ghost, PV.ghostModel
    PV.ghost = nil
    PV.ghostModel = nil
    if g and DoesEntityExist(g) and (GetEntityModel(g) & 0xffffffff) == (m & 0xffffffff) then
        SetEntityAsMissionEntity(g, true, true)
        DeleteEntity(g)
        if DoesEntityExist(g) then DeleteObject(g) end
    end
end

function PV.ClearTransform()
    PV.RemoveGhost()
    PV.RestoreGroup()
end

function PV.Reset()
    for _, h in ipairs(PV.hides) do
        unhide(h)
    end
    PV.hides = {}
    PV.ClearTransform()
    CT.ReapplyDecisions()
end

AddEventHandler('onResourceStop', function(res)
    if res == GetCurrentResourceName() then
        for _, h in ipairs(PV.hides) do
            unhide(h)
        end
        PV.ClearTransform()
    end
end)
