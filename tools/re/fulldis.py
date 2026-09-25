import array, sys
from dis import dis
rom = open('/home/user/chaos-port/Sonic Chaos/SonicChaos.sms', 'rb').read()
hits = array.array('I'); hits.frombytes(open('/tmp/claude-0/emu/hits.bin', 'rb').read())
SLOT = {0: 0, 1: 0x4000, 2: 0x4000}


def bank_dis(bk, extra_seeds=()):
    base = SLOT.get(bk, 0x8000); off = bk * 0x4000
    def mem(a):
        if base <= a < base + 0x4000: return rom[off + a - base]
        if a < 0x4000: return rom[a]
        if a < 0x8000: return rom[0x4000 + a - 0x4000]
        return 0
    code = {}
    seeds = [base + i for i in range(0x4000) if hits[off + i]] + list(extra_seeds)
    work = list(seeds); seen = set()
    while work:
        pc = work.pop()
        while base <= pc < base + 0x4000 and pc not in seen:
            t, n, tg = dis(mem, pc)
            seen.add(pc); code[pc] = (t, n)
            for x in tg:
                if base <= x < base + 0x4000 and x not in seen: work.append(x)
            op = t.split()[0]
            if op in ('ret', 'reti', 'retn') and t in ('ret', 'reti', 'retn'): break
            if op == 'jp' and ',' not in t: break
            if op == 'jr' and ',' not in t: break
            pc += n
    # labels
    labels = set()
    for pc, (t, n) in code.items():
        for tok in t.replace(',', ' ').split():
            if tok.startswith('$') and len(tok) == 5 and (t.startswith(('call', 'jp', 'jr', 'djnz'))):
                labels.add(int(tok[1:], 16))
    out = []
    pc = base; covered = set()
    for p, (t, n) in code.items():
        for i in range(n): covered.add(p + i)
    while pc < base + 0x4000:
        if pc in code:
            t, n = code[pc]
            if pc in labels: out.append('L%04X:' % pc)
            h = hits[off + pc - base]
            out.append('  %04X  %-22s ; %s%s' % (pc, t, ' '.join('%02X' % mem(pc + i) for i in range(n)), ('  x%d' % h) if h else ''))
            pc += n
        else:
            s = pc; bs = []
            while pc < base + 0x4000 and pc not in code and len(bs) < 16:
                bs.append(mem(pc)); pc += 1
                if pc in covered and pc not in code: break
            if all(b == 0xFF for b in bs) and False: continue
            out.append('  %04X  db %s' % (s, ','.join('%02X' % b for b in bs)))
    return '\n'.join(out)


if __name__ == '__main__':
    for bk in [int(x) for x in sys.argv[1:]]:
        open('/tmp/claude-0/emu/bank%02d.asm' % bk, 'w').write(bank_dis(bk))
