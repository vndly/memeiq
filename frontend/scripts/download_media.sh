#!/usr/bin/env bash

# Downloads the audio (as an MP3 levelled to a common loudness) and the thumbnail (cropped to 16:9) of every
# catalogue meme that does not have them yet, so the app never loads anything from YouTube.
# Requires yt-dlp (with a JavaScript runtime such as deno) and ffmpeg.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMES_FILE="${SCRIPT_DIR}/../src/assets/memes.json"
MEDIA_DIR="${SCRIPT_DIR}/../src/assets/memes"
AUDIO_DIR="${MEDIA_DIR}/audio"
THUMBNAILS_DIR="${MEDIA_DIR}/thumbnails"
# Integrated loudness every meme is levelled to (the EBU R128 broadcast target)
TARGET_LOUDNESS_LUFS=-23
# Peak amplitude the limiter holds a boosted meme under (about -1 dBFS)
PEAK_LIMIT=0.891
# Integrated loudness ffmpeg reports when a clip is silent or too short to measure
UNMEASURABLE_LOUDNESS_LUFS=-70
# YouTube thumbnails are 4:3 with the 16:9 picture letterboxed in the middle, so keep a centred 16:9 area
# slightly inside it (98% of the width), which leaves out the blurred edges of the black bands
THUMBNAIL_CROP_FILTER="crop=w=trunc(iw*0.98/2)*2:h=trunc(iw*0.98*9/16/2)*2:exact=1"

# Read the catalogue up front, since a failure inside a process substitution would go unnoticed
catalogue_rows="$(node -e '
  const fs = require("node:fs");
  const memes = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
  for (const meme of memes) {
    console.log([meme.id, meme.name, meme.url].join("\t"));
  }
' "${MEMES_FILE}")"
if [ -z "${catalogue_rows}" ]; then
  echo "Error: The meme catalogue is empty." >&2
  exit 1
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT
mkdir -p "${AUDIO_DIR}" "${THUMBNAILS_DIR}"
failure_count=0

while IFS=$'\t' read -r id name url; do
  # The id becomes a file name, so it must be a plain YouTube video id
  if [[ ! "${id}" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "Invalid id \"${id}\": ${name}" >&2
    failure_count=$((failure_count + 1))
    continue
  fi

  audio_file="${AUDIO_DIR}/${id}.mp3"
  if [ ! -f "${audio_file}" ]; then
    echo "Downloading audio for ${id}: ${name}..."
    is_audio_saved=false
    if source_file="$(yt-dlp --quiet --no-warnings --no-playlist --no-simulate --format bestaudio \
      --output "${WORK_DIR}/${id}.%(ext)s" --print after_move:filepath "${url}" < /dev/null)"; then
      # The integrated loudness is the "I:" line of the summary printed when the filter finishes
      loudness="$(ffmpeg -nostdin -nostats -hide_banner -i "${source_file}" -af ebur128 -f null - 2>&1 \
        | awk '$1 == "I:" { value = $2 } END { print value }')" || true
      if [ -n "${loudness}" ] && awk -v value="${loudness}" -v floor="${UNMEASURABLE_LOUDNESS_LUFS}" 'BEGIN { exit !(value > floor) }'; then
        gain="$(awk -v target="${TARGET_LOUDNESS_LUFS}" -v value="${loudness}" 'BEGIN { printf "%.2f", target - value }')"
        if ffmpeg -nostdin -loglevel error -i "${source_file}" -vn -map_metadata -1 \
          -af "volume=${gain}dB,alimiter=limit=${PEAK_LIMIT}:level=false" \
          -ar 44100 -codec:a libmp3lame -b:a 128k "${WORK_DIR}/${id}.mp3" \
          && mv "${WORK_DIR}/${id}.mp3" "${audio_file}"; then
          is_audio_saved=true
        fi
      fi
      rm -f "${source_file}"
    fi
    if [ "${is_audio_saved}" = false ]; then
      echo "  Failed to download audio for ${id}: ${name}" >&2
      failure_count=$((failure_count + 1))
    fi
  fi

  thumbnail_file="${THUMBNAILS_DIR}/${id}.jpg"
  if [ ! -f "${thumbnail_file}" ]; then
    echo "Downloading thumbnail for ${id}: ${name}..."
    if ! { curl --ipv4 -fsSL --connect-timeout 10 --retry 3 "https://img.youtube.com/vi/${id}/hqdefault.jpg" -o "${WORK_DIR}/${id}.source.jpg" \
      && ffmpeg -nostdin -loglevel error -i "${WORK_DIR}/${id}.source.jpg" -map_metadata -1 -vf "${THUMBNAIL_CROP_FILTER}" -q:v 2 "${WORK_DIR}/${id}.jpg" \
      && mv "${WORK_DIR}/${id}.jpg" "${thumbnail_file}"; }; then
      echo "  Failed to download thumbnail for ${id}: ${name}" >&2
      failure_count=$((failure_count + 1))
    fi
  fi
done <<< "${catalogue_rows}"

if [ "${failure_count}" -gt 0 ]; then
  echo "Error: ${failure_count} download(s) failed." >&2
  exit 1
fi

echo "Meme media is up to date in ${MEDIA_DIR}"
