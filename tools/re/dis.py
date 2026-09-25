# Compact Z80 disassembler (x/y/z decoding).
R = ['b', 'c', 'd', 'e', 'h', 'l', '(hl)', 'a']
RP = ['bc', 'de', 'hl', 'sp']
RP2 = ['bc', 'de', 'hl', 'af']
CC = ['nz', 'z', 'nc', 'c', 'po', 'pe', 'p', 'm']
ALU = ['add a,', 'adc a,', 'sub', 'sbc a,', 'and', 'xor', 'or', 'cp']
ROT = ['rlc', 'rrc', 'rl', 'rr', 'sla', 'sra', 'sll', 'srl']
IM = ['0', '0', '1', '2', '0', '0', '1', '2']
BLI = {(4, 0): 'ldi', (4, 1): 'cpi', (4, 2): 'ini', (4, 3): 'outi', (5, 0): 'ldd', (5, 1): 'cpd', (5, 2): 'ind', (5, 3): 'outd',
       (6, 0): 'ldir', (6, 1): 'cpir', (6, 2): 'inir', (6, 3): 'otir', (7, 0): 'lddr', (7, 1): 'cpdr', (7, 2): 'indr', (7, 3): 'otdr'}


def dis(mem, pc, base=0):
    """mem: callable addr->byte. returns (text, length, targets)"""
    start = pc
    def b():
        nonlocal pc
        v = mem(pc); pc += 1; return v
    def w():
        lo = b(); hi = b(); return lo | hi << 8
    def sd(v): return v - 256 if v >= 128 else v
    idx = None; disp = None
    op = b()
    if op in (0xDD, 0xFD):
        idx = 'ix' if op == 0xDD else 'iy'
        op = b()
        if op in (0xDD, 0xFD, 0xED):
            return ('nop*', 1, [])
    def r(i):
        nonlocal disp
        if idx is None: return R[i]
        if i == 6:
            if disp is None: disp = sd(b())
            return '(%s%+d)' % (idx, disp)
        if i in (4, 5): return idx + ('h' if i == 4 else 'l')
        return R[i]
    def rp(i): return idx if (idx and i == 2) else RP[i]
    def rp2(i): return idx if (idx and i == 2) else RP2[i]
    tg = []
    if op == 0xCB:
        if idx:
            disp = sd(b()); op2 = b()
            m = '(%s%+d)' % (idx, disp)
        else:
            op2 = b(); m = R[op2 & 7]
        x, y = op2 >> 6, (op2 >> 3) & 7
        if x == 0: t = '%s %s' % (ROT[y], m)
        else: t = '%s %d, %s' % (['', 'bit', 'res', 'set'][x], y, m)
        return (t, pc - start, tg)
    if op == 0xED:
        op = b(); x, y, z = op >> 6, (op >> 3) & 7, op & 7; p, q = y >> 1, y & 1
        if x == 1:
            if z == 0: t = 'in %s, (c)' % R[y] if y != 6 else 'in (c)'
            elif z == 1: t = 'out (c), %s' % (R[y] if y != 6 else '0')
            elif z == 2: t = ('sbc' if q == 0 else 'adc') + ' hl, ' + RP[p]
            elif z == 3:
                nn = w(); t = 'ld ($%04X), %s' % (nn, RP[p]) if q == 0 else 'ld %s, ($%04X)' % (RP[p], nn)
            elif z == 4: t = 'neg'
            elif z == 5: t = 'retn' if y != 1 else 'reti'
            elif z == 6: t = 'im ' + IM[y]
            else: t = ['ld i, a', 'ld r, a', 'ld a, i', 'ld a, r', 'rrd', 'rld', 'nop', 'nop'][y]
        elif x == 2 and (y, z) in BLI: t = BLI[(y, z)]
        else: t = 'db $ED, $%02X' % op
        return (t, pc - start, tg)
    x, y, z = op >> 6, (op >> 3) & 7, op & 7; p, q = y >> 1, y & 1
    t = None
    if x == 0:
        if z == 0:
            if y == 0: t = 'nop'
            elif y == 1: t = "ex af, af'"
            else:
                d = sd(b()); a = pc + d; tg.append(a)
                t = ('djnz' if y == 2 else 'jr' if y == 3 else 'jr ' + CC[y - 4] + ',') + ' $%04X' % a
                t = t.replace(', ', ',').replace(',', ', ')
        elif z == 1:
            if q == 0: t = 'ld %s, $%04X' % (rp(p), w())
            else: t = 'add %s, %s' % (rp(2), rp(p))
        elif z == 2:
            if q == 0: t = ['ld (bc), a', 'ld (de), a', 'ld ($%04X), ' + rp(2), 'ld ($%04X), a'][p]
            else: t = ['ld a, (bc)', 'ld a, (de)', 'ld ' + rp(2) + ', ($%04X)', 'ld a, ($%04X)'][p]
            if '%' in t: t = t % w()
        elif z == 3: t = ('inc ' if q == 0 else 'dec ') + rp(p)
        elif z == 4: t = 'inc ' + r(y)
        elif z == 5: t = 'dec ' + r(y)
        elif z == 6:
            m = r(y); t = 'ld %s, $%02X' % (m, b())
        else: t = ['rlca', 'rrca', 'rla', 'rra', 'daa', 'cpl', 'scf', 'ccf'][y]
    elif x == 1:
        if op == 0x76: t = 'halt'
        else:
            # with index, only one of the operands uses (ix+d); h/l stay h/l if other is (ix+d)
            if idx and (y == 6 or z == 6):
                a1 = r(y) if y == 6 else R[y]; a2 = r(z) if z == 6 else R[z]
                t = 'ld %s, %s' % (a1, a2)
            else: t = 'ld %s, %s' % (r(y), r(z))
    elif x == 2: t = '%s %s' % (ALU[y], r(z))
    else:
        if z == 0: t = 'ret ' + CC[y]
        elif z == 1:
            if q == 0: t = 'pop ' + rp2(p)
            else: t = ['ret', 'exx', 'jp (%s)' % rp(2), 'ld sp, ' + rp(2)][p]
        elif z == 2:
            a = w(); tg.append(a); t = 'jp %s, $%04X' % (CC[y], a)
        elif z == 3:
            if y == 0: a = w(); tg.append(a); t = 'jp $%04X' % a
            elif y == 2: t = 'out ($%02X), a' % b()
            elif y == 3: t = 'in a, ($%02X)' % b()
            elif y == 4: t = 'ex (sp), ' + rp(2)
            elif y == 5: t = 'ex de, hl'
            elif y == 6: t = 'di'
            else: t = 'ei'
        elif z == 4:
            a = w(); tg.append(a); t = 'call %s, $%04X' % (CC[y], a)
        elif z == 5:
            if q == 0: t = 'push ' + rp2(p)
            elif p == 0: a = w(); tg.append(a); t = 'call $%04X' % a
            else: t = '??'
        elif z == 6: t = '%s $%02X' % (ALU[y], b())
        else: t = 'rst $%02X' % (y * 8)
    return (t, pc - start, tg)


def listing(rom, bankno, lo, hi, slot_base, hits=None, only_hit=False):
    """Disassemble ROM bank region; addresses shown as CPU addresses in slot."""
    off = bankno * 0x4000
    def mem(a):
        if a < 0x4000 and slot_base != 0: return rom[a] if a < 0x4000 else 0
        return rom[off + (a - slot_base)] if slot_base <= a < slot_base + 0x4000 else rom[a] if a < 0x4000 else 0
    out = []
    pc = lo
    while pc < hi:
        t, n, tg = dis(mem, pc)
        phys = off + pc - slot_base
        h = hits[phys] if hits else 0
        bs = ' '.join('%02X' % mem(pc + i) for i in range(n))
        out.append('%04X %-12s %s%s' % (pc, bs, t, ('   ; x%d' % h) if h else ''))
        pc += n
    return '\n'.join(out)
