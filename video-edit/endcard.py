#!/usr/bin/env python3
"""
3s AURAK end card (styled after the brand reference: spaced sans logotype,
Gloock serif headline, gold PURCHASE NOW button, aurak.com footer), built on
the video's own final sunset-alley frame, then appended to the selling-points
cut via stream copy — the first 30.1s (video and music) are not re-encoded.
"""
import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = "/root/.claude/uploads/9679366e-9817-50ca-b159-d23a6a892e40/e1f7bbfd-hackathon_video.mp4"
MAIN = f"{HERE}/hackathon_video_selling_points.mp4"
WORK = f"{HERE}/work2"; os.makedirs(WORK, exist_ok=True)
OUT  = f"{HERE}/hackathon_video_selling_points_endcard.mp4"

FD    = "/mnt/skills/examples/canvas-design/canvas-fonts"
SANS_B, SANS, SERIF = f"{FD}/InstrumentSans-Bold.ttf", f"{FD}/InstrumentSans-Regular.ttf", f"{FD}/Gloock-Regular.ttf"
CREAM, GOLD, SUB = "0xEDE6DA", "0xC9A36A", "0xD9D3C9"

def run(args, label):
    print(f"  -> {label}", flush=True)
    p = subprocess.run(args, capture_output=True, text=True)
    if p.returncode != 0:
        print(f"rc={p.returncode}\n{p.stderr[-3000:]}"); sys.exit(f"FAILED: {label}")

# background: the closing frame of the video (skater riding into the sun)
BG = f"{WORK}/endbg.png"
run(["ffmpeg", "-y", "-v", "error", "-ss", "29.92", "-i", SRC, "-frames:v", "1", BG], "grab bg frame")

# legibility scrims (soft gradients, top and bottom)
run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=1080x460",
     "-vf", "format=rgba,geq=r=0:g=0:b=0:a='205*pow(1-Y/H,1.5)'", "-frames:v", "1",
     f"{WORK}/scrim_top.png"], "scrim top")
run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=1080x980",
     "-vf", "format=rgba,geq=r=0:g=0:b=0:a='225*pow(Y/H,1.4)'", "-frames:v", "1",
     f"{WORK}/scrim_bot.png"], "scrim bottom")

def al(t0, k=5):                                   # staggered fade-in
    return f"min(1,max(0,(t-{t0})*{k}))"

def dtx(font, text, size, x, y, color, alpha):
    return (f"drawtext=fontfile={font}:text='{text}':fontsize={size}"
            f":x={x}:y={y}:fontcolor={color}:alpha='{alpha}'")

# gold CTA text breathes gently once revealed
cta_alpha = f"{al(0.85, 6)}*(0.84+0.16*sin(2*PI*max(0,t-0.85)/1.4))"

card = (
    # slow push-in on the graded background
    "[0:v]scale=w='2*ceil(1080*(1+0.016*t)/2)':h='2*ceil(1920*(1+0.016*t)/2)'"
    ":eval=frame:flags=bicubic,crop=1080:1920,"
    "eq=brightness=-0.08:contrast=1.10:saturation=0.68,"
    "drawbox=x=0:y=0:w=1080:h=1920:color=black@0.30:t=fill,"
    "vignette=a=PI/4.2[bg];"
    "[bg][1:v]overlay=0:0[s1];"
    "[s1][2:v]overlay=0:940[s2];"
    "[s2]"
    + dtx(SANS_B, "A U R A K", 68, "(w-text_w)/2", 150, CREAM, al(0.25)) + ","
    + dtx(SERIF, "Crafted", 88, "122", 1080, CREAM, al(0.40)) + ","
    + dtx(SERIF, "for Motion", 88, "122", 1188, CREAM, al(0.40)) + ","
    f"drawbox=x=122:y=1318:w=58:h=4:color={CREAM}@0.9:t=fill:enable='gte(t,0.55)',"
    + dtx(SANS, "P R E M I U M   M A T E R I A L S .", 33, "122", 1388, SUB, al(0.60)) + ","
    + dtx(SANS, "T I M E L E S S   D E S I G N .",     33, "122", 1444, SUB, al(0.60)) + ","
    # gold-bordered button
    f"drawbox=x=306:y=1717:w=468:h=96:color={GOLD}@0.95:t=2:enable='gte(t,0.85)',"
    + dtx(SANS, "P U R C H A S E   N O W  →", 34, "(w-text_w)/2", 1747, GOLD, cta_alpha) + ","
    + dtx(SANS, "A U R A K . C O M", 30, "(w-text_w)/2", 1848, SUB, al(1.05)) + ","
    # keep the source's AI-provenance label running through the card
    + dtx(SANS, "AI-generated", 26, "26", 1862, "white", "0.60") + ","
    "fade=t=in:st=0:d=0.35,fps=30,format=yuv420p[v]"
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
