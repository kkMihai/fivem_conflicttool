CT.CollEdit = { active = false, bi = nil, whole = false }

local CE = CT.CollEdit
local CV = CT.CollisionViz
local data = nil
local orig = nil
local cur = nil
local base = nil
local seed = nil
local live = nil
local dragActive = false
local session = 0

local function round3(v)
    return math.floor(v * 1000 + 0.5) / 1000
end

local function clampPos(v)
    return math.max(-8000.0, math.min(8000.0, v))
end

local function identity(tx, ty, tz)
    return { 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, tx, ty, tz, 1.0 }
end

local function boundWorldCenter(b)
    local mn = b.bmin
    local mx = b.bmax
    if not (mn and mx) then return 0.0, 0.0, 0.0 end
    local mnx, mny, mnz = math.huge, math.huge, math.huge
    local mxx, mxy, mxz = -math.huge, -math.huge, -math.huge
    for i = 0, 7 do
        local x = (i % 2 == 1) and mx[1] or mn[1]
        local y = (math.floor(i / 2) % 2 == 1) and mx[2] or mn[2]
        local z = (math.floor(i / 4) % 2 == 1) and mx[3] or mn[3]
        local wx, wy, wz = CV.Transform(b.m, x, y, z)
        if wx < mnx then mnx = wx end
        if wy < mny then mny = wy end
        if wz < mnz then mnz = wz end
        if wx > mxx then mxx = wx end
        if wy > mxy then mxy = wy end
        if wz > mxz then mxz = wz end
    end
    return (mnx + mxx) / 2, (mny + mxy) / 2, (mnz + mxz) / 2
end

local function compose(a, d)
    local out = {}
    for r = 0, 2 do
        local x, y, z = a[r * 4 + 1], a[r * 4 + 2], a[r * 4 + 3]
        out[r * 4 + 1] = x * d[1] + y * d[5] + z * d[9]
        out[r * 4 + 2] = x * d[2] + y * d[6] + z * d[10]
        out[r * 4 + 3] = x * d[3] + y * d[7] + z * d[11]
        out[r * 4 + 4] = a[r * 4 + 4]
    end
    local tx, ty, tz = a[13], a[14], a[15]
    out[13] = tx * d[1] + ty * d[5] + tz * d[9] + d[13]
    out[14] = tx * d[2] + ty * d[6] + tz * d[10] + d[14]
    out[15] = tx * d[3] + ty * d[7] + tz * d[11] + d[15]
    out[16] = a[16]
    return out
end

local function deltaFromGizmo()
    local cx, cy, cz = seed[1], seed[2], seed[3]
    local d = {
        cur[1], cur[2], cur[3], 0.0,
        cur[5], cur[6], cur[7], 0.0,
        cur[9], cur[10], cur[11], 0.0,
        0.0, 0.0, 0.0, 1.0
    }
    d[13] = cur[13] - (cx * d[1] + cy * d[5] + cz * d[9])
    d[14] = cur[14] - (cx * d[2] + cy * d[6] + cz * d[10])
    d[15] = cur[15] - (cx * d[3] + cy * d[7] + cz * d[11])
    return d
end

local function refreshLive()
    if not (base and cur and seed) then return end
    live = compose(base, deltaFromGizmo())
end

local function makeMatrix()
    local view = DataView.ArrayBuffer(64)
    for i = 1, 16 do
        view:SetFloat32((i - 1) * 4, cur[i])
    end
    return view
end

local function normalizeRow(x, y, z)
    local len = math.sqrt(x * x + y * y + z * z)
    if len < 0.0001 then return 0.0, 0.0, 0.0, false end
    return x / len, y / len, z / len, true
end

local function readMatrix(view)
    local m = {}
    for i = 1, 16 do
        m[i] = view:GetFloat32((i - 1) * 4)
    end
    for _, row in ipairs({ 1, 5, 9 }) do
        local x, y, z, ok = normalizeRow(m[row], m[row + 1], m[row + 2])
        if ok then
            m[row], m[row + 1], m[row + 2] = x, y, z
        else
            m[row], m[row + 1], m[row + 2] = cur[row], cur[row + 1], cur[row + 2]
        end
    end
    if CE.whole then
        m[1], m[2], m[3] = 1.0, 0.0, 0.0
        m[5], m[6], m[7] = 0.0, 1.0, 0.0
        m[9], m[10], m[11] = 0.0, 0.0, 1.0
    end
    m[13], m[14], m[15] = clampPos(m[13]), clampPos(m[14]), clampPos(m[15])
    for i = 1, 16 do
        cur[i] = m[i]
    end
end

local function boundCenter()
    local bounds = CV.bounds
    if not bounds then return 0.0, 0.0, 0.0 end
    local mnx, mny, mnz = math.huge, math.huge, math.huge
    local mxx, mxy, mxz = -math.huge, -math.huge, -math.huge
    for _, b in ipairs(bounds) do
        if b.bmin and b.bmax then
            for i = 0, 7 do
                local x = (i % 2 == 1) and b.bmax[1] or b.bmin[1]
                local y = (math.floor(i / 2) % 2 == 1) and b.bmax[2] or b.bmin[2]
                local z = (math.floor(i / 4) % 2 == 1) and b.bmax[3] or b.bmin[3]
                local wx, wy, wz = CV.Transform(b.m, x, y, z)
                if wx < mnx then mnx = wx end
                if wy < mny then mny = wy end
                if wz < mnz then mnz = wz end
                if wx > mxx then mxx = wx end
                if wy > mxy then mxy = wy end
                if wz > mxz then mxz = wz end
            end
        end
    end
    if mnx == math.huge then return 0.0, 0.0, 0.0 end
    return (mnx + mxx) / 2, (mny + mxy) / 2, (mnz + mxz) / 2
end

local function pushViz()
    if not cur then return end
    if CE.whole then
        CV.drawOffset = { cur[13] - orig[13], cur[14] - orig[14], cur[15] - orig[15] }
    else
        refreshLive()
        CV.editM = live
    end
end

function CE.Emit()
    if not (CE.active and cur) then return end
    local yaw = math.deg(math.atan(cur[2], cur[1]))
    CT.NuiSend('collEditLive', {
        bi = CE.bi,
        whole = CE.whole,
        pos = { round3(cur[13]), round3(cur[14]), round3(cur[15]) },
        delta = CE.whole and { round3(cur[13] - orig[13]), round3(cur[14] - orig[14]), round3(cur[15] - orig[15]) } or nil,
        yaw = round3(yaw)
    })
end

function CE.DragStart()
    if not CE.active or dragActive then return end
    dragActive = true
    ExecuteCommand('+gizmoSelect')
end

function CE.DragStop()
    if not dragActive then return end
    dragActive = false
    ExecuteCommand('-gizmoSelect')
end

local function gizmoReady()
    if CT.Gizmo.supported == nil then
        local view = DataView.ArrayBuffer(64)
        view:SetFloat32(0, 1.0):SetFloat32(20, 1.0):SetFloat32(40, 1.0):SetFloat32(60, 1.0)
        local ok, res = pcall(function()
            return Citizen.InvokeNative(0xEB2EDCA2, view:Buffer(), 'kk_ct_gizmo_probe', Citizen.ReturnResultAnyway())
        end)
        CT.Gizmo.supported = ok and res ~= nil
    end
    return CT.Gizmo.supported
end

function CE.Start(d)
    if not (d and d.file) then
        return false, 'This conflict has no collision file to edit.'
    end
    if not CV.bounds then
        return false, 'The collision bounds are still loading, try again in a moment.'
    end
    local whole = d.whole and true or false
    local bound = nil
    if not whole then
        bound = CV.BoundAt(d.bi)
        if not bound then
            return false, 'That collision bound was not found, run a fresh scan.'
        end
        if not bound.m then
            return false, 'This ybn has no composite wrapper, so a single bound cannot be rotated. Use Move whole ybn instead.'
        end
    end
    if CE.active then
        CE.Stop(true)
    end
    if CT.OcclEdit.active then
        CT.OcclEdit.Stop(true)
    end
    if CT.Gizmo.active then
        CT.Gizmo.Stop(false)
        CT.Preview.Reset()
    end
    if not gizmoReady() then
        return false, 'The gizmo native is unavailable on this server build, this editor needs it.'
    end

    data = d
    CE.whole = whole
    CE.bi = whole and nil or d.bi
    if whole then
        local cx, cy, cz = boundCenter()
        orig = identity(cx, cy, cz)
        cur = identity(cx, cy, cz)
        CV.editBi = nil
        CV.editM = nil
        CV.drawOffset = { 0.0, 0.0, 0.0 }
    else
        base = {}
        orig = {}
        for i = 1, 16 do
            base[i] = bound.m[i]
            orig[i] = bound.m[i]
        end
        local cx, cy, cz = boundWorldCenter(bound)
        seed = { cx, cy, cz }
        cur = identity(cx, cy, cz)
        live = nil
        refreshLive()
        CV.editBi = d.bi
        CV.editM = live
        CV.drawOffset = nil
        CV.RebuildStatic()
    end

    CE.active = true
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
        while CE.active and session == mySession do
            Wait(0)
            if not (CE.active and session == mySession and cur) then break end
            DisableControlAction(0, 24, true)
            DisableControlAction(0, 25, true)
            DisableControlAction(0, 140, true)
            DisablePlayerFiring(PlayerId(), true)
            local view = makeMatrix()
            local changed = Citizen.InvokeNative(0xEB2EDCA2, view:Buffer(), 'kk_ct_coll', Citizen.ReturnResultAnyway())
            if changed then
                readMatrix(view)
                pushViz()
            end
            local now = GetGameTimer()
            if now - emitAt > 100 then
                emitAt = now
                CE.Emit()
            end
        end
    end)
    pushViz()
    CE.Emit()
    return true
end

function CE.Apply()
    if not (CE.active and cur and data) then return end
    local d = data
    local whole = CE.whole
    local payload
    if whole then
        payload = {
            conflictId = d.conflictId,
            file = d.file,
            resource = d.resource,
            delta = { round3(cur[13] - orig[13]), round3(cur[14] - orig[14]), round3(cur[15] - orig[15]) }
        }
    else
        refreshLive()
        local m = {}
        for i = 1, 16 do
            m[i] = live[i]
        end
        payload = {
            conflictId = d.conflictId,
            file = d.file,
            resource = d.resource,
            bi = d.bi,
            after = { m = m }
        }
    end
    CE.Stop(true)
    TriggerServerEvent(whole and 'kk_ct:moveCollision' or 'kk_ct:editCollision', payload)
end

function CE.Stop(restore)
    if not CE.active then return end
    CE.active = false
    session = session + 1
    CT.mode = 'browse'
    CE.DragStop()
    CE.bi = nil
    CE.whole = false
    CV.editBi = nil
    CV.editM = nil
    CV.drawOffset = nil
    if CT.Gizmo.mode == 'scale' then
        CT.Gizmo.mode = 'translate'
        CT.Gizmo.pendingMode = 'translate'
    end
    data, orig, cur, base, seed, live = nil, nil, nil, nil, nil, nil
    CV.RebuildStatic()
    CT.NuiSend('collEditDone')
end
