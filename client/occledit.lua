CT.OcclEdit = { active = false, face = nil, vizIndex = nil }

local OE = CT.OcclEdit
local data = nil
local orig = nil
local cur = nil
local dragActive = false
local session = 0
local MIN_SIZE = 0.5

local SIZE_KEY = { 'l', 'w', 'h' }
local FACE_NAME = {
    { [1] = 'right', [-1] = 'left' },
    { [1] = 'front', [-1] = 'back' },
    { [1] = 'top', [-1] = 'bottom' }
}

local function round3(v)
    return math.floor(v * 1000 + 0.5) / 1000
end

local function clampSize(v)
    return math.max(MIN_SIZE, math.min(2000.0, v))
end

local function clampPos(v)
    return math.max(-8000.0, math.min(8000.0, v))
end

local function makeMatrix()
    local co, si = cur.cz, cur.sz
    local view = DataView.ArrayBuffer(64)
    view:SetFloat32(0, co * cur.l):SetFloat32(4, si * cur.l):SetFloat32(8, 0.0):SetFloat32(12, 0.0)
    view:SetFloat32(16, -si * cur.w):SetFloat32(20, co * cur.w):SetFloat32(24, 0.0):SetFloat32(28, 0.0)
    view:SetFloat32(32, 0.0):SetFloat32(36, 0.0):SetFloat32(40, cur.h):SetFloat32(44, 0.0)
    view:SetFloat32(48, cur.c[1]):SetFloat32(52, cur.c[2]):SetFloat32(56, cur.c[3]):SetFloat32(60, 1.0)
    return view
end

local function readMatrix(view)
    local tx, ty, tz = view:GetFloat32(48), view:GetFloat32(52), view:GetFloat32(56)
    cur.c[1], cur.c[2], cur.c[3] = clampPos(tx), clampPos(ty), clampPos(tz)
    local rx, ry, rz = view:GetFloat32(0), view:GetFloat32(4), view:GetFloat32(8)
    local fx, fy, fz = view:GetFloat32(16), view:GetFloat32(20), view:GetFloat32(24)
    local ux, uy, uz = view:GetFloat32(32), view:GetFloat32(36), view:GetFloat32(40)
    local hl = math.sqrt(rx * rx + ry * ry)
    if hl > 0.0001 then
        cur.cz, cur.sz = rx / hl, ry / hl
    end
    cur.l = clampSize(math.sqrt(rx * rx + ry * ry + rz * rz))
    cur.w = clampSize(math.sqrt(fx * fx + fy * fy + fz * fz))
    cur.h = clampSize(math.sqrt(ux * ux + uy * uy + uz * uz))
end

function OE.ExtrudeSpan(size, sign, p)
    local h = size / 2
    local lo, hi = -h, h
    if sign > 0 then hi = p else lo = p end
    if hi - lo < MIN_SIZE then
        if sign > 0 then hi = lo + MIN_SIZE else lo = hi - MIN_SIZE end
    end
    return hi - lo, (lo + hi) / 2
end

local function toWorld(lx, ly, lz)
    return cur.c[1] + lx * cur.cz - ly * cur.sz,
        cur.c[2] + lx * cur.sz + ly * cur.cz,
        cur.c[3] + lz
end

local function faceOffsets(value)
    local ax = OE.face.axis
    if ax == 1 then return value, 0.0, 0.0 end
    if ax == 2 then return 0.0, value, 0.0 end
    return 0.0, 0.0, value
end

local function makeFaceMatrix()
    local ax = OE.face.axis
    local lx, ly, lz = faceOffsets(OE.face.sign * (cur[SIZE_KEY[ax]] / 2))
    local tx, ty, tz = toWorld(lx, ly, lz)
    local view = DataView.ArrayBuffer(64)
    view:SetFloat32(0, cur.cz):SetFloat32(4, cur.sz):SetFloat32(8, 0.0):SetFloat32(12, 0.0)
    view:SetFloat32(16, -cur.sz):SetFloat32(20, cur.cz):SetFloat32(24, 0.0):SetFloat32(28, 0.0)
    view:SetFloat32(32, 0.0):SetFloat32(36, 0.0):SetFloat32(40, 1.0):SetFloat32(44, 0.0)
    view:SetFloat32(48, tx):SetFloat32(52, ty):SetFloat32(56, tz):SetFloat32(60, 1.0)
    return view
end

local function readFaceMatrix(view)
    local ax = OE.face.axis
    local key = SIZE_KEY[ax]
    local tx, ty, tz = view:GetFloat32(48), view:GetFloat32(52), view:GetFloat32(56)
    local dx, dy = tx - cur.c[1], ty - cur.c[2]
    local lx = dx * cur.cz + dy * cur.sz
    local ly = -dx * cur.sz + dy * cur.cz
    local lz = tz - cur.c[3]
    local p = ax == 1 and lx or (ax == 2 and ly or lz)
    local size, offset = OE.ExtrudeSpan(cur[key], OE.face.sign, p)
    local ox, oy, oz = faceOffsets(offset)
    local cx, cy, cz0 = toWorld(ox, oy, oz)
    cur[key] = clampSize(size)
    cur.c[1], cur.c[2], cur.c[3] = clampPos(cx), clampPos(cy), clampPos(cz0)
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

function OE.Emit()
    if not (OE.active and cur) then return end
    local face = OE.face
    CT.NuiSend('occlEditLive', {
        l = round3(cur.l),
        w = round3(cur.w),
        h = round3(cur.h),
        face = face and FACE_NAME[face.axis][face.sign] or nil
    })
end

function OE.PickFace(boxIndex, axis, sign)
    if not (OE.active and data and axis) then return end
    if boxIndex ~= data.target then return end
    OE.face = { axis = axis, sign = sign }
    CT.Gizmo.mode = 'translate'
    CT.Gizmo.pendingMode = 'translate'
    CT.NuiSend('gizmoMode', 'translate')
    OE.Emit()
end

function OE.ClearFace()
    if not OE.face then return end
    OE.face = nil
    OE.Emit()
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
    OE.face = nil
    OE.vizIndex = d.target + 1
    CT.mode = 'transform'
    if CT.Gizmo.mode == 'scale' then
        CT.Gizmo.mode = 'translate'
    end
    CT.Gizmo.pendingMode = CT.Gizmo.mode
    CT.Gizmo.EmitSpace()
    session = session + 1
    local mySession = session
    CreateThread(function()
        local emitAt = 0
        while OE.active and session == mySession do
            Wait(0)
            if not (OE.active and session == mySession and cur) then break end
            DisableControlAction(0, 24, true)
            DisableControlAction(0, 25, true)
            DisableControlAction(0, 140, true)
            DisablePlayerFiring(PlayerId(), true)
            local face = OE.face
            local view = face and makeFaceMatrix() or makeMatrix()
            local changed = Citizen.InvokeNative(0xEB2EDCA2, view:Buffer(), 'kk_ct_occl', Citizen.ReturnResultAnyway())
            if changed then
                if face then
                    readFaceMatrix(view)
                else
                    readMatrix(view)
                end
                writeViz(cur)
            end
            local now = GetGameTimer()
            if now - emitAt > 100 then
                emitAt = now
                OE.Emit()
            end
        end
    end)
    writeViz(cur)
    return true
end

function OE.Apply()
    if not (OE.active and cur and data) then return end
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
    OE.face = nil
    OE.vizIndex = nil
    session = session + 1
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
