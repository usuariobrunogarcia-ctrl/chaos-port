# Sonic Chaos SMS RE notes

## Object struct (0x40 bytes). Player at D500, objects D540.. (16), D700.. (11)
+00 type (1=Sonic,2=Tails)  +01 cur anim-state (script)  +02 requested state
+03 flags: b0=in air(gravity), b1=rolling/ball?, b6=?, b7=?
+04 flags: b3=?, b4=facing left (hflip)  +05 sprite frame(from table)  +06 frame index  +07 anim timer
+0A ? (40 right /C0 left)
+0C/0D logic handler ptr (from anim script) ; +0E/0F anim script ptr
+10 xfrac, +11/12 x   ; +13 yfrac, +14/15 y   (24-bit 16.8)
+16/17 vx (8.8 signed) ; +18/19 vy
+22 (34) coll flags: b1=on ground, b2=wall right?, b3=wall left
+23 (35) wall flags b2 (block right), b3 (block left)
+24 (36), +25 (37) layer select for type bit5 blocks (loops)
+28..2B sprite mapping ptrs
Globals: D373/4 max speed (0x400 normal, 0x600 roll?, 0x700), D375 accel, D377 slope accel
D369 current angle (from block byte1), D174/D176 camera x,y
D137 joypad held (b0 up,b1 down,b2 left,b3 right,b4 b1,b5 b2), D147 = pressed?
D443 underwater, D29A rings (BCD), D299 lives
## Gravity (4097): in-air: vy+=0x30 (anim0B:0x18, anim1B:0x24) cap 0x700 ; underwater 0x18/0x0C/0x12 cap 0x400
 ground: vy = 0x700 (angle 0A/0C: 0x900)
## Jump (45ED): vy=0xFBC0 (-0x440) (uw FCC0), y-=1, state 0x0A, flags3 |= 3, sound A2
## Accel tables 429D(vx>=0)/431D(vx<0) per anim*4 [L,R]; no key 439D; uw 441D/449D; |vx|<0x80 => accel*2
## slope accel table 459D indexed by angle byte
