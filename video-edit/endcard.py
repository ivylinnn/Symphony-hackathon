#!/usr/bin/env python3
"""
3s AURAK end card, v2 — natural continuation of the footage.

The card holds the video's exact final frame with its golden-hour color
intact (no black dip, no heavy monochrome grade). Soft gradient scrims and
the type fade in over the held shot, so the video reads as settling into
the card. Appended via stream copy — the first 30.1s (video and music)
are not re-encoded.
"""
import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = "/root/.claude/uploads/9679366e-9817-50ca-b159-d23a6a892e40/e1f7bbfd-hackathon_video.mp4"
MAIN = f"{HERE}/hackathon_video_selling_points.mp4"
WORK = f"{HERE}/work2"; os.makedirs(WORK, exist_ok=True)
OUT  = f"{HERE}/hackathon_video_selling_points_endcard.mp4"

FD    = "/mnt/skills/examples/canvas-design/canvas-fonts"
SANS_B, SANS, SERIF = f"{FD}/InstrumentSans-Bold.ttf", f"{FD}/InstrumentSans-Regular.ttf", f"{FD}/Gloock-Regular.ttf"
CREAM, GOLD, SUB = "0xF2ECE1", "0xE8C284", "0xE3DCD0"

def run(args, label):
    print(f"  -> {label}", flush=True)
    p = subprocess.run(args, capture_output=True, text=True)
    if p.returncode != 0:
        print(f"rc={p.returncode}\n{p.stderr[-3000:]}"); sys.exit(f"FAILED: {label}")

# background: the video's exact final frame, so the card continues the shot
BG = f"{WORK}/endbg_last.png"
run(["ffmpeg", "-y", "-v", "error", "-sseof", "-0.2", "-i", SRC,
     "-update", "1", "-frames:v", "1", BG], "grab final frame")

# soft legibility scrims — gradients only, the sun glow stays visible mid-frame
run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=1080x430",
     "-vf", "format=rgba,geq=r=12:g=9:b=6:a='190*pow(1-Y/H,1.6)'", "-frames:v", "1",
     f"{WORK}/scrim_top.png"], "scrim top")
run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=1080x1080",
     "-vf", "format=rgba,geq=r=14:g=10:b=7:a='225*pow(Y/H,1.35)'", "-frames:v", "1",
     f"{WORK}/scrim_bot.png"], "scrim bottom")

def al(t0, k=4):                                    # staggered fade-in, no fade-out
    return f"min(1,max(0,(t-{t0})*{k}))"

def dtx(font, text, size, x, y, color, alpha):
    return (f"drawtext=fontfile={font}:text='{text}':fontsize={size}"
            f":x={x}:y={y}:fontcolor={color}:alpha='{alpha}'")

card = (
    # patch out the frame's baked-in provenance label (it would drift with the
    # zoom and double up with the static one drawn below), then the slow push-in
    "[0:v]delogo=x=18:y=1836:w=248:h=58,"
    "scale=w='2*ceil(1080*(1+0.014*t)/2)':h='2*ceil(1920*(1+0.014*t)/2)'"
    ":eval=frame:flags=bicubic,crop=1080:1920,"
    "eq=brightness=-0.05:contrast=1.06:saturation=0.90,"
    "vignette=a=PI/5[bg];"
    # scrims breathe in over the held frame instead of cutting to a dark look
    "[1:v]fade=t=in:st=0.15:d=0.60:alpha=1[st];"
    "[2:v]fade=t=in:st=0.15:d=0.60:alpha=1[sb];"
    "[bg][st]overlay=0:0[s1];"
    "[s1][sb]overlay=0:840[s2];"
    "[s2]"
    + dtx(SANS_B, "A U R A K", 68, "(w-text_w)/2", 150, CREAM, al(0.45)) + ","
    + dtx(SERIF, "Crafted", 88, "122", 1080, CREAM, al(0.60)) + ","
    + dtx(SERIF, "for Motion", 88, "122", 1188, CREAM, al(0.60)) + ","
    f"drawbox=x=122:y=1318:w=58:h=4:color={CREAM}@0.9:t=fill:enable='gte(t,0.75)',"
    + dtx(SANS, "P R E M I U M   M A T E R I A L S .", 33, "122", 1388, SUB, al(0.80)) + ","
    + dtx(SANS, "T I M E L E S S   D E S I G N .",     33, "122", 1444, SUB, al(0.80)) + ","
    # gold-bordered button, steady once revealed
    f"drawbox=x=306:y=1717:w=468:h=96:color={GOLD}@0.95:t=2:enable='gte(t,1.00)',"
    + dtx(SANS, "P U R C H A S E   N O W  →", 34, "(w-text_w)/2", 1747, GOLD, al(1.00, 6)) + ","
    + dtx(SANS, "A U R A K . C O M", 30, "(w-text_w)/2", 1848, SUB, al(1.15)) + ","
    # keep the source's AI-provenance label running through the card
    + dtx(SANS, "AI-generated", 26, "26", 1862, "white", "0.60") + ","
    "fps=30,format=yuv420p[v]"
)

# encode with the same stream parameters as the main cut so concat can stream-copy
run(["ffmpeg", "-y", "-v", "error",
     "-loop", "1", "-framerate", "30", "-t", "3", "-i", BG,
     "-i", f"{WORK}/scrim_top.png", "-i", f"{WORK}/scrim_bot.png",
     "-f", "lavfi", "-t", "3", "-i", "anullsrc=r=44100:cl=stereo",
     "-filter_complex", card, "-map", "[v]", "-map", "3:a",
     "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
     "-profile:v", "high", "-level", "4.0", "-r", "30",
     "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
     "-shortest", f"{WORK}/endcard.mp4"], "render end card")

# append without touching the main cut: both streams are concat-copied
with open(f"{WORK}/cat.txt", "w") as fh:
    fh.write(f"file '{MAIN}'\nfile '{WORK}/endcard.mp4'\n")
run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", f"{WORK}/cat.txt",
     "-c", "copy", "-movflags", "+faststart", OUT], "concat (stream copy)")

print("\nDONE ->", OUT)
