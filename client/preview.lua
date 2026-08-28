CT.Preview = {
    hides = {},
    ghost = nil,
    ghostModel = nil
}

local PV = CT.Preview

function PV.Hide(model, pos, radius)
    local r = radius or 0.25
    CT.HideInstance(model, pos, r)
    PV.hides[#PV.hides + 1] = { x = pos[1], y = pos[2], z = pos[3], r = r, hash = model }
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
    local obj = CreateObjectNoOffset(model, pos[1], pos[2], pos[3], false, false, false)
    if not obj or obj == 0 then return nil end
    if rot then
        SetEntityQuaternion(obj, rot[1], rot[2], rot[3], rot[4])
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
    if PV.ghost and DoesEntityExist(PV.ghost) then
        SetEntityAsMissionEntity(PV.ghost, false, true)
        DeleteEntity(PV.ghost)
    end
    PV.ghost = nil
    PV.ghostModel = nil
end

function PV.Reset()
    for _, h in ipairs(PV.hides) do
        RemoveModelHide(h.x, h.y, h.z, h.r, h.hash, false)
    end
    PV.hides = {}
    PV.RemoveGhost()
    CT.ReapplyDecisions()
end

AddEventHandler('onResourceStop', function(res)
    if res == GetCurrentResourceName() then
        for _, h in ipairs(PV.hides) do
            RemoveModelHide(h.x, h.y, h.z, h.r, h.hash, false)
        end
        PV.RemoveGhost()
    end
end)
