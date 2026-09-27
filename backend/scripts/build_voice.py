# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = [
#   "kokoro==0.9.4",
#   "soundfile",
#   "pip",
#   "en_core_web_sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl",
# ]
# ///
"""Record the narrator's voice for the saved briefings, so the Briefing tab sounds like a person
instead of the browser's built-in voice.

    uv run backend/scripts/build_voice.py            # from the repo root; needs ffmpeg on PATH

Reads every saved portfolio briefing (frontend/public/saved/briefing/portfolio/*.json) and reads
each line's `say` aloud with Kokoro-82M (hexgrad, Apache-2.0, open weights, runs on the CPU; the
weights come from Hugging Face on the first run). Writes frontend/public/saved/voice/:
  - <hash>.mp3 for each line;
  - index.json, keyed by the exact `say` text: the file, its length, when each word starts (for the
    captions) and how loud it is every 50 ms (for the orb).
The tab plays a recording only when its key is the line's `say` exactly, so a line that changes
after this ran falls back to the browser's voice until this runs again. The words themselves are
never changed: the only rewrite is how a date is said ("September 25" -> "September twenty-fifth").
"""

import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

REPO = Path(__file__).resolve().parents[2]
SAVED = REPO / "frontend" / "public" / "saved"
OUT = SAVED / "voice"
VOICE = "af_heart"  # Kokoro's best-graded voice (A): warm American English
SPEED = 1.0
RATE = 24000  # Kokoro's sample rate
FRAME = RATE // 20  # the loudness envelope: one value per 50 ms

MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December"
UNITS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
         "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth",
         "eighteenth", "nineteenth"]


def ordinal(n: int) -> str:
    """1..31 as a spoken ordinal: 3 -> third, 25 -> twenty-fifth."""
    if n < 20:
        return UNITS[n]
    tens = {2: "twenty", 3: "thirty"}[n // 10]
    return f"{tens}-{UNITS[n % 10]}" if n % 10 else f"{tens[:-1]}ieth"


def spoken_form(say: str) -> str:
    """How the voice should say a line. Kokoro reads "September 25" as "September twenty five"; people
    say "September twenty-fifth". A year right after a month ("August 2024") is left alone."""
    s = re.sub(rf"\b({MONTHS}) (\d{{1,2}})\b", lambda m: f"{m.group(1)} {ordinal(int(m.group(2)))}", say)
    return re.sub(r"\$(\d+)\.0 (billion|million)", r"$\1 \2", s)


def says() -> list[str]:
    """Every distinct `say` in the saved portfolio briefings, in the order they're spoken."""
    seen: dict[str, None] = {}
    for path in sorted((SAVED / "briefing" / "portfolio").glob("*.json")):
        for line in json.loads(path.read_text()).get("lines", []):
            say = (line.get("say") or "").strip()
            if say:
                seen.setdefault(say, None)
    return list(seen)


def record(pipe: KPipeline, text: str) -> tuple[np.ndarray, list[float]]:
    """The audio for one line, and when each spoken word starts (seconds from the clip's start)."""
    chunks, starts, offset = [], [], 0.0
    for r in pipe(text, voice=VOICE, speed=SPEED):
        audio = r.audio.numpy()
        for tk in r.tokens or []:
            if tk.start_ts is not None and any(c.isalnum() for c in tk.text):
                starts.append(round(offset + tk.start_ts, 3))
        chunks.append(audio)
        offset += len(audio) / RATE
    return np.concatenate(chunks), starts


def loudness(audio: np.ndarray) -> list[float]:
    """RMS every 50 ms, scaled so the line's loud parts sit near 1."""
    frames = [audio[i:i + FRAME] for i in range(0, len(audio), FRAME)]
    rms = np.array([float(np.sqrt(np.mean(f ** 2))) if len(f) else 0.0 for f in frames])
    top = float(np.percentile(rms, 95)) or 1.0
    return [round(min(1.0, v / top), 2) for v in rms]


def to_mp3(audio: np.ndarray, dest: Path) -> None:
    with tempfile.NamedTemporaryFile(suffix=".wav") as wav:
        sf.write(wav.name, audio, RATE)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav.name, "-ac", "1", "-codec:a", "libmp3lame",
                        "-b:a", "64k", str(dest)], check=True)


def main() -> None:
    lines = says()
    if not lines:
        sys.exit("No saved portfolio briefings to record (run scripts/build_saved.py first).")
    OUT.mkdir(parents=True, exist_ok=True)
    index_path = OUT / "index.json"
    old = json.loads(index_path.read_text()).get("lines", {}) if index_path.exists() else {}
    pipe = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    out: dict[str, dict] = {}
    for say in lines:
        text = spoken_form(say)
        name = hashlib.sha1(f"{VOICE}|{SPEED}|{text}".encode()).hexdigest()[:16] + ".mp3"
        prev = old.get(say)
        if prev and prev.get("src") == f"/saved/voice/{name}" and (OUT / name).exists():
            out[say] = prev  # already recorded, same words and voice
            continue
        audio, starts = record(pipe, text)
        to_mp3(audio, OUT / name)
        out[say] = {"src": f"/saved/voice/{name}", "dur": round(len(audio) / RATE, 3), "words": starts,
                    "level": loudness(audio)}
        print(f"{out[say]['dur']:6.2f}s  {say}")
    keep = {Path(v["src"]).name for v in out.values()}
    for f in OUT.glob("*.mp3"):
        if f.name not in keep:
            f.unlink()  # a line that's no longer said
    # One line of the file per recording, so a re-record reads as a small diff.
    rows = ",\n".join(f"  {json.dumps(say, ensure_ascii=False)}: {json.dumps(v, separators=(',', ':'))}" for say, v in out.items())
    index_path.write_text(
        '{\n "engine": "Kokoro-82M v1.0 (hexgrad/Kokoro-82M, Apache-2.0)",\n'
        f' "voice": {json.dumps(VOICE)},\n "lines": {{\n{rows}\n }}\n}}\n'
    )
    print(f"{len(out)} lines, {sum(v['dur'] for v in out.values()):.0f}s of audio -> {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
