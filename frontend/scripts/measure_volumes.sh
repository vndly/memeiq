#!/usr/bin/env bash

# Measures the loudness of every meme in the catalogue and prints the YouTube player volume (1-100)
# that makes them all sound equally loud. Requires yt-dlp (with a JavaScript runtime such as deno) and ffmpeg.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMES_FILE="${SCRIPT_DIR}/../src/assets/memes.json"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT
RESULTS_FILE="${WORK_DIR}/results.tsv"
touch "${RESULTS_FILE}"

while IFS=$'\t' read -r id name url; do
  echo "Measuring ${id}: ${name}..." >&2
  loudness=""

  if audio_file="$(yt-dlp --quiet --no-warnings --no-playlist --no-simulate --format bestaudio \
    --output "${WORK_DIR}/${id}.%(ext)s" --print after_move:filepath "${url}" < /dev/null)"; then
    # The integrated loudness is the "I:" line of the summary printed when the filter finishes
    loudness="$(ffmpeg -nostdin -nostats -hide_banner -i "${audio_file}" -af ebur128 -f null - 2>&1 \
      | awk '$1 == "I:" { value = $2 } END { print value }')" || true
    rm -f "${audio_file}"
  fi

  if [ -z "${loudness}" ]; then
    echo "  Failed to measure ${id}: ${name}" >&2
  fi

  printf '%s\t%s\t%s\n' "${id}" "${name}" "${loudness}" >> "${RESULTS_FILE}"
done < <(node -e '
  const fs = require("node:fs");
  const memes = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
  for (const meme of memes) {
    console.log([meme.id, meme.name, meme.url].join("\t"));
  }
' "${MEMES_FILE}")

node -e '
  const fs = require("node:fs");

  // YouTube already turns down videos louder than this, so they play at this level
  const YOUTUBE_LOUDNESS_CEILING_LUFS = -14;
  // The target is this percentile of the quietest memes, so a single very quiet outlier does not turn every meme down
  const TARGET_PERCENTILE = 0.1;
  const MIN_VOLUME = 1;
  const MAX_VOLUME = 100;

  const results = fs.readFileSync(process.argv[1], "utf-8").trim().split("\n").map((line) => {
    const [id, name, loudness] = line.split("\t");
    // A failed last row loses its empty loudness field to trim(), so loudness can be undefined as well as ""
    const measuredLoudness = loudness === undefined || loudness === "" || !Number.isFinite(Number(loudness)) ? null : Number(loudness);
    const effectiveLoudness = measuredLoudness === null ? null : Math.min(measuredLoudness, YOUTUBE_LOUDNESS_CEILING_LUFS);
    return {id: id, name: name, measuredLoudness: measuredLoudness, effectiveLoudness: effectiveLoudness};
  });

  const sortedLoudness = results.map((result) => result.effectiveLoudness).filter((value) => value !== null).sort((a, b) => a - b);
  if (sortedLoudness.length === 0) {
    console.error("Error: No meme could be measured.");
    process.exit(1);
  }
  const targetLoudness = sortedLoudness[Math.floor((sortedLoudness.length - 1) * TARGET_PERCENTILE)];

  for (const result of results) {
    result.volume = result.effectiveLoudness === null
      ? "FAILED"
      : Math.min(MAX_VOLUME, Math.max(MIN_VOLUME, Math.round(100 * 10 ** ((targetLoudness - result.effectiveLoudness) / 20))));
  }

  console.log(`Target loudness: ${targetLoudness} LUFS\n`);
  console.log(["id", "name", "loudness (LUFS)", "volume"].join("\t"));
  for (const result of results) {
    console.log([result.id, result.name, result.measuredLoudness ?? "-", result.volume].join("\t"));
  }

  console.log("\nVolume column (in catalogue order):");
  for (const result of results) {
    console.log(result.volume);
  }
' "${RESULTS_FILE}"
