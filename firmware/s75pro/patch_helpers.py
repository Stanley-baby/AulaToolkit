import struct

def decode_bl(code, at):
    a, b = struct.unpack_from('<HH', code, at)
    assert a & 0xf800 == 0xf000 and b & 0xd000 == 0xd000
    s = (a >> 10) & 1
    i1 = 1 ^ ((b >> 13) & 1) ^ s
    i2 = 1 ^ ((b >> 11) & 1) ^ s
    offset = (s << 24) | (i1 << 23) | (i2 << 22) | ((a & 1023) << 12) | ((b & 2047) << 1)
    if s:
        offset -= 1 << 25
    return at + 4 + offset
def encode_bl(at, target):
    offset = target - at - 4
    assert offset % 2 == 0 and -(1 << 24) <= offset < (1 << 24)
    n = offset & ((1 << 25) - 1)
    s, i1, i2 = (n >> 24) & 1, (n >> 23) & 1, (n >> 22) & 1
    a = 0xf000 | (s << 10) | ((n >> 12) & 1023)
    b = 0xd000 | ((1 ^ i1 ^ s) << 13) | ((1 ^ i2 ^ s) << 11) | ((n >> 1) & 2047)
    return struct.pack('<HH', a, b)
def sections(data):
    assert data[:7] == b'\x7fELF\x01\x01\x01'
    off = struct.unpack_from('<I', data, 32)[0]
    size, count, names_index = struct.unpack_from('<HHH', data, 46)
    assert size == 40 and off + count * size <= len(data) and names_index < count
    headers = [struct.unpack_from('<10I', data, off + i * size) for i in range(count)]
    names_header = headers[names_index]
    names = data[names_header[4]:names_header[4]+names_header[5]]
    result = {}
    for i, h in enumerate(headers):
        assert h[4] + h[5] <= len(data) or h[1] == 8
        end = names.find(b'\0', h[0])
        assert 0 <= h[0] < len(names) and end >= h[0]
        name = names[h[0]:end].decode()
        result[name] = (i, h, data[h[4]:h[4]+h[5]])
    return result

