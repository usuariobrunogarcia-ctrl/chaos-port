from sms import *
import ctypes, random, pickle
st = open('/tmp/claude-0/emu/st_thz1.bin', 'rb').read()
load((ctypes.c_uint8 * len(st)).from_buffer_copy(st))
random.seed(3)
inputs = []  # per frame joy
checkpoints = [(0, bytes(save()))]
best = 0
lives0 = rb(0xD299)
f = 0
stuck = 0
lastx = 0
actions = [RIGHT, RIGHT | B1, RIGHT, DOWN, LEFT, LEFT | B1, B1, UP]
cur = RIGHT; hold = 0
while f < 12000:
    x = rw(0xD511)
    if hold <= 0:
        r = random.random()
        if r < 0.55: cur = RIGHT
        elif r < 0.80: cur = RIGHT | B1
        elif r < 0.88: cur = LEFT
        elif r < 0.94: cur = LEFT | B1
        else: cur = DOWN
        hold = random.randint(5, 40)
    frame(cur); inputs.append(cur); f += 1; hold -= 1
    if rb(0xD299) < lives0 or rw(0xD511) == 0:
        # died: rewind
        k = max(0, len(checkpoints) - 1 - random.randint(1, 3))
        cf, s = checkpoints[k]; checkpoints = checkpoints[:k + 1]
        load((ctypes.c_uint8 * len(s)).from_buffer_copy(s)); inputs = inputs[:cf]; f = cf; hold = 0
        continue
    if f % 60 == 0:
        checkpoints.append((f, bytes(save())))
        if f % 600 == 0: print(f, 'x', rw(0xD511), 'y', rw(0xD514), 'state', hex(rb(0xD502)), 'gs', hex(rb(0xD293)))
    if rb(0xD293) != 0 and rw(0xD511) > 4100:
        print('end?', f); break
    if rw(0xD511) > 4150:
        print('reached end region', f); break
pickle.dump(inputs, open('/tmp/claude-0/emu/bot_inputs.pkl', 'wb'))
print('frames', len(inputs), 'x', rw(0xD511))
