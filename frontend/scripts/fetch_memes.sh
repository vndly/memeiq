#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/../src/assets/memes.json"
MEME_CATALOGUE_URL="https://script.google.com/macros/s/AKfycbwo0-EesudXLef03CbyhU5sNG7gsCDJPhXKvVvRqxljpDBrnbTx0f9gpVXKna-CspCXrA/exec"
MAX_ATTEMPTS=5
RETRY_DELAY_SECONDS=3

TMP_FILE="$(mktemp)"
trap 'rm -f "${TMP_FILE}"' EXIT

for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt++)); do
  echo "Fetching meme catalogue (attempt ${attempt}/${MAX_ATTEMPTS})..."
  if curl --ipv4 -sSL --connect-timeout 10 "${MEME_CATALOGUE_URL}" -o "${TMP_FILE}" 2>/dev/null; then
    if node -e '
      const fs = require("node:fs");
      const filePath = process.argv[1];
      const fail = (reason) => {
        console.error(`  Invalid catalogue: ${reason}`);
        process.exit(1);
      };
      // Video ID of a youtube.com/watch?v=, youtu.be/ or youtube.com/shorts/ URL, or null for any other URL
      const getVideoId = (url) => {
        let parsedUrl;
        try {
          parsedUrl = new URL(url);
        } catch {
          return null;
        }
        const host = parsedUrl.hostname.replace(/^(www|m)\./, "");
        if (host === "youtu.be") {
          return parsedUrl.pathname.split("/")[1] || null;
        }
        if (host === "youtube.com" && parsedUrl.pathname === "/watch") {
          return parsedUrl.searchParams.get("v");
        }
        if (host === "youtube.com") {
          return /^\/shorts\/([^/]+)/.exec(parsedUrl.pathname)?.[1] ?? null;
        }
        return null;
      };
      let data;
      try {
        data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      } catch {
        fail("the response is not JSON");
      }
      if (!Array.isArray(data) || data.length === 0) {
        fail("expected a non-empty array of memes");
      }
      const seenIds = new Set();
      for (const item of data) {
        if (typeof item?.id !== "string" || typeof item.name !== "string" || typeof item.url !== "string") {
          fail(`meme without a string id, name and url: ${JSON.stringify(item)}`);
        }
        // download_media.sh fetches the audio from the URL but the thumbnail from the ID, so both must name the same video
        if (getVideoId(item.url) !== item.id) {
          fail(`id "${item.id}" (${item.name}) is not the video ID of its url ${item.url}`);
        }
        // The app keys cards, decoys and media files by ID
        if (seenIds.has(item.id)) {
          fail(`id "${item.id}" (${item.name}) appears more than once`);
        }
        seenIds.add(item.id);
      }
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
    ' "${TMP_FILE}"; then
      mv "${TMP_FILE}" "${OUTPUT_FILE}"
      echo "Successfully saved meme catalogue to ${OUTPUT_FILE}"
      exit 0
    fi
  fi

  if [ "${attempt}" -lt "${MAX_ATTEMPTS}" ]; then
    echo "Attempt ${attempt} failed or returned invalid response. Retrying in ${RETRY_DELAY_SECONDS}s..."
    sleep "${RETRY_DELAY_SECONDS}"
  fi
done

echo "Error: Failed to fetch and validate meme catalogue after ${MAX_ATTEMPTS} attempts." >&2
exit 1
