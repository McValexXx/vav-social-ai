#!/usr/bin/env python3
"""Render a Russian VAV Group Reel from a Worker-generated image and script."""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import subprocess
import textwrap
import urllib.request
from pathlib import Path


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def ass_time(seconds: float) -> str:
    millis = max(0, round(seconds * 1000))
    hours, millis = divmod(millis, 3_600_000)
    minutes, millis = divmod(millis, 60_000)
    secs, millis = divmod(millis, 1000)
    return f"{hours}:{minutes:02}:{secs:02}.{millis // 10:02}"


def subtitle_chunks(text: str, max_chars: int = 54) -> list[str]:
    sentences = [item.strip() for item in re.split(r"(?<=[.!?])\s+", text) if item.strip()]
    chunks: list[str] = []
    for sentence in sentences:
        chunks.extend(textwrap.wrap(sentence, width=max_chars, break_long_words=False, break_on_hyphens=False))
    return chunks or [text]


def write_ass(text: str, total: float, target: Path) -> None:
    chunks = subtitle_chunks(text)
    weights = [max(1, len(re.findall(r"\w+", chunk, re.UNICODE))) for chunk in chunks]
    total_weight = sum(weights)
    cursor = 0.0
    blocks = ["""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,DejaVu Sans,54,&H00FFFFFF,&H00FFFFFF,&HAA031426,&HAA031426,-1,0,0,0,100,100,0,0,3,2,0,2,70,70,190,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"""]
    for index, (chunk, weight) in enumerate(zip(chunks, weights), start=1):
        end = total if index == len(chunks) else cursor + total * weight / total_weight
        safe = r"\N".join(textwrap.wrap(chunk, width=32, break_long_words=False, break_on_hyphens=False))
        safe = safe.replace("{", "(").replace("}", ")")
        blocks.append(f"Dialogue: 0,{ass_time(cursor)},{ass_time(end)},Caption,,0,0,0,,{safe}")
        cursor = end
    target.write_text("\n".join(blocks) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--payload", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--image-file")
    parser.add_argument("--voice-file")
    args = parser.parse_args()

    payload = json.loads(Path(args.payload).read_text(encoding="utf-8"))
    post_id = str(payload["post_id"])
    title = str(payload["title"]).strip()
    narration = str(payload["narration"]).strip()
    image_url = str(payload["image_url"])
    if not post_id.isdigit() or not title or not narration or not image_url.startswith("https://"):
        raise ValueError("Invalid render payload")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    work = output.parent
    image = work / "source.jpg"
    narration_file = work / "narration.txt"
    title_file = work / "title.txt"
    voice = work / "voice.wav"
    subtitles = work / "subtitles.ass"

    if args.image_file:
        shutil.copyfile(args.image_file, image)
    else:
        request = urllib.request.Request(image_url, headers={"User-Agent": "VAV-Social-AI-Renderer/2.0"})
        with urllib.request.urlopen(request, timeout=60) as response:
            image.write_bytes(response.read())
    if image.stat().st_size < 10_000:
        raise ValueError("Downloaded image is too small")

    narration_file.write_text(narration, encoding="utf-8")
    title_file.write_text("\n".join(textwrap.wrap(title, width=22, break_long_words=False)), encoding="utf-8")
    if args.voice_file:
        shutil.copyfile(args.voice_file, voice)
    else:
        run([
            "python3", "-m", "piper", "-m", args.model, "-f", str(voice),
            "--input-file", str(narration_file),
        ])
    audio_duration = duration(voice)
    if not 8 <= audio_duration <= 75:
        raise ValueError(f"Unexpected narration duration: {audio_duration:.1f}s")
    write_ass(narration, audio_duration, subtitles)

    frames = math.ceil((audio_duration + 0.4) * 30)
    font_bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    filter_graph = (
        "[0:v]scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,"
        f"zoompan=z='min(zoom+0.00065,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s=1080x1920:fps=30,"
        "eq=brightness=-0.12:saturation=1.08,"
        "drawbox=x=0:y=0:w=iw:h=ih:color=0x031426@0.28:t=fill,"
        f"drawtext=fontfile={font_bold}:textfile={title_file}:fontcolor=white:fontsize=64:line_spacing=16:"
        "x=(w-text_w)/2:y=h*0.18-text_h/2:box=1:boxcolor=0x031426@0.70:boxborderw=30:"
        "enable='between(t,0,5.2)',"
        f"drawtext=fontfile={font_bold}:text='VAV GROUP':fontcolor=0x43B7FF:fontsize=34:x=64:y=70,"
        f"ass={subtitles}:fontsdir=/usr/share/fonts/truetype/dejavu[v]"
    )
    run([
        "ffmpeg", "-y", "-loop", "1", "-framerate", "30", "-i", str(image), "-i", str(voice),
        "-filter_complex", filter_graph, "-map", "[v]", "-map", "1:a:0", "-shortest",
        "-c:v", "libx264", "-preset", "medium", "-profile:v", "high", "-level", "4.1",
        "-pix_fmt", "yuv420p", "-r", "30", "-b:v", "3200k", "-maxrate", "4000k", "-bufsize", "6400k",
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-af", "loudnorm=I=-16:LRA=7:TP=-1.5",
        "-movflags", "+faststart", str(output),
    ])

    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name", "-of", "json", str(output)],
        check=True,
        capture_output=True,
        text=True,
    )
    stream = json.loads(probe.stdout)["streams"][0]
    if stream.get("width") != 1080 or stream.get("height") != 1920 or stream.get("codec_name") != "h264":
        raise ValueError(f"Invalid output stream: {stream}")
    if output.stat().st_size > 45 * 1024 * 1024:
        raise ValueError("Rendered Reel exceeds 45 MB")


if __name__ == "__main__":
    main()
