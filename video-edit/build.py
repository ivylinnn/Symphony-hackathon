#!/usr/bin/env python3
"""
Selling-point overlay cut of hackathon_video.mp4 (hoodie).

The original 30s video and its soundtrack are kept 1:1 — no cuts, no speed
changes, no zooms; the audio stream is copied bit-for-bit. All creativity is
kinetic typography timed to the footage:

  0.7-2.9   intro       MORE THAN A HOODIE                (sets up the list)
  4.3-6.0   01          BREATHABLE FABRIC                 on the glowing-board kickflip
  6.6-9.3   02          VERSATILE LAYERING                fence-line ride, words slide in from both sides
  10.3-13.2 03          FUNCTIONAL KANGAROO POCKET        street cruise, 3-line stagger + accent bar
  17.4-19.7 04          RELAXED, COMFORTABLE FIT          slow side-on glide, lazy fade + drift
  22.4-25.5 05          IDEAL FOR / ACTIVE + EVERYDAY WEAR  dome cruise, spring pop
  26.9-29.6 outro       YOUR EVERYDAY HOODIE              riding into the sunset

The two flip tricks at 13.5-17 and 19.8-21.7 are left clean on purpose —
the footage breathes between text beats.
"""
import os, subprocess, sys

SRC  = "/root/.claude/uploads/9679366e-9817-50ca-b159-d23a6a892e40/e1f7bbfd-hackathon_video.mp4"
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work2"); os.makedirs(WORK, exist_ok=True)
OUT  = os.path.join(HERE, "hackathon_video_selling_points.mp4")

FONT   = "/mnt/skills/examples/canvas-design/canvas-fonts/BigShoulders-Bold.ttf"
ACCENT = "0xFF6B1A"      # sampled from the glowing board / golden hour
W, H, FPS = 1080, 1920, 30

def run(args, label):
    print(f"  -> {label}", flush=True)
    p = subprocess.run(args, capture_output=True, text=True)
    if p.returncode != 0:
        print(f"rc={p.returncode}\nSTDERR:\n{p.stderr[-4000:]}")
        sys.exit(f"FAILED: {label}")

# fade-in k, hold, 0.3s fade-out ending at t1
def fade(t0, t1, k=8):
    return (f"if(lt(t,{t0}),0,min(1,(t-{t0})*{k})"
            f"*(1-max(0,min(1,(t-{t1-0.30})/0.30))))")

def dt(text, size, x, y, alpha, t0, t1, color="white", extra=""):
    return (f"drawtext=fontfile={FONT}:text='{text}':fontcolor={color}"
            f":fontsize={size}:x={x}:y={y}:alpha='{alpha}'"
            f":shadowcolor=black@0.55:shadowx=3:shadowy=4"
            f":borderw=3:bordercolor=black@0.28"
            f":enable='between(t,{t0},{t1})'{extra}")

# damped-spring scale that starts exactly at t0 (clamped: never blows up pre-t0)
def spring(base, t0, amp=0.20, d=10, f=16):
    tt = f"(t-{t0})"
    return f"'{base}*(1+{amp}*exp(-max(0,{tt})*{d})*cos(max(0,{tt})*{f}))'"

# animated accent bar: color-source input scaled per frame, faded via alpha
def bar_chain(idx, kind, grow_t0, t0, t1, target, speed):
    dim = (f"w='max(2,min({target},(t-{grow_t0})*{speed}))':h=8" if kind == "h"
           else f"w=8:h='max(2,min({target},(t-{grow_t0})*{speed}))'")
    return (f"[{idx}:v]format=rgba,scale={dim}:eval=frame,"
            f"fade=t=in:st={t0}:d=0.15:alpha=1,"
            f"fade=t=out:st={t1-0.30}:d=0.30:alpha=1[bar{idx}]")

# =============================================================================
# PASS 1 — intro, points 01-04 (01 uses the pass's one spring-scale text)
# =============================================================================
P = []

# intro 0.70-2.90
P.append(dt("MORE THAN A HOODIE", 60, "(w-text_w)/2", 1520, fade(0.70, 2.90, 6), 0.65, 2.95))

# 01  BREATHABLE FABRIC  4.30-6.00  (hero kickflip, board glowing)
P.append(dt("01", 44, "(w-text_w)/2", 1118, fade(4.30, 6.00), 4.25, 6.05, color=ACCENT))
P.append(dt("BREATHABLE FABRIC", spring(96, 4.42), "(w-text_w)/2", 1205,
            fade(4.42, 6.00, 12), 4.35, 6.05))

# 02  VERSATILE LAYERING  6.60-9.30  (fence line; words slide in from both sides)
t2 = 6.72
P.append(dt("02", 44, "(w-text_w)/2", 1328, fade(6.60, 9.30), 6.55, 9.35, color=ACCENT))
P.append(dt("VERSATILE", 88, f"'526-text_w-380*exp(-max(0,(t-{t2}))*7)'", 1415,
            fade(t2, 9.30, 9), 6.60, 9.35))
P.append(dt("LAYERING", 88, f"'554+380*exp(-max(0,(t-{t2}))*7)'", 1415,
            fade(t2, 9.30, 9), 6.60, 9.35))

# 03  FUNCTIONAL KANGAROO POCKET  10.30-13.20  (street cruise; 3-line stagger)
P.append(dt("03", 44, "150", 1206, fade(10.30, 13.20), 10.25, 13.25, color=ACCENT))
for i, word in enumerate(["FUNCTIONAL", "KANGAROO", "POCKET"]):
    t0 = 10.42 + i * 0.16
    P.append(dt(word, 80, f"'150-46*exp(-max(0,(t-{t0}))*11)'", 1298 + i * 108,
                fade(t0, 13.20, 11), 10.30, 13.25))

# 04  RELAXED, COMFORTABLE FIT  17.40-19.70  (side-on glide; lazy fade + drift)
t4 = 17.52
P.append(dt("04", 44, "(w-text_w)/2", 1305, fade(17.40, 19.70, 5), 17.35, 19.75, color=ACCENT))
P.append(dt("RELAXED, COMFORTABLE FIT", 74, "(w-text_w)/2",
            f"'1392+12*min(1,max(0,(t-{t4}))/2.0)'",
            fade(t4, 19.70, 4), 17.40, 19.75))

g1 = ("[0:v]" + ",".join(P) + "[txt];"
      + bar_chain(1, "h", 4.55, 4.45, 6.00, 360, 900) + ";"
      + bar_chain(2, "v", 10.45, 10.35, 13.20, 306, 620) + ";"
      "[txt][bar1]overlay=x=(W-w)/2:y=1338:enable='between(t,4.45,6.0)'[o1];"
      "[o1][bar2]overlay=x=104:y=1290:enable='between(t,10.35,13.2)',"
      "format=yuv420p[v]")

run(["ffmpeg", "-y", "-v", "error", "-i", SRC,
     "-f", "lavfi", "-i", f"color=c={ACCENT}:s=360x8:d=30:r={FPS}",
     "-f", "lavfi", "-i", f"color=c={ACCENT}:s=8x306:d=30:r={FPS}",
     "-filter_complex", g1, "-map", "[v]", "-an",
     "-c:v", "libx264", "-preset", "medium", "-crf", "10",
     "-pix_fmt", "yuv420p", "-r", str(FPS),
     f"{WORK}/pass1.mp4"], "pass 1: intro + points 01-04")

# =============================================================================
# PASS 2 — point 05 (spring), outro, accent bars, mux with UNTOUCHED audio
# =============================================================================
Q = []

# 05  IDEAL FOR / ACTIVE + EVERYDAY WEAR  22.40-25.50  (dome cruise)
Q.append(dt("05  ·  IDEAL FOR", 46, "(w-text_w)/2", 1236, fade(22.40, 25.50), 22.35, 25.55,
            color=ACCENT))
Q.append(dt("ACTIVE + EVERYDAY WEAR", spring(82, 22.72), "(w-text_w)/2", 1326,
            fade(22.72, 25.50, 11), 22.65, 25.55))

# outro 26.90-29.60
Q.append(dt("YOUR EVERYDAY HOODIE", 62, "(w-text_w)/2", 1498, fade(26.90, 29.60, 5), 26.85, 29.65))

g2 = ("[0:v]" + ",".join(Q) + "[txt];"
      + bar_chain(2, "h", 22.85, 22.75, 25.50, 360, 900) + ";"
      + bar_chain(3, "h", 27.30, 27.20, 29.60, 220, 500) + ";"
      "[txt][bar2]overlay=x=(W-w)/2:y=1448:enable='between(t,22.75,25.5)'[o1];"
      "[o1][bar3]overlay=x=(W-w)/2:y=1588:enable='between(t,27.2,29.6)',"
      "format=yuv420p[v]")

run(["ffmpeg", "-y", "-v", "error", "-i", f"{WORK}/pass1.mp4", "-i", SRC,
     "-f", "lavfi", "-i", f"color=c={ACCENT}:s=360x8:d=30:r={FPS}",
     "-f", "lavfi", "-i", f"color=c={ACCENT}:s=220x8:d=30:r={FPS}",
     "-filter_complex", g2, "-map", "[v]", "-map", "1:a:0",
     "-c:v", "libx264", "-preset", "slow", "-crf", "18",
     "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.0", "-r", str(FPS),
     "-c:a", "copy",                     # original soundtrack, bit-for-bit
     "-movflags", "+faststart", OUT], "pass 2: point 05 + outro + mux (audio copied)")

print("\nDONE ->", OUT)
