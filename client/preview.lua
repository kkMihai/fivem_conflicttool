CT.Preview = {
    hides = {},
    ghost = nil,
    ghostModel = nil
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

function PV.RemoveGhost()
    local g, m = PV.ghost, PV.ghostModel
    PV.ghost = nil
    PV.ghostModel = nil
    if g and DoesEntityExist(g) and GetEntityModel(g) == m then
        SetEntityAsMissionEntity(g, false, true)
        DeleteEntity(g)
    end
end

function PV.Reset()
    for _, h in ipairs(PV.hides) do
        unhide(h)
    end
    PV.hides = {}
    PV.RemoveGhost()
    CT.ReapplyDecisions()
end

AddEventHandler('onResourceStop', function(res)
    if res == GetCurrentResourceName() then
        for _, h in ipairs(PV.hides) do
            unhide(h)
        end
        PV.RemoveGhost()
    end
end)
