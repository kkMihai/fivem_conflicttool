DataView = { EndBig = '>', EndLittle = '<' }
DataView.__index = DataView

function DataView.ArrayBuffer(length)
    return setmetatable({ blob = string.blob(length), length = length, offset = 1 }, DataView)
end

function DataView:Buffer()
    return self.blob
end

function DataView:GetFloat32(offset)
    local v = self.blob:blob_unpack(self.offset + (offset or 0), '<f')
    return v
end

function DataView:SetFloat32(offset, value)
    self.blob = self.blob:blob_pack(self.offset + offset, '<f', value)
    return self
end
