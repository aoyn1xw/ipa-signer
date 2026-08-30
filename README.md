# IPA Signer

[![Docker Image](https://img.shields.io/badge/ghcr.io-aoyn1xw%2Fipa--signer-blue?logo=docker)](https://github.com/aoyn1xw/ipa-signer/pkgs/container/ipa-signer)
[![License](https://img.shields.io/github/license/aoyn1xw/ipa-signer)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen?logo=node.js)](https://nodejs.org)

**IPA Signer** is a fast, web-based and API-enabled iOS IPA file signing server. Upload an IPA file, your signing certificate (**.p12**) and provisioning profile (**.mobileprovision**), and receive a signed IPA ready for OTA installation — all from your browser or programmatically via HTTP.

---

## Features

- 🔏 **Sign iOS IPAs online** — simple web form or API endpoint
- 📲 **OTA install links** — iOS-friendly `itms-services://` links generated instantly
- 🔧 **Advanced IPA tweaks** — edit bundle ID, app name, version, minimum OS, and more before signing
- 🚀 **Fast & non-blocking** — `zsign` runs in a worker thread to keep the server responsive
- 📦 **Large file support** — accepts uploads up to 500 MB
- 🎨 **Modern UI** — responsive, dark/light mode, mobile-friendly
- 🔁 **Auto cleanup** — uploaded files expire and are deleted automatically after ~1 hour
- 🌐 **API ready** — integrate signing into your own pipeline with a single `curl` command
- 🐳 **Docker support** — includes `zsign` and `cyan` out of the box

---

## Getting Started

### Requirements (self-hosted)

- Node.js 22+
- [`zsign`](https://github.com/zhlynn/zsign) binary available in `$PATH` or in the project folder
- [`cyan`](https://github.com/asdfzxcvbn/pyzule-rw) (`pyzule-rw`) CLI in `$PATH` — only needed for advanced IPA tweaks
- Unix-like system (Linux / macOS recommended)

### Install & Run

```bash
git clone https://github.com/aoyn1xw/ipa-signer.git
cd ipa-signer
npm install
node app.js
```

The server starts at [http://localhost:3000](http://localhost:3000) by default.

### Environment Variables

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port to listen on |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limiting window in ms (15 min) |
| `RATE_LIMIT_MAX` | `100` | Max requests per rate limit window |
| `LOG_LEVEL` | `info` | Logging verbosity (`debug`, `info`, `warn`, `error`) |
| `CYAN_CMD` | `cyan` | Path or command name for the `cyan` CLI |
| `PUBLIC_DOMAIN` | *(auto)* | Public base URL for install/plist links. On Render, `RENDER_EXTERNAL_URL` is used automatically; elsewhere it falls back to the request host. |

---

## Run with Docker

Build and run locally:

```bash
docker build -t ipa-signer .

docker run --rm -p 3000:3000 \
  -e PUBLIC_DOMAIN=http://localhost:3000 \
  -v "$(pwd)/uploads:/app/uploads" \
  -v "$(pwd)/logs:/app/logs" \
  ipa-signer
```

Or pull the pre-built image from GHCR:

```bash
docker pull ghcr.io/aoyn1xw/ipa-signer:latest

docker run --rm -p 3000:3000 \
  -e PUBLIC_DOMAIN=https://yourdomain.com \
  ghcr.io/aoyn1xw/ipa-signer:latest
```

> The Docker image includes both `zsign` and `cyan` — no extra setup needed.

The included GitHub Actions workflow automatically publishes to `ghcr.io/aoyn1xw/ipa-signer` on pushes to `main`, version tags, or manual workflow runs.

---

## Web UI

1. Open the web UI in your browser.
2. Upload your **IPA**, **P12 certificate**, and **provisioning profile**.
3. Optionally provide the P12 password and expand **Advanced** to tweak the app before signing.
4. Click **Sign IPA** and wait for processing.
5. Receive a page with an OTA install link and direct `itms-services://` link.

---

## API

Sign IPAs programmatically via the `/sign` endpoint.

**`POST /sign`** — `multipart/form-data`

| Field | Required | Description |
|---|---|---|
| `ipa` | ✅ | The `.ipa` file to sign |
| `p12` | ✅ | P12 signing certificate |
| `mobileprovision` | ✅ | Provisioning profile |
| `p12_password` | — | Password for the P12 (if set) |
| `adv_name` | — | Override app display name |
| `adv_version` | — | Override app version string |
| `adv_bundle_id` | — | Override bundle identifier |
| `adv_min_os` | — | Override minimum iOS version |
| `adv_remove_supported_devices` | — | Strip supported device list |
| `adv_no_watch` | — | Remove WatchKit extensions |
| `adv_fakesign` | — | Fake-sign (skip real certificate) |
| `adv_thin` | — | Thin the IPA to a single architecture |
| `adv_remove_extensions` | — | Strip app extensions |
| `adv_remove_encrypted` | — | Remove encrypted binaries |

### Example

```bash
curl -X POST https://yourdomain.com/sign \
  -F "ipa=@app.ipa" \
  -F "p12=@certificate.p12" \
  -F "mobileprovision=@profile.mobileprovision" \
  -F "p12_password=yourpassword" \
  -F "adv_name=My App" \
  -F "adv_bundle_id=com.example.myapp"
```

### Success Response

```json
{
  "installLink": "https://yourdomain.com/install/XXXXXXXXXXXXXXXXX",
  "directInstallLink": "itms-services://?action=download-manifest&url=https://yourdomain.com/plist/APP_xxxxxxx.plist"
}
```

---

## Project Structure

```
ipa-signer/
├── app.js              # Express server, API routes, file handling
├── zsign-worker.js     # Worker thread running the zsign binary
├── index.html          # Web UI
├── style.css           # UI styles
├── Dockerfile          # Docker build (includes zsign + cyan)
├── Procfile            # Heroku/railway process file
├── .env.example        # Example environment config
└── uploads/            # Auto-created — temporary file storage
```

---

## Security Notes

- Signed files and install links **expire after ~1 hour** and are deleted automatically.
- File uploads are validated by type and size.
- Rate limiting is enforced per IP.
- For production or sensitive use: run behind HTTPS and consider adding authentication — the current public deployment is intended for demo/low-trust use only.

---

## Credits

- [zsign](https://github.com/zhlynn/zsign) — fast IPA re-signing engine
- [pyzule-rw](https://github.com/asdfzxcvbn/pyzule-rw) — IPA modification toolkit (`cyan` CLI)

---

*One of the fastest, simplest iOS signing pipelines available.*
