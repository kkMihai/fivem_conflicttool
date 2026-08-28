CT = {}
dofile('client/occledit.lua')
local OE = CT.OcclEdit

local failed = 0
local function check(name, cond, extra)
    print(string.format('%s %s%s', cond and 'ok  ' or 'FAIL', name, extra and ('  ' .. extra) or ''))
    if not cond then failed = failed + 1 end
end

local function near(a, b)
    return math.abs(a - b) < 0.0001
end

local function faces(size, center)
    return center - size / 2, center + size / 2
end

local function extrudeAbs(size, center, sign, targetAbs)
    local newSize, offset = OE.ExtrudeSpan(size, sign, targetAbs - center)
    return newSize, center + offset
end

do
    local size, center = OE.ExtrudeSpan(10, 1, 8)
    local lo, hi = faces(size, center)
    check('pulling the plus face out grows the box', near(size, 13), size)
    check('the minus face stays put', near(lo, -5), lo)
    check('the plus face lands where dragged', near(hi, 8), hi)
end

do
    local size, center = OE.ExtrudeSpan(10, -1, -8)
    local lo, hi = faces(size, center)
    check('pulling the minus face out grows the box', near(size, 13), size)
    check('the plus face stays put', near(hi, 5), hi)
    check('the minus face lands where dragged', near(lo, -8), lo)
end

do
    local size, center = OE.ExtrudeSpan(10, 1, 2)
    local lo, hi = faces(size, center)
    check('pushing the plus face in shrinks the box', near(size, 7), size)
    check('the minus face still stays put', near(lo, -5), lo)
end

do
    local size, center = OE.ExtrudeSpan(10, 1, 5)
    check('dragging nowhere keeps the size', near(size, 10), size)
    check('dragging nowhere keeps the center', near(center, 0), center)
end

do
    local size, center = OE.ExtrudeSpan(10, 1, -20)
    local lo, hi = faces(size, center)
    check('collapsing past the far face clamps to the minimum', near(size, 0.5), size)
    check('clamped box keeps its anchored face', near(lo, -5), lo)
    check('clamped box does not invert', hi > lo)
end

do
    local size, center = OE.ExtrudeSpan(10, -1, 20)
    local lo, hi = faces(size, center)
    check('clamping works from the minus side too', near(size, 0.5), size)
    check('clamped minus drag keeps the plus face', near(hi, 5), hi)
end

do
    local size, center = extrudeAbs(10, 0, 1, 15)
    local size2, center2 = extrudeAbs(size, center, 1, 5)
    check('extruding out then back returns the original size', near(size2, 10), size2)
    check('extruding out then back returns the original center', near(center2, 0), center2)
end

do
    local size, center = 10, 0
    for _ = 1, 4 do
        local _, hi = faces(size, center)
        size, center = extrudeAbs(size, center, 1, hi + 2)
    end
    local lo = faces(size, center)
    check('repeated extrudes accumulate', near(size, 18), size)
    check('repeated extrudes never move the anchor', near(lo, -5), lo)
end

do
    local size, center = extrudeAbs(10, 0, 1, 9)
    local lo, hi = faces(size, center)
    check('the world center shifts by half the growth', near(center, 2), center)
    check('growth lands entirely on the dragged side', near(lo, -5) and near(hi, 9), lo .. ' ' .. hi)
end

print('')
if failed > 0 then
    print(failed .. ' check(s) failed')
    os.exit(1)
end
print('all checks passed')
