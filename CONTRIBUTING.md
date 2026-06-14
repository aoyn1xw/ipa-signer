# Contributing to IPA Signer

Thanks for checking this out. This is a small, focused project — contributions are welcome but keep them scoped and simple.

## Getting Started

1. Clone the repo
   ```bash
   git clone https://github.com/aoyn1xw/ipa-signer.git
   cd ipa-signer
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Install `zsign` and optionally `cyan` (pyzule-rw)
   - `zsign`: https://github.com/zhlynn/zsign
   - `cyan`: https://github.com/asdfzxcvbn/pyzule-rw

4. Run locally
   ```bash
   node app.js
   ```

The server starts at `http://localhost:3000` by default.

## Making Changes

- Keep changes small and focused.
- Add or update tests if you touch core logic.
- Update the README if you change behavior, env vars, or deployment.

## Pull Requests

1. Create a branch for your change.
2. Commit with clear messages.
3. Open a PR against `main` with:
   - What changed
   - Why it changed
   - How to test it

## Issue Templates

Use the issue templates when reporting bugs or requesting features. Fill them out as completely as you can.

Thanks!
