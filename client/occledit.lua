CT.OcclEdit = { active = false }

local OE = CT.OcclEdit
local data = nil
local orig = nil
local cur = nil
local dragActive = false

local function round3(v)
    return math.floor(v * 1000 + 0.5) / 1000
end

local function clampSize(v)
    return math.max(0.5, math.min(2000.0, v))
end

local function clampPos(v)
    return math.max(-8000.0, math.min(8000.0, v))
end

local function makeMatrix()
    local view = DataView.ArrayBuffer(64)
    view:SetFloat32(0, cur.cz * cur.l):SetFloat32(4, cur.sz * cur.l):SetFloat32(8, 0.0):SetFloat32(12, 0.0)
    view:SetFloat32(16, -cur.sz * cur.w):SetFloat32(20, cur.cz * cur.w):SetFloat32(24, 0.0):SetFloat32(28, 0.0)
    view:SetFloat32(32, 0.0):SetFloat32(36, 0.0):SetFloat32(40, cur.h):SetFloat32(44, 0.0)
    view:SetFloat32(48, cur.c[1]):SetFloat32(52, cur.c[2]):SetFloat32(56, cur.c[3]):SetFloat32(60, 1.0)
    return view
end

local function readMatrix(view)
    local rx, ry, rz = view:GetFloat32(0), view:GetFloat32(4), view:GetFloat32(8)
    local fx, fy, fz = view:GetFloat32(16), view:GetFloat32(20), view:GetFloat32(24)
    local ux, uy, uz = view:GetFloat32(32), view:GetFloat32(36), view:GetFloat32(40)
    local tx, ty, tz = view:GetFloat32(48), view:GetFloat32(52), view:GetFloat32(56)
    local hl = math.sqrt(rx * rx + ry * ry)
    if hl > 0.0001 then
        cur.cz, cur.sz = rx / hl, ry / hl
    end
    cur.l = clampSize(math.sqrt(rx * rx + ry * ry + rz * rz))
    cur.w = clampSize(math.sqrt(fx * fx + fy * fy + fz * fz))
    cur.h = clampSize(math.sqrt(ux * ux + uy * uy + uz * uz))
    cur.c[1], cur.c[2], cur.c[3] = clampPos(tx), clampPos(ty), clampPos(tz)
end

local function vizBox()
    local occl = CT.CollisionViz.occl
    if not (data and occl) then return nil end
    return occl[data.target + 1]
end

local function writeViz(v)
    local b = vizBox()
    if not b then return end
    b.c = { v.c[1], v.c[2], v.c[3] }
    b.l, b.w, b.h = v.l, v.w, v.h
    b.cz, b.sz = v.cz, v.sz
end

function OE.DragStart()
    if not OE.active or dragActive then return end
    dragActive = true
    ExecuteCommand('+gizmoSelect')
end

function OE.DragStop()
    if not dragActive then return end
    dragActive = false
    ExecuteCommand('-gizmoSelect')
end

function OE.Start(d)
    if not (d and d.boxes and type(d.target) == 'number') then
        return false, 'This conflict has no occluder boxes.'
    end
    local box = d.boxes[d.target + 1]
    if not (box and box.c) then
        return false, 'That occluder was not found.'
    end
    if OE.active then
        OE.Stop(true)
    end
    if CT.Gizmo.active then
        CT.Gizmo.Stop(false)
        CT.Preview.Reset()
    end
    if CT.Gizmo.supported == nil then
        local view = DataView.ArrayBuffer(64)
        view:SetFloat32(0, 1.0):SetFloat32(20, 1.0):SetFloat32(40, 1.0):SetFloat32(60, 1.0)
        local ok, res = pcall(function()
            return Citizen.InvokeNative(0xEB2EDCA2, view:Buffer(), 'kk_ct_gizmo_probe', Citizen.ReturnResultAnyway())
        end)
        CT.Gizmo.supported = ok and res ~= nil
    end
    if not CT.Gizmo.supported then
        return false, 'The gizmo native is unavailable on this server build, this editor needs it.'
    end
    data = d
    local cz, sz = box.cz or 1.0, box.sz or 0.0
    local len = math.sqrt(cz * cz + sz * sz)
    if len > 0.001 then
        cz, sz = cz / len, sz / len
    else
        cz, sz = 1.0, 0.0
    end
    orig = { c = { box.c[1], box.c[2], box.c[3] }, l = box.l, w = box.w, h = box.h, cz = cz, sz = sz }
    cur = { c = { box.c[1], box.c[2], box.c[3] }, l = clampSize(box.l or 1.0), w = clampSize(box.w or 1.0), h = clampSize(box.h or 1.0), cz = cz, sz = sz }
    OE.active = true
    CT.mode = 'transform'
    if CT.Gizmo.mode == 'scale' then
        CT.Gizmo.mode = 'translate'
    end
    CT.Gizmo.pendingMode = CT.Gizmo.mode
    CreateThread(function()
        local emitAt = 0
        while OE.active do
            Wait(0)
            DisableControlAction(0, 24, true)
            DisableControlAction(0, 25, true)
            DisableControlAction(0, 140, true)
            DisablePlayerFiring(PlayerId(), true)
            local view = makeMatrix()
            local changed = Citizen.InvokeNative(0xEB2EDCA2, view:Buffer(), 'kk_ct_occl', Citizen.ReturnResultAnyway())
            if changed then
                readMatrix(view)
                writeViz(cur)
            end
            local now = GetGameTimer()
            if now - emitAt > 100 then
                emitAt = now
                CT.NuiSend('occlEditLive', { l = round3(cur.l), w = round3(cur.w), h = round3(cur.h) })
            end
        end
    end)
    writeViz(cur)
    return true
end

function OE.Apply()
    if not OE.active then return end
    local d = data
    local after = {
        c = { round3(cur.c[1]), round3(cur.c[2]), round3(cur.c[3]) },
        l = round3(cur.l),
        w = round3(cur.w),
        h = round3(cur.h),
        cz = round3(cur.cz),
        sz = round3(cur.sz)
    }
    OE.Stop(false)
    TriggerServerEvent('kk_ct:editOccluder', { conflictId = d.conflictId, boxes = d.boxes, target = d.target, after = after })
end

function OE.Stop(restore)
    if not OE.active then return end
    OE.active = false
    CT.mode = 'browse'
    OE.DragStop()
    if restore and orig then
        writeViz(orig)
    end
    if CT.Gizmo.mode == 'scale' then
        CT.Gizmo.mode = 'translate'
        CT.Gizmo.pendingMode = 'translate'
    end
    data, orig, cur = nil, nil, nil
    CT.NuiSend('occlEditDone')
end
