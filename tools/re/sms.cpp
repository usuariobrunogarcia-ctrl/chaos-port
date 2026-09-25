// Minimal Sega Master System emulator (as a shared lib) for reverse-engineering.
#include "z80-1.2.0/z80.h"
#include <cstdio>
#include <cstring>
#include <cstdint>
#include <vector>

using z80::fast_u8;
using z80::fast_u16;

static std::vector<uint8_t> rom;
static uint8_t ram[0x2000];
static uint8_t vram[0x4000];
static uint8_t cram[32];
static uint8_t vreg[16];
static uint8_t bank[3] = {0, 1, 2};
static uint16_t vaddr; static uint8_t vcode, vlatch, vbuf; static bool vsecond;
static uint8_t vstatus; static int linecnt; static bool lineirq;
static int curline;
static uint8_t joy1 = 0xFF, joy2 = 0xFF;
static int isr_sp=-1; static uint8_t isr_w[0x2000], log_w[0x2000];
static uint32_t fb[256 * 192];
static uint64_t frames;
// Execution counters: pc hit counts by physical ROM address (only for ROM <0xC000 addrs)
static uint32_t *pchits = nullptr;
static int tracing = 0;
// write watch
static uint16_t watch_lo = 0, watch_hi = 0; static uint32_t watch_log[4096 * 3]; static int watch_n = 0;

static inline uint32_t romaddr(fast_u16 addr) {
    if (addr < 0x400) return addr;
    uint32_t b = bank[addr >> 14];
    return (b * 0x4000 + (addr & 0x3FFF)) % rom.size();
}

class sms : public z80::z80_cpu<sms> {
public:
    typedef z80::z80_cpu<sms> base;
    long ticks = 0;
    fast_u8 on_read(fast_u16 addr) {
        if (addr < 0xC000) return rom[romaddr(addr)];
        return ram[addr & 0x1FFF];
    }
    void on_write(fast_u16 addr, fast_u8 n) {
        if (addr < 0xC000) return;
        if (watch_hi && addr >= watch_lo && addr < watch_hi && watch_n < 4096) {
            watch_log[watch_n * 3] = addr; watch_log[watch_n * 3 + 1] = n;
            watch_log[watch_n * 3 + 2] = romaddr(get_pc()) ; watch_n++;
        }
        if (isr_sp >= 0) isr_w[addr & 0x1FFF] = 1; else log_w[addr & 0x1FFF] = 1;
        ram[addr & 0x1FFF] = n;
        if (addr >= 0xFFFD) bank[addr - 0xFFFD] = n & 0x3F;
    }
    fast_u8 on_input(fast_u16 port) {
        port &= 0xFF;
        if (port < 0x40) return 0xFF;
        if (port < 0x80) {
            if (port & 1) return 0;  // H counter
            int l = curline; return l <= 0xDA ? l : l - 6;
        }
        if (port < 0xC0) {
            if (port & 1) { uint8_t s = vstatus | 0x1F; vstatus = 0; lineirq = false; vsecond = false; return s; }
            vsecond = false; uint8_t r = vbuf; vbuf = vram[vaddr & 0x3FFF]; vaddr = (vaddr + 1) & 0x3FFF; return r;
        }
        if (port & 1) return (joy2 >> 2) | 0xF0;
        return (joy1 & 0x3F) | ((joy2 & 3) << 6);
    }
    void on_output(fast_u16 port, fast_u8 n) {
        port &= 0xFF;
        if (port < 0x80) return;
        if (port < 0xC0) {
            if (port & 1) {
                if (!vsecond) { vlatch = n; vsecond = true; vaddr = (vaddr & 0x3F00) | n; }
                else {
                    vsecond = false; vcode = n >> 6; vaddr = ((n & 0x3F) << 8) | vlatch;
                    if (vcode == 0) { vbuf = vram[vaddr]; vaddr = (vaddr + 1) & 0x3FFF; }
                    else if (vcode == 2) vreg[n & 0xF] = vlatch;
                }
            } else {
                vsecond = false;
                if (vcode == 3) cram[vaddr & 31] = n; else vram[vaddr & 0x3FFF] = n;
                vbuf = n; vaddr = (vaddr + 1) & 0x3FFF;
            }
        }
    }
    void on_tick(unsigned t) { ticks += t; }
    void on_set_pc(fast_u16 pc) {
        if (tracing && pc < 0xC000) pchits[romaddr(pc)]++;
        base::on_set_pc(pc);
    }
};

static sms *cpu;

static uint32_t cramrgb(int i) {
    uint8_t c = cram[i & 31];
    int r = (c & 3) * 85, g = ((c >> 2) & 3) * 85, b = ((c >> 4) & 3) * 85;
    return (r << 16) | (g << 8) | b;
}

static void render_line(int y) {
    uint32_t *row = fb + y * 256;
    if (!(vreg[1] & 0x40)) { for (int x = 0; x < 256; x++) row[x] = cramrgb(16 + (vreg[7] & 15)); return; }
    uint16_t nt = (vreg[2] & 0x0E) << 10;
    uint8_t prio[256]; uint8_t bgidx[256];
    int hs = vreg[8]; if ((vreg[0] & 0x40) && y < 16) hs = 0;
    for (int x = 0; x < 256; x++) {
        int vs = vreg[9]; int col = ((x - hs) & 255) >> 3;
        if ((vreg[0] & 0x80) && (x >> 3) >= 24) vs = 0;
        int yy = (y + vs) % 224;
        int sx = (x - hs) & 255;
        uint16_t e = vram[nt + ((yy >> 3) * 32 + (sx >> 3)) * 2] | (vram[nt + ((yy >> 3) * 32 + (sx >> 3)) * 2 + 1] << 8);
        (void)col;
        int tile = e & 0x1FF; int px = sx & 7, py = yy & 7;
        if (e & 0x200) px = 7 - px; if (e & 0x400) py = 7 - py;
        int base = tile * 32 + py * 4; int bit = 7 - px;
        int ci = ((vram[base] >> bit) & 1) | (((vram[base + 1] >> bit) & 1) << 1) | (((vram[base + 2] >> bit) & 1) << 2) | (((vram[base + 3] >> bit) & 1) << 3);
        if (e & 0x800) ci += 16;
        bgidx[x] = ci; prio[x] = (e & 0x1000) && (ci & 15);
        row[x] = cramrgb(ci);
    }
    // sprites
    uint16_t sat = (vreg[5] & 0x7E) << 7;
    int h = (vreg[1] & 2) ? 16 : 8; int cnt = 0; uint8_t drawn[256] = {0};
    for (int i = 0; i < 64; i++) {
        int sy = vram[sat + i]; if (sy == 0xD0) break;
        sy += 1; if (sy > 240) sy -= 256;
        if (y < sy || y >= sy + h) continue;
        if (++cnt > 8) break;
        int sx = vram[sat + 0x80 + i * 2]; if (vreg[0] & 8) sx -= 8;
        int t = vram[sat + 0x81 + i * 2]; if (vreg[6] & 4) t += 256; if (h == 16) t &= ~1;
        int py = y - sy; t += py >> 3; py &= 7;
        int base = t * 32 + py * 4;
        for (int px = 0; px < 8; px++) {
            int x = sx + px; if (x < 0 || x > 255 || drawn[x]) continue;
            int bit = 7 - px;
            int ci = ((vram[base] >> bit) & 1) | (((vram[base + 1] >> bit) & 1) << 1) | (((vram[base + 2] >> bit) & 1) << 2) | (((vram[base + 3] >> bit) & 1) << 3);
            if (!ci) continue; drawn[x] = 1;
            if (!prio[x]) row[x] = cramrgb(16 + ci);
        }
    }
    if (vreg[0] & 0x20) for (int x = 0; x < 8; x++) row[x] = cramrgb(16 + (vreg[7] & 15));
}

static int snap_pc=-1; static uint8_t *snapbuf=nullptr; static int snap_n=0, snap_max=0;
static int msnap_pcs[16]; static int msnap_npc=0; static uint8_t *msnap_buf=nullptr; static int msnap_n=0, msnap_max=0;
static int calltrace=0; static FILE *ctf=nullptr; static int depth=0;
static void check_irq() {
    bool irq = ((vstatus & 0x80) && (vreg[1] & 0x20)) || (lineirq && (vreg[0] & 0x10));
    if (irq) { if (cpu->on_handle_active_int() && isr_sp < 0) isr_sp = cpu->get_sp(); }
}

extern "C" {
int sms_init(const char *path) {
    FILE *f = fopen(path, "rb"); if (!f) return -1;
    fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
    rom.resize(n); fread(rom.data(), 1, n, f); fclose(f);
    pchits = new uint32_t[rom.size()]; memset(pchits, 0, rom.size() * 4);
    cpu = new sms(); memset(ram, 0, sizeof ram); memset(vram, 0, sizeof vram);
    return (int)n;
}
void sms_run_frame(int joy) {
    joy1 = ~joy & 0xFF;
    for (int l = 0; l < 262; l++) {
        curline = l;
        long target = cpu->ticks + 228;
        while (cpu->ticks < target) {
            check_irq();
            if (isr_sp >= 0 && cpu->get_sp() > isr_sp + 1) isr_sp = -1;
            if (snap_pc >= 0 && cpu->get_pc() == snap_pc && snap_n < snap_max) { memcpy(snapbuf + snap_n * 0x2000, ram, 0x2000); snap_n++; }
            if (msnap_npc) { uint16_t pc = cpu->get_pc(); for (int k = 0; k < msnap_npc; k++) if (msnap_pcs[k] == pc && msnap_n < msnap_max) {
                uint8_t *d = msnap_buf + (size_t)msnap_n * 0x2008; d[0] = k; d[1] = bank[0]; d[2] = bank[1]; d[3] = bank[2];
                uint32_t fr = (uint32_t)frames; memcpy(d + 4, &fr, 4); memcpy(d + 8, ram, 0x2000); msnap_n++; } }
            if (calltrace) {
                uint16_t pc = cpu->get_pc(); uint8_t op = cpu->on_read(pc); uint16_t sp = cpu->get_sp();
                uint32_t rpc = pc < 0xC000 ? romaddr(pc) : 0xFFFFFF;
                cpu->on_step();
                uint16_t npc = cpu->get_pc(); uint16_t nsp = cpu->get_sp();
                bool iscall = (op == 0xCD || (op & 0xC7) == 0xC4 || (op & 0xC7) == 0xC7) && nsp == (uint16_t)(sp - 2) && npc != pc + 3 && npc != pc + 1;
                if (op == 0xCD && nsp == (uint16_t)(sp-2)) iscall = true;
                if (iscall || op == 0xE9 || (nsp == (uint16_t)(sp-2) && npc == 0x38)) {
                    fprintf(ctf, "%d %s %04X->%04X [%06X] b%d,%d\n", depth, op==0xE9?"JPHL":(npc==0x38?"IRQ":"CALL"), pc, npc, npc<0xC000?romaddr(npc):0, bank[1], bank[2]);
                    if (op != 0xE9) depth++;
                } else if ((op == 0xC9 || (op & 0xC7) == 0xC0 || (op == 0xED)) && nsp == (uint16_t)(sp + 2)) { if (depth>0) depth--; }
                (void)rpc;
            } else cpu->on_step();
        }
        if (l < 192) render_line(l);
        if (l <= 192) { if (--linecnt < 0) { linecnt = vreg[10]; lineirq = true; } }
        else linecnt = vreg[10];
        if (l == 192) vstatus |= 0x80;
    }
    frames++;
}
uint8_t *sms_ram() { return ram; }
uint8_t *sms_vram() { return vram; }
uint8_t *sms_cram() { return cram; }
uint8_t *sms_vreg() { return vreg; }
uint8_t *sms_bank() { return bank; }
uint32_t *sms_fb() { return fb; }
uint32_t *sms_pchits() { return pchits; }
void sms_trace(int on) { tracing = on; }
void sms_snap(int pc, uint8_t *buf, int max) { snap_pc = pc; snapbuf = buf; snap_max = max; snap_n = 0; }
int sms_snap_n() { return snap_n; }
void sms_msnap(int *pcs, int npc, uint8_t *buf, int max) { for (int i = 0; i < npc; i++) msnap_pcs[i] = pcs[i]; msnap_npc = npc; msnap_buf = buf; msnap_max = max; msnap_n = 0; }
int sms_msnap_n() { return msnap_n; }
uint8_t *sms_isr_w() { return isr_w; }
uint8_t *sms_log_w() { return log_w; }
void sms_clear_w() { memset(isr_w, 0, sizeof isr_w); memset(log_w, 0, sizeof log_w); }
void sms_calltrace(int on, const char *path) { if (on) { ctf = fopen(path, "w"); depth = 0; calltrace = 1; } else { calltrace = 0; if (ctf) fclose(ctf); ctf = nullptr; } }
void sms_clear_hits() { memset(pchits, 0, rom.size() * 4); }
void sms_watch(int lo, int hi) { watch_lo = lo; watch_hi = hi; watch_n = 0; }
int sms_watch_n() { return watch_n; }
uint32_t *sms_watch_log() { return watch_log; }
int sms_pc() { return cpu->get_pc(); }
// snapshot / restore
int sms_state_size() { return sizeof(sms) + sizeof ram + sizeof vram + sizeof cram + sizeof vreg + 64; }
void sms_save(uint8_t *p) {
    memcpy(p, cpu, sizeof(sms)); p += sizeof(sms);
    memcpy(p, ram, sizeof ram); p += sizeof ram; memcpy(p, vram, sizeof vram); p += sizeof vram;
    memcpy(p, cram, sizeof cram); p += sizeof cram; memcpy(p, vreg, sizeof vreg); p += sizeof vreg;
    memcpy(p, bank, 3); p += 3; memcpy(p, &vaddr, 2); p += 2; *p++ = vcode; *p++ = vlatch; *p++ = vbuf; *p++ = vsecond; *p++ = vstatus;
    memcpy(p, &linecnt, 4); p += 4; *p++ = lineirq;
}
void sms_load(const uint8_t *p) {
    memcpy(cpu, p, sizeof(sms)); p += sizeof(sms);
    memcpy(ram, p, sizeof ram); p += sizeof ram; memcpy(vram, p, sizeof vram); p += sizeof vram;
    memcpy(cram, p, sizeof cram); p += sizeof cram; memcpy(vreg, p, sizeof vreg); p += sizeof vreg;
    memcpy(bank, p, 3); p += 3; memcpy(&vaddr, p, 2); p += 2; vcode = *p++; vlatch = *p++; vbuf = *p++; vsecond = *p++; vstatus = *p++;
    memcpy(&linecnt, p, 4); p += 4; lineirq = *p++;
}
}
