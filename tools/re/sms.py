import ctypes, os
from PIL import Image
L = ctypes.CDLL(os.path.join(os.path.dirname(__file__), 'libsms.so'))
for n in ['sms_ram', 'sms_vram', 'sms_cram', 'sms_vreg', 'sms_bank']:
    getattr(L, n).restype = ctypes.POINTER(ctypes.c_uint8)
L.sms_fb.restype = ctypes.POINTER(ctypes.c_uint32)
L.sms_pchits.restype = ctypes.POINTER(ctypes.c_uint32)
L.sms_watch_log.restype = ctypes.POINTER(ctypes.c_uint32)
ROM = '/home/user/chaos-port/Sonic Chaos/SonicChaos.sms'
rom = open(ROM, 'rb').read()
L.sms_init(ROM.encode())

UP, DOWN, LEFT, RIGHT, B1, B2 = 1, 2, 4, 8, 16, 32
ram = L.sms_ram(); vram = L.sms_vram(); cram = L.sms_cram(); vreg = L.sms_vreg()

def frame(joy=0, n=1):
    for _ in range(n): L.sms_run_frame(joy)

def rb(a): return ram[a & 0x1FFF]
def rw(a): return rb(a) | (rb(a + 1) << 8)
def rs(a):
    v = rw(a); return v - 65536 if v & 0x8000 else v
def ramdump(): return bytes(ram[0:0x2000])
def vramdump(): return bytes(vram[0:0x4000])
def cramdump(): return bytes(cram[0:32])

def shot(path, scale=2):
    fb = L.sms_fb(); data = bytearray()
    for i in range(256 * 192):
        v = fb[i]; data += bytes(((v >> 16) & 255, (v >> 8) & 255, v & 255))
    im = Image.frombytes('RGB', (256, 192), bytes(data))
    if scale != 1: im = im.resize((256 * scale, 192 * scale), Image.NEAREST)
    im.save(path)

SZ = L.sms_state_size()
def save():
    b = (ctypes.c_uint8 * SZ)(); L.sms_save(b); return b
def load(b): L.sms_load(b)

def record_snaps(inputs, pc=0x062D, path=None):
    """Run inputs from current state, snapshotting RAM each time PC hits `pc`. Returns list of 8K bytes."""
    n = len(inputs) + 8
    buf = (ctypes.c_uint8 * (0x2000 * n))()
    L.sms_snap(pc, buf, n)
    for j in inputs: frame(j)
    k = L.sms_snap_n(); L.sms_snap(-1, buf, 0)
    snaps = [bytes(buf[i * 0x2000:(i + 1) * 0x2000]) for i in range(k)]
    if path:
        open(path, 'wb').write(b''.join(snaps))
    return snaps

def record_msnaps(inputs, pcs, path, maxn=None):
    """Snapshot RAM (+banks) whenever PC hits any of `pcs`. Record: [tag, b0,b1,b2, frame u32, ram 8K]."""
    n = maxn or (len(inputs) * len(pcs) * 2 + 16)
    buf = (ctypes.c_uint8 * (0x2008 * n))()
    arr = (ctypes.c_int * len(pcs))(*pcs)
    L.sms_msnap(arr, len(pcs), buf, n)
    for j in inputs: frame(j)
    k = L.sms_msnap_n(); L.sms_msnap(arr, 0, buf, 0)
    open(path, 'wb').write(bytes(buf[:k * 0x2008]))
    return k
