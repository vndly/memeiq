#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/../src/assets/memes.json"
MEME_CATALOGUE_URL="https://script.google.com/macros/s/AKfycbx--XolEkGPA49hu8Ng0jheGkeYyJ9IO4YZ3Ji7Z8lZtzZ0cYW-8ku27_U9fGowpB-BGg/exec"
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
      const content = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(content);
      if (!Array.isArray(data) || data.length === 0) {
        process.exit(1);
      }
      for (const item of data) {
        if (typeof item.id !== "number" || typeof item.name !== "string" || typeof item.url !== "string") {
          process.exit(1);
        }
      }
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
    ' "${TMP_FILE}" 2>/dev/null; then
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
