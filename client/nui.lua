local function nuiSend(action, data)
    SendNUIMessage({ action = action, data = data })
end

CT.NuiSend = nuiSend

RegisterNUICallback('uiReady', function(_, cb)
    cb(true)
    if CT.open then
        TriggerServerEvent('kk_ct:getState')
    end
end)

RegisterNUICallback('close', function(_, cb)
    cb(true)
    CT.Close()
end)


RegisterNUICallback('requestScan', function(data, cb)
    cb(true)
    TriggerServerEvent('kk_ct:scan', data and data.force or false)
end)

RegisterNUICallback('setMarkers', function(data, cb)
    cb(true)
    local markers = (data and data.markers) or {}
    for i = 1, #markers do
        local m = markers[i]
        local c = CT.CategoryColor(m.cat, m.ci)
        m.r, m.g, m.b = c[1], c[2], c[3]
    end
    CT.markers = markers
    CT.markerCount = #markers
    CT.total = (data and data.total) or #markers
end)

RegisterNUICallback('selectConflict', function(data, cb)
    cb(true)
    CT.selected = data and data.id or nil
    CT.selectedIndex = data and data.index or 0
    CT.selectedLabel = data and data.label or nil
    if data and data.pos and data.teleport then
        CreateThread(function()
            local ok, err = pcall(CT.Freecam.SetTo, data.pos)
            if not ok then
                print('[fivem_conflicttool] freecam error: ' .. tostring(err))
            end
        end)
    end
end)

RegisterNUICallback('teleportTo', function(data, cb)
    cb(true)
    if data and data.pos then
        CreateThread(function()
            local ok, err = pcall(CT.Freecam.SetTo, data.pos)
            if not ok then
                print('[fivem_conflicttool] freecam error: ' .. tostring(err))
            end
        end)
    end
end)

RegisterNUICallback('decide', function(data, cb)
    cb(true)
    TriggerServerEvent('kk_ct:decide', data)
    if data and data.type == 'entity' and data.action == 'remove' then
        CT.VerifyRemoval(data)
    end
end)

RegisterNUICallback('undo', function(_, cb)
    cb(true)
    TriggerServerEvent('kk_ct:undo')
end)

RegisterNUICallback('startTransform', function(data, cb)
    if not (data and data.model and data.pos) then
        cb({ ok = false, reason = 'This conflict has no object to move.' })
        return
    end
    if not IsModelValid(data.model) then
        cb({ ok = false, reason = 'This model is not streamable, so it cannot be moved in game. Resolve it at file level instead.' })
        return
    end
    CreateThread(function()
        CT.Preview.Hide(data.model, data.pos, data.radius or 0.25)
        local ghost = CT.Preview.SpawnGhost(data.model, data.newPos or data.pos, data.rot)
        if ghost then
            SetEntityAlpha(ghost, 255, false)
            CT.typing = false
            CT.Gizmo.Start(ghost)
            CT.ApplyFocus()
            cb({ ok = true })
        else
            CT.Preview.Reset()
            cb({ ok = false, reason = 'This model failed to load, so it cannot be moved in game. Resolve it at file level instead.' })
        end
    end)
end)

RegisterNUICallback('setGizmoMode', function(data, cb)
    cb(true)
    if data and data.mode then
        CT.Gizmo.SetMode(data.mode)
    end
end)

RegisterNUICallback('setSnap', function(data, cb)
    cb(true)
    if data then
        if data.grid ~= nil then CT.Gizmo.gridSnap = data.grid end
        if data.ground then CT.Gizmo.SnapToGround() end
    end
end)

RegisterNUICallback('applyTransformInput', function(data, cb)
    cb(true)
    if data then
        CT.Gizmo.SetTransform(data.pos, data.rot)
    end
end)

RegisterNUICallback('endTransform', function(data, cb)
    local result = CT.Gizmo.Stop(data and data.commit)
    CT.ApplyFocus()
    if not (data and data.commit) then
        CT.Preview.Reset()
    end
    cb(result or false)
end)

RegisterNUICallback('previewEntity', function(data, cb)
    cb(true)
    if not data then return end
    if data.op == 'hide' and data.model and data.pos then
        CT.Preview.Hide(data.model, data.pos, data.radius)
    elseif data.op == 'swap' then
        CreateThread(function()
            CT.Preview.Reset()
            if data.hide and data.hide.model and data.hide.pos then
                CT.Preview.Hide(data.hide.model, data.hide.pos, data.hide.radius)
            end
            if data.ghost and data.ghost.model and data.ghost.pos then
                CT.Preview.SpawnGhost(data.ghost.model, data.ghost.pos, data.ghost.rot)
            end
        end)
    elseif data.op == 'reset' then
        CT.Preview.Reset()
    end
end)

RegisterNUICallback('zeroOccluder', function(data, cb)
    cb(true)
    if data then
        TriggerServerEvent('kk_ct:zeroOccluder', data)
    end
end)

RegisterNUICallback('mergeOccluders', function(data, cb)
    cb(true)
    if data then
        TriggerServerEvent('kk_ct:mergeOccluders', data)
    end
end)

RegisterNUICallback('clipOccluder', function(data, cb)
    cb(true)
    if data then
        TriggerServerEvent('kk_ct:clipOccluder', data)
    end
end)

RegisterNUICallback('editOccluder', function(data, cb)
    local ok, reason = CT.OcclEdit.Start(data)
    cb({ ok = ok or false, reason = reason })
end)

RegisterNUICallback('occlEditApply', function(_, cb)
    cb(true)
    CT.OcclEdit.Apply()
end)

RegisterNUICallback('occlEditCancel', function(_, cb)
    cb(true)
    CT.OcclEdit.Stop(true)
end)

RegisterNUICallback('occlEditWholeBox', function(_, cb)
    cb(true)
    CT.OcclEdit.ClearFace()
end)

RegisterNUICallback('ignoreConflict', function(data, cb)
    cb(true)
    if data and (data.key or data.items) then
        TriggerServerEvent('kk_ct:ignore', data)
    end
end)

RegisterNUICallback('checkUpdate', function(_, cb)
    cb(true)
    TriggerServerEvent('kk_ct:checkUpdate')
end)

RegisterNUICallback('apply', function(_, cb)
    cb(true)
    TriggerServerEvent('kk_ct:apply')
end)

RegisterNUICallback('clearQueued', function(_, cb)
    cb(true)
    TriggerServerEvent('kk_ct:clearQueued')
end)

RegisterNUICallback('autoResolve', function(data, cb)
    cb(true)
    TriggerServerEvent('kk_ct:autoResolve', data and data.scope or 'all')
end)

RegisterNUICallback('getBackups', function(_, cb)
    cb(true)
    TriggerServerEvent('kk_ct:backups')
end)

RegisterNUICallback('restoreBackup', function(data, cb)
    cb(true)
    if data and data.id then
        TriggerServerEvent('kk_ct:restore', data.id)
    end
end)

RegisterNUICallback('requestCollisionGeom', function(data, cb)
    cb(true)
    if data and data.file then
        TriggerServerEvent('kk_ct:collisionGeom', data.file, data.resource)
    end
end)

RegisterNUICallback('clearCollision', function(_, cb)
    cb(true)
    CT.CollisionViz.sets['sel'] = nil
    CT.CollisionViz.Touch()
end)

RegisterNUICallback('collisionAll', function(data, cb)
    cb(true)
    if data and data.on then
        TriggerServerEvent('kk_ct:collisionGeomAll')
    else
        for k in pairs(CT.CollisionViz.sets) do
            if k ~= 'sel' then
                CT.CollisionViz.sets[k] = nil
            end
        end
        CT.CollisionViz.Touch()
    end
end)

RegisterNUICallback('typing', function(data, cb)
    cb(true)
    CT.typing = data and data.on or false
    CT.ApplyFocus()
end)

RegisterNUICallback('uiRects', function(data, cb)
    cb(true)
    if not data then return end
    CT.uiRects = data.rects or {}
    CT.uiW = data.w or 0
    CT.uiH = data.h or 0
end)

RegisterNUICallback('worldVisuals', function(data, cb)
    cb(true)
    if data then
        if data.show ~= nil then CT.showVisuals = data.show end
        if data.xray ~= nil then CT.xray = data.xray end
    end
end)

RegisterNUICallback('resolvedPulse', function(data, cb)
    cb(true)
    local pts = data and data.points or nil
    if not pts or #pts == 0 then
        CT.pulse = nil
        return
    end
    if #pts > 250 then
        local trimmed = {}
        for i = 1, 250 do trimmed[i] = pts[i] end
        pts = trimmed
    end
    CT.pulse = { at = GetGameTimer(), pts = pts }
end)

RegisterNUICallback('occlBoxes', function(data, cb)
    cb(true)
    if CT.OcclEdit.active then
        CT.OcclEdit.Stop(false)
    end
    CT.CollisionViz.occl = data and data.boxes or nil
end)

RegisterNUICallback('collisionBox', function(data, cb)
    cb(true)
    if data and data.on and data.model and data.pos then
        CT.CollisionViz.SetBox(data.model, data.pos, data.quat)
    else
        CT.CollisionViz.ClearBox()
    end
end)

local transfer = nil

RegisterNUICallback('getScanPart', function(data, cb)
    local i = (data and data.i or 0) + 1
    if transfer and transfer.parts[i] then
        cb(transfer.parts[i])
    else
        cb('')
    end
end)

RegisterNetEvent('kk_ct:state', function(state)
    nuiSend('state', state)
end)

RegisterNetEvent('kk_ct:version', function(v)
    nuiSend('version', v)
end)

RegisterNetEvent('kk_ct:scanProgress', function(p)
    nuiSend('scanProgress', p)
end)

RegisterNetEvent('kk_ct:scanChunk', function(tid, i, n, chunk)
    if not transfer or transfer.tid ~= tid then
        transfer = { tid = tid, n = n, parts = {}, count = 0 }
    end
    if not transfer.parts[i + 1] then
        transfer.count = transfer.count + 1
    end
    transfer.parts[i + 1] = chunk
    if transfer.count >= n then
        print(('[fivem_conflicttool] scan payload received (%d parts, %d KB)'):format(n, math.floor((n - 1) * 60000 / 1024)))
        nuiSend('scanReady', { tid = tid, parts = n })
    end
end)

RegisterNetEvent('kk_ct:scanDone', function(meta)
    nuiSend('scanDone', meta)
end)

RegisterNetEvent('kk_ct:scanError', function(err)
    nuiSend('scanError', err)
end)

RegisterNetEvent('kk_ct:applyProgress', function(p)
    nuiSend('applyProgress', p)
end)

RegisterNetEvent('kk_ct:applyDone', function(summary)
    nuiSend('applyDone', summary)
end)

RegisterNetEvent('kk_ct:backupsList', function(list)
    nuiSend('backups', list)
end)

RegisterNetEvent('kk_ct:decisionsMeta', function(meta)
    nuiSend('decisionsMeta', meta)
end)

RegisterNetEvent('kk_ct:notice', function(msg)
    nuiSend('notice', msg)
end)

RegisterNetEvent('kk_ct:occlPreview', function(data)
    nuiSend('occlPreview', data)
end)

RegisterNetEvent('kk_ct:autoResolved', function(ids)
    nuiSend('autoResolved', ids)
end)

RegisterNetEvent('kk_ct:collisionGeomData', function(tag, tris)
    CT.CollisionViz.sets[tag or 'sel'] = tris
    CT.CollisionViz.Touch()
    local total = 0
    for _, t in pairs(CT.CollisionViz.sets) do
        total = total + math.floor(#t / 9)
    end
    nuiSend('collisionGeom', { tag = tag, count = total })
end)
