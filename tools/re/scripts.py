rom = open('/home/user/chaos-port/Sonic Chaos/SonicChaos.sms', 'rb').read()
B12 = 0x30000 - 0x8000
def b(a): return rom[B12 + a] if a >= 0x8000 else rom[a]
def w(a): return b(a) | b(a + 1) << 8
def s16(v): return v - 65536 if v & 0x8000 else v
CMDS = {0: ('restart', 0), 1: ('call', 2), 2: ('setvel', 4), 3: ('setstate', 1), 4: ('spawn', 6), 5: ('callhandler', 4),
        6: ('sound', 1), 7: ('goto', 2), 8: ('condcall', 4), 9: ('setfield', 2), 10: ('writebyte', 3), 11: ('andfield', 2),
        12: ('orfield', 2), 13: ('framedir', 5), 14: ('setcounter', 1), 15: ('loop', 2)}


def decode(p, maxn=40):
    out = []; seen = set()
    for _ in range(maxn):
        if p in seen: break
        seen.add(p)
        if b(p) == 0xFF:
            c = b(p + 1); name, n = CMDS.get(c, ('?%d' % c, 0))
            args = [b(p + 2 + i) for i in range(n)]
            if name in ('call', 'goto'): s = '%s %04X' % (name, w(p + 2))
            elif name == 'callhandler': s = 'callhandler %04X h=%04X' % (w(p + 2), w(p + 4))
            elif name == 'condcall': s = 'condcall %04X ->%04X' % (w(p + 2), w(p + 4))
            elif name == 'setvel': s = 'setvel vx=%d vy=%d' % (s16(w(p + 2)), s16(w(p + 4)))
            elif name == 'spawn': s = 'spawn type=%02X dx=%d dy=%d p=%02X' % (args[0], s16(w(p + 3)), s16(w(p + 5)), args[5])
            elif name == 'loop': s = 'loop ->%04X' % w(p + 2)
            elif name == 'writebyte': s = 'writebyte (%04X)=%02X' % (w(p + 2), args[2])
            elif name == 'framedir': s = 'framedir t=%d f=%02X/%02X h=%04X' % (args[0], args[1], args[2], w(p + 5))
            else: s = name + ' ' + ' '.join('%02X' % x for x in args)
            out.append('%04X: %s' % (p, s))
            p += 2 + n
            if name in ('restart',): break
            if name == 'goto': p = w(p - 2)
        else:
            out.append('%04X: frame t=%d f=%02X h=%04X' % (p, b(p), b(p + 1), w(p + 2)))
            p += 4
    return out


def type_scripts(t, nstates=0x40):
    base = w(0x65BA + 2 * (t - 1)) if t <= 6 else None
    return base


if __name__ == '__main__':
    import sys
    t = int(sys.argv[1], 16) if len(sys.argv) > 1 else 1
    n = int(sys.argv[2], 16) if len(sys.argv) > 2 else 0x2C
    tbl = w(0x65BA + 2 * (t - 1)) if False else None
    # type table lives in slot-1 ROM (bank1) at 65BA: pointers into bank 12
    tbl = rom[0x65BA + 2 * (t - 1)] | rom[0x65BB + 2 * (t - 1)] << 8
    print('type %02X table %04X' % (t, tbl))
    for st in range(n):
        p = w(tbl + 2 * st)
        print('state %02X @%04X' % (st, p))
        for l in decode(p): print('    ' + l)
