rom = open('/home/user/chaos-port/Sonic Chaos/SonicChaos.sms', 'rb').read()


def decomp_art(addr, flip=False):
    """Sonic Chaos tile compression. Returns bytes (32 per tile)."""
    h = rom[addr:addr + 6]
    count = h[2] | h[3] << 8
    flagoff = h[4] | h[5] << 8
    flags = addr + flagoff
    data = addr + 6
    out = bytearray()
    prev = bytes(32)  # buffer D320 is zeroed once; code 0 copies D320 (zeros)
    for t in range(count):
        code = (rom[flags + (t >> 2)] >> ((t & 3) * 2)) & 3
        if code == 0:
            tile = bytearray(32)
        elif code == 1:
            tile = bytearray(rom[data:data + 32]); data += 32
        else:
            mask = rom[data] | rom[data + 1] << 8 | rom[data + 2] << 16 | rom[data + 3] << 24
            data += 4
            tile = bytearray(32)
            for i in range(32):
                if mask & (1 << i):
                    tile[i] = rom[data]; data += 1
            if code == 3:
                for i in range(0, 14, 2):
                    tile[i + 2] ^= tile[i]; tile[i + 3] ^= tile[i + 1]
                    tile[i + 18] ^= tile[i + 16]; tile[i + 19] ^= tile[i + 17]
        if flip:
            tile = bytearray(rom[0x100 + v] for v in tile)
        out += tile
    return bytes(out), data - addr


def rle_layout(addr, size=0xFFF):
    out = bytearray(); p = addr
    while len(out) < size:
        if rom[p] == 0xFF:
            n = rom[p + 2]
            if n == 0: break
            out += bytes([rom[p + 1]]) * n; p += 3
        else:
            out.append(rom[p]); p += 1
    return bytes(out[:size]), p - addr
