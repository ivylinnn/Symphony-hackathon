#!/usr/bin/env python3
"""
15s vertical product cut from hackathon_video.mp4 (hoodie).

Timeline / technique map
  0-3s   visual hook   push-in zoom + snap-zoom punch + flash + hook text + SFX
  3-6s   jump cut      4 hard cuts, each shorter than the last, each punched in further
  6-9s   angle change  tight side-on (push-in)  ->  wide from-behind into the sun (pull-out)
  9-12s  animated text 4 selling points, sequential spring-pop, growing accent bar
  12-15s speed ramp    2.2x -> 0.25x -> 2.2x, smooth tanh ramp, on the second trick
"""
import math, os, subprocess, sys, shutil

SRC  = "/root/.claude/uploads/9679366e-9817-50ca-b159-d23a6a892e40/e1f7bbfd-hackathon_video.mp4"
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work"); os.makedirs(WORK, exist_ok=True)
OUT  = os.path.join(HERE, "hackathon_video_15s.mp4")

FONT = "/mnt/skills/examples/canvas-design/canvas-fonts/BigShoulders-Bold.ttf"
W, H, FPS = 1080, 1920, 30
ACCENT = "0xFF6B1A"          # matches the glowing board / golden hour

# ---- copy -------------------------------------------------------------------
HOOK_TEXT   = "BUILT TO MOVE"
FEATURES    = ["BREATHABLE FABRIC",
               "LAYERS OVER ANYTHING",
               "KANGAROO POCKET",
               "RELAXED FIT"]
CLOSER_TEXT = "ACTIVE + EVERYDAY"
DISCLOSURE  = "AI-generated"   # preserved from the source, which is cropped away by the zooms

def run(args, label):
    print(f"  -> {label}", flush=True)
    p = subprocess.run(args, capture_output=True, text=True)
    if p.returncode != 0:
        print(f"rc={p.returncode}\nSTDERR:\n{p.stderr[-4000:]}\nSTDOUT:\n{p.stdout[-1000:]}")
        sys.exit(f"FAILED: {label}")

def enc(extra=()):
    return ["-c:v", "libx264", "-preset", "slow", "-crf", "12",
            "-pix_fmt", "yuv420p", "-r", str(FPS), *extra]

# crop+scale for a constant zoom (computed in python -> no per-frame rounding jitter)
def zoom_static(z, dx=0, dy=0):
    cw, ch = (int(W / z) // 2) * 2, (int(H / z) // 2) * 2
    x = max(0, min(W - cw, (W - cw) // 2 + dx))
    y = max(0, min(H - ch, (H - ch) // 2 + dy))
    return f"crop={cw}:{ch}:{x}:{y},scale={W}:{H}:flags=bicubic"

# scale-up + fixed center crop driven by a per-frame zoom expression Z(t)
# (crop w/h can't vary per frame, but scale w/h can with eval=frame)
def zoom_expr(zexpr):
    return (f"scale=w='2*ceil({W}*({zexpr})/2)':h='2*ceil({H}*({zexpr})/2)'"
            f":eval=frame:flags=bicubic,crop={W}:{H}")

def txt(text, size, x, y, alpha, color="white", extra=""):
    return (f"drawtext=fontfile={FONT}:text='{text}':fontcolor={color}"
            f":fontsize={size}:x={x}:y={y}:alpha={alpha}"
            f":shadowcolor=black@0.55:shadowx=4:shadowy=5"
            f":borderw=3:bordercolor=black@0.30{extra}")

# =============================================================================
# 0. motion-interpolated sources for the two speed-changed segments
#    (0.8x and 0.25x from a 30fps source would judder badly without this)
# =============================================================================
MI1 = f"{WORK}/mi_seg1_60.mp4"     # hero kickflip, 3.35-5.75
MI5 = f"{WORK}/mi_seg5_120.mp4"    # second trick,  19.80-21.75

if not os.path.exists(MI1):
    run(["ffmpeg", "-y", "-v", "error", "-ss", "3.35", "-t", "2.40", "-i", SRC, "-an",
         "-vf", "minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1",
         *enc(("-r", "60")), MI1], "interpolate seg1 -> 60fps")
if not os.path.exists(MI5):
    run(["ffmpeg", "-y", "-v", "error", "-ss", "19.80", "-t", "1.95", "-i", SRC, "-an",
         "-vf", "minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1",
         *enc(("-r", "120")), MI5], "interpolate seg5 -> 120fps")

# =============================================================================
# SFX  (synthesised - no sample library available)
# =============================================================================
def sfx(name, expr, dur):
    path = f"{WORK}/{name}.wav"
    if not os.path.exists(path):
        run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi",
             "-i", f"aevalsrc='{expr}':s=44100:d={dur}",
             "-ac", "2", path], f"sfx {name}")
    return path

TP = 1.19   # the punch: hero board ignites here in seg-1 output time

# rising riser into the punch
S_RISE  = sfx("rise",  f"0.30*sin(2*PI*t*(170+2300*pow(t/{TP},2.2)))*pow(t/{TP},2.6)", TP)
# deep impact boom with a downward pitch bend
S_HIT   = sfx("hit",   "0.90*sin(2*PI*52*t*(1-0.22*t))*exp(-t*5.0)+0.25*random(0)*exp(-t*38)", 1.7)
# airy whoosh
S_WHOOSH= sfx("whoosh","0.32*random(0)*exp(-pow((t-0.42)/0.20,2))", 0.9)
# UI tick for each feature line
S_TICK  = sfx("tick",  "0.30*sin(2*PI*1500*t)*exp(-t*65)+0.15*random(0)*exp(-t*90)", 0.14)

# =============================================================================
# SEG 1  0-3s  VISUAL HOOK
# =============================================================================
# base push-in 1.00 -> 1.20 (cubic ease-out) + snap-zoom punch that decays
Z1 = (f"1.08+0.16*(1-pow(1-t/3,3))"
      f"+0.22*exp(-max(0,t-{TP})/0.16)*gte(t,{TP})")

t_in = 0.28
tau  = f"(t-{t_in})"
# damped spring pop: 1.32x -> settles to 1.0
hook_size  = f"'132*(1+0.32*exp(-max(0,{tau})*9)*cos(max(0,{tau})*15))'"
hook_alpha = f"'if(lt(t,{t_in}),0,min(1,{tau}*14)*(1-max(0,min(1,(t-2.58)/0.34))))'"

f1 = (f"[0:v]setpts=PTS/0.80,{zoom_expr(Z1)},"
      # white flash on the punch frame
      f"eq=brightness='0.80*exp(-max(0,t-{TP})/0.045)*gte(t,{TP})':contrast=1.05:saturation=1.08:eval=frame,"
      + txt(HOOK_TEXT, hook_size, "(w-text_w)/2", "1215-text_h/2", hook_alpha) +
      f",fps={FPS},format=yuv420p[v]")

run(["ffmpeg", "-y", "-v", "error", "-i", MI1, "-filter_complex", f1,
     "-map", "[v]", *enc(), f"{WORK}/v1.mp4"], "seg1 video (visual hook)")

# audio: source slowed to 0.8x + riser + impact
a1 = (f"[0:a]atrim=3.35:5.75,asetpts=PTS-STARTPTS,atempo=0.80,volume=1.0[base];"
      f"[1:a]adelay=0|0,volume=0.9[r];"
      f"[2:a]adelay={int(TP*1000)}|{int(TP*1000)},volume=1.0[h];"
      f"[base][r][h]amix=inputs=3:duration=first:normalize=0,"
      f"atrim=0:3.0,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.05[a]")
run(["ffmpeg", "-y", "-v", "error", "-i", SRC, "-i", S_RISE, "-i", S_HIT,
     "-filter_complex", a1, "-map", "[a]", "-c:a", "pcm_s16le", f"{WORK}/a1.wav"], "seg1 audio")

# =============================================================================
# SEG 2  3-6s  JUMP CUTS  (durations shrink -> pacing accelerates)
# =============================================================================
CUTS = [(6.30, 0.95, 1.09,   0,-40),
        (8.15, 0.80, 1.13,  40,  0),
        (9.75, 0.65, 1.27, -55,  0),
        (12.35, 0.60, 1.42,  30, 60)]

parts, aparts = [], []
for i, (ss, dur, z, dx, dy) in enumerate(CUTS):
    pv, pa = f"{WORK}/c{i}.mp4", f"{WORK}/c{i}.wav"
    run(["ffmpeg", "-y", "-v", "error", "-ss", str(ss), "-t", str(dur), "-i", SRC, "-an",
         "-vf", zoom_static(z, dx, dy) + ",format=yuv420p", *enc(), pv], f"seg2 cut {i+1}")
    run(["ffmpeg", "-y", "-v", "error", "-ss", str(ss), "-t", str(dur), "-i", SRC, "-vn",
         "-af", f"afade=t=in:st=0:d=0.015,afade=t=out:st={dur-0.015}:d=0.015",
         "-c:a", "pcm_s16le", pa], f"seg2 cut {i+1} audio")
    parts.append(pv); aparts.append(pa)

with open(f"{WORK}/l2.txt", "w") as fh:
    for p in parts: fh.write(f"file '{p}'\n")
run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", f"{WORK}/l2.txt",
     "-c", "copy", f"{WORK}/v2.mp4"], "seg2 concat video")

ain  = sum([["-i", p] for p in aparts], [])
run(["ffmpeg", "-y", "-v", "error", *ain,
     "-filter_complex", f"{''.join(f'[{i}:a]' for i in range(len(aparts)))}concat=n={len(aparts)}:v=0:a=1[a]",
     "-map", "[a]", "-c:a", "pcm_s16le", f"{WORK}/a2.wav"], "seg2 concat audio")

# =============================================================================
# SEG 3  6-9s  ANGLE CHANGE
#   A: tight side-on, graffiti wall, slow PUSH IN
#   B: wide from behind, alley, riding into the sun, slow PULL OUT
#   opposite camera moves = reads as deliberate multi-angle coverage
# =============================================================================
ANG = [(17.30, 1.55, "1.09+0.08*(t/1.55)"),
       (28.35, 1.45, "1.16-0.07*(t/1.45)")]
aparts3 = []
for i, (ss, dur, z) in enumerate(ANG):
    run(["ffmpeg", "-y", "-v", "error", "-ss", str(ss), "-t", str(dur), "-i", SRC, "-an",
         "-vf", zoom_expr(z) + ",format=yuv420p", *enc(), f"{WORK}/g{i}.mp4"], f"seg3 angle {chr(65+i)}")
    run(["ffmpeg", "-y", "-v", "error", "-ss", str(ss), "-t", str(dur), "-i", SRC, "-vn",
         "-af", f"afade=t=in:st=0:d=0.02,afade=t=out:st={dur-0.02}:d=0.02",
         "-c:a", "pcm_s16le", f"{WORK}/g{i}.wav"], f"seg3 angle {chr(65+i)} audio")
    aparts3.append(f"{WORK}/g{i}.wav")

with open(f"{WORK}/l3.txt", "w") as fh:
    for i in range(2): fh.write(f"file '{WORK}/g{i}.mp4'\n")
run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", f"{WORK}/l3.txt",
     "-c", "copy", f"{WORK}/v3.mp4"], "seg3 concat video")
run(["ffmpeg", "-y", "-v", "error", "-i", aparts3[0], "-i", aparts3[1],
     "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[a]", "-map", "[a]",
     "-c:a", "pcm_s16le", f"{WORK}/a3.wav"], "seg3 concat audio")

# =============================================================================
# SEG 4  9-12s  ANIMATED TEXT
# =============================================================================
SCRIM = f"{WORK}/scrim.png"
if not os.path.exists(SCRIM):
    run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"color=c=black:s={W}x900",
         "-vf", "format=rgba,geq=r=0:g=0:b=0:a='215*pow(Y/H,1.5)'",
         "-frames:v", "1", SCRIM], "text scrim")

LIST_X, LIST_TOP, LINE_H, FSZ = 132, 1272, 112, 74
POPS = [0.15, 0.52, 0.89, 1.26]

BAR_H = LINE_H * 3 + FSZ + 6
chain = ["[0:v]" + zoom_expr('1.09+0.07*(t/3)') + ",eq=contrast=1.04:saturation=1.06[bg]",
         "[1:v]format=rgba,colorchannelmixer=aa=1[sc]",
         f"[bg][sc]overlay=0:{H-900}:format=auto[base]",
         # vertical accent bar grows as the list builds (per-frame scale, drawbox
         # can't animate in ffmpeg 6.1)
         f"[2:v]scale=w=8:h='max(2,min({BAR_H},(t-{POPS[0]})*430))':eval=frame[bar]",
         f"[base][bar]overlay={LIST_X-42}:{LIST_TOP-8}:format=auto,"
         f"fps={FPS},format=yuv420p[v]"]

run(["ffmpeg", "-y", "-v", "error", "-ss", "24.30", "-t", "3.0", "-i", SRC,
     "-i", SCRIM, "-f", "lavfi", "-i", f"color=c={ACCENT}:s=8x{BAR_H}:d=3:r={FPS}",
     "-filter_complex", ";".join(chain), "-map", "[v]", *enc(),
     f"{WORK}/v4_base.mp4"], "seg4 base (zoom+scrim+bar)")

# ffmpeg 6.1 segfaults with >1 expression-fontsize drawtext per graph, so the
# four spring-pop lines are burned in one pass each
prev = f"{WORK}/v4_base.mp4"
for i, (line, t0) in enumerate(zip(FEATURES, POPS)):
    tt   = f"(t-{t0})"
    size = f"'{FSZ}*(1+0.16*exp(-max(0,{tt})*11)*cos(max(0,{tt})*17))'"
    xexp = f"'{LIST_X}-70*exp(-max(0,{tt})*13)'"
    al   = f"'if(lt(t,{t0}),0,min(1,{tt}*13)*(1-max(0,min(1,(t-2.72)/0.26))))'"
    y    = LIST_TOP + i * LINE_H
    nxt  = f"{WORK}/v4_l{i}.mp4"
    run(["ffmpeg", "-y", "-v", "error", "-i", prev,
         "-vf", txt(line, size, xexp, f"{y}-text_h/2+{FSZ//2}", al) + ",format=yuv420p",
         *enc(), nxt], f"seg4 line {i+1}")
    prev = nxt
shutil.copyfile(prev, f"{WORK}/v4.mp4")

tick_in  = sum([["-i", S_TICK] for _ in POPS], [])
tick_mix = "".join(f"[{i+1}:a]adelay={int(t*1000)}|{int(t*1000)},volume=0.8[k{i}];"
                   for i, t in enumerate(POPS))
a4 = (f"[0:a]atrim=24.30:27.30,asetpts=PTS-STARTPTS[base];" + tick_mix +
      "[base]" + "".join(f"[k{i}]" for i in range(len(POPS))) +
      f"amix=inputs={len(POPS)+1}:duration=first:normalize=0[a]")
run(["ffmpeg", "-y", "-v", "error", "-i", SRC, *tick_in,
     "-filter_complex", a4, "-map", "[a]", "-c:a", "pcm_s16le", f"{WORK}/a4.wav"], "seg4 audio")

# =============================================================================
# SEG 5  12-15s  SPEED RAMP
#   smooth tanh ramp: 2.2x in -> 0.25x at the peak of the trick -> 2.2x out
#   out(t) = k * ( a*t + b*(tanh((t-c)/w) + tanh(c/w)) )     [derivative = 1/speed]
# =============================================================================
A_, C_, W_, B_, T_SRC, T_OUT = 0.45, 0.85, 0.30, 1.065, 1.95, 3.00
raw_end = A_ * T_SRC + B_ * (math.tanh((T_SRC - C_) / W_) + math.tanh(C_ / W_))
K_  = T_OUT / raw_end
TC  = math.tanh(C_ / W_)
RAMP = f"{K_:.6f}*({A_}*T+{B_}*(tanh((T-{C_})/{W_})+{TC:.6f}))"
print(f"  speed ramp: fast {1/A_/K_:.2f}x -> slow {1/(A_+B_/W_)/K_:.2f}x -> fast {1/A_/K_:.2f}x")

t_cl = 1.98
tcl  = f"(t-{t_cl})"
cl_size  = f"'104*(1+0.20*exp(-max(0,{tcl})*10)*cos(max(0,{tcl})*16))'"
cl_alpha = f"'if(lt(t,{t_cl}),0,min(1,{tcl}*12))'"
# push in through the slow section, contrast lifts with it
Z5 = "1.09+0.11*exp(-pow((t-1.45)/0.95,2))"

f5 = (f"[0:v]setpts=PTS-STARTPTS,setpts='({RAMP})/TB',{zoom_expr(Z5)},"
      f"eq=contrast='1.03+0.14*exp(-pow((t-1.45)/0.90,2))'"
      f":saturation='1.05+0.10*exp(-pow((t-1.45)/0.90,2))':eval=frame,"
      + txt(CLOSER_TEXT, cl_size, "(w-text_w)/2", "1430-text_h/2", cl_alpha) +
      f",fps={FPS},format=yuv420p[v]")
run(["ffmpeg", "-y", "-v", "error", "-i", MI5, "-filter_complex", f5,
     "-map", "[v]", *enc(), f"{WORK}/v5.mp4"], "seg5 video (speed ramp)")

# audio: stepped approximation of the same ramp (8 chunks), + whoosh in, + landing hit
def out_of(t):  return K_ * (A_ * t + B_ * (math.tanh((t - C_) / W_) + TC))
N = 8
labels, chunks = [], []
for i in range(N):
    s0, s1 = T_SRC * i / N, T_SRC * (i + 1) / N
    speed  = (s1 - s0) / (out_of(s1) - out_of(s0))
    tempo, rem = [], speed
    while rem < 0.5:                      # atempo floor is 0.5 -> chain
        tempo.append("atempo=0.5"); rem /= 0.5
    tempo.append(f"atempo={rem:.5f}")
    chunks.append(f"[0:a]atrim={19.80+s0:.4f}:{19.80+s1:.4f},asetpts=PTS-STARTPTS,"
                  + ",".join(tempo) + f",afade=t=in:st=0:d=0.01[s{i}]")
    labels.append(f"[s{i}]")
a5 = (";".join(chunks) + ";" + "".join(labels) + f"concat=n={N}:v=0:a=1[sq];"
      "[1:a]adelay=250|250,volume=0.85[w];"
      "[2:a]adelay=2050|2050,volume=0.95[h];"
      "[sq][w][h]amix=inputs=3:duration=first:normalize=0,"
      "atrim=0:3.0,asetpts=PTS-STARTPTS,afade=t=out:st=2.75:d=0.25[a]")
run(["ffmpeg", "-y", "-v", "error", "-i", SRC, "-i", S_WHOOSH, "-i", S_HIT,
     "-filter_complex", a5, "-map", "[a]", "-c:a", "pcm_s16le", f"{WORK}/a5.wav"], "seg5 audio")

# =============================================================================
# ASSEMBLE
# =============================================================================
# every segment is forced to exactly 3.000s here (frame rounding and
# minterpolate shortfalls otherwise accumulate into A/V drift at the cuts)
ins   = sum([["-i", f"{WORK}/v{i}.mp4"] for i in range(1, 6)], []) \
      + sum([["-i", f"{WORK}/a{i}.wav"] for i in range(1, 6)], [])
norm  = []
for i in range(5):
    norm.append(f"[{i}:v]tpad=stop_mode=clone:stop_duration=1,trim=duration=3.0,"
                f"setpts=PTS-STARTPTS[nv{i}]")
    norm.append(f"[{i+5}:a]apad=pad_dur=1,atrim=duration=3.0,asetpts=PTS-STARTPTS[na{i}]")
disc = (f"drawtext=fontfile={FONT}:text='{DISCLOSURE}':fontcolor=white@0.72:fontsize=30"
        f":x=26:y=h-52:shadowcolor=black@0.6:shadowx=2:shadowy=2")
graph = (";".join(norm) + ";" +
         "".join(f"[nv{i}][na{i}]" for i in range(5)) +
         f"concat=n=5:v=1:a=1[cv][ca];"
         f"[cv]{disc},format=yuv420p[v];"
         f"[ca]loudnorm=I=-14:TP=-1.0:LRA=11,aresample=44100[a]")
run(["ffmpeg", "-y", "-v", "error", *ins, "-filter_complex", graph,
     "-map", "[v]", "-map", "[a]",
     "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p",
     "-profile:v", "high", "-level", "4.0", "-r", str(FPS),
     "-c:a", "aac", "-b:a", "192k", "-ac", "2",
     "-movflags", "+faststart", OUT], "final assemble + mux")

print("\nDONE ->", OUT)
