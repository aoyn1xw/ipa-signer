require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { Worker } = require('worker_threads');
const AdmZip = require('adm-zip');
const plist = require('plist');
const bplistParser = require('bplist-parser');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const { spawn } = require('child_process');

const {
  PORT = 3000,
  RATE_LIMIT_WINDOW_MS = 900000,
  RATE_LIMIT_MAX = 100,
  LOG_LEVEL = 'info',
  PUBLIC_DOMAIN = process.env.RENDER_EXTERNAL_URL || '',
} = process.env;

function normalizeBaseUrl(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function getPublicBaseUrl(req) {
  const configuredBaseUrl = normalizeBaseUrl(PUBLIC_DOMAIN);
  if (configuredBaseUrl) return configuredBaseUrl;

  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = req.get('x-forwarded-host')?.split(',')[0]?.trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = forwardedHost || req.get('host');

  if (!host) return 'http://localhost:3000/';
  return normalizeBaseUrl(`${protocol}://${host}`);
}

function buildPublicUrl(req, routePath) {
  return new URL(routePath.startsWith('/') ? routePath : `/${routePath}`, getPublicBaseUrl(req)).toString();
}

const CYAN_CMD = process.env.CYAN_CMD || 'cyan';

const WORK_DIR = path.join(__dirname, 'uploads');
const REQUIRED_DIRS = ['p12', 'mp', 'temp', 'signed', 'plist', 'metadata'];
const logDir = path.join(__dirname, 'logs');

if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log') }),
  ],
});
logger.add(new winston.transports.Console({ format: winston.format.simple() }));

const app = express();
app.set('trust proxy', true);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(cors());

const limiter = rateLimit({
  windowMs: parseInt(RATE_LIMIT_WINDOW_MS, 10),
  max: parseInt(RATE_LIMIT_MAX, 10),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Create required directories
for (const dir of REQUIRED_DIRS) {
  const dirPath = path.join(WORK_DIR, dir);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

app.use(express.static(path.join(__dirname, 'public')));
app.use('/signed', express.static(path.join(WORK_DIR, 'signed')));
app.use('/plist', express.static(path.join(WORK_DIR, 'plist')));

app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, 'style.css')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/help', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Help - IPA Signer</title>
        <link rel="stylesheet" href="/style.css">
      </head>
      <body>
        <button class="toggle" id="themeToggle" aria-label="Toggle dark mode">
          <svg id="themeIcon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          </svg>
        </button>

        <main class="page">
          <div class="container">
            <div class="card install-info">
              <div class="header-icon" style="margin-bottom: 24px;">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <h1 style="margin-bottom: 16px;">Help & Documentation</h1>
              <p class="install-meta" style="margin-bottom: 20px; font-size: 0.95rem; line-height: 1.5; max-width: 100%; display: block; background: rgba(0,0,0,0.015); border: 1.5px solid var(--border); padding: 16px; border-radius: var(--radius-sm); text-align: left;">
                its the readme on github and also that you can customie the html however you all
              </p>
              <a href="https://github.com/aoyn1xw/ipa-signer#readme" class="btn-link" target="_blank" rel="noopener noreferrer">View GitHub Readme</a>
              <a href="/" class="btn-secondary" style="margin-top: 12px; display: block; text-decoration: none; text-align: center; line-height: 1.2;">Go Back Home</a>
            </div>
          </div>
        </main>

        <script>
          const themeToggle = document.getElementById('themeToggle');
          const themeIcon = document.getElementById('themeIcon');
          const body = document.body;
          const currentTheme = localStorage.getItem('theme') || 'light';
          
          body.setAttribute('data-theme', currentTheme);
          updateThemeIcon(currentTheme);

          themeToggle.addEventListener('click', function() {
            const newTheme = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            body.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
          });

          function updateThemeIcon(theme) {
            if (theme === 'dark') {
              themeIcon.innerHTML = \`
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              \`;
            } else {
              themeIcon.innerHTML = \`
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              \`;
            }
          }
        </script>
      </body>
    </html>
  `);
});

const upload = multer({
  dest: path.join(WORK_DIR, 'temp'),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.ipa', '.p12', '.mobileprovision'];
    const ext = path.extname(file.originalname).toLowerCase();
    allowedTypes.includes(ext) ? cb(null, true) : cb(new Error('Invalid file type'));
  },
});

function generateRandomSuffix() {
  return crypto.randomBytes(12).toString('hex');
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '');
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateManifestPlist(ipaUrl, bundleId, bundleVersion, displayName) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key>
          <string>software-package</string>
          <key>url</key>
          <string>${escapeXml(ipaUrl)}</string>
        </dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key>
        <string>${escapeXml(bundleId || 'com.example.app')}</string>
        <key>bundle-version</key>
        <string>${escapeXml(bundleVersion)}</string>
        <key>kind</key>
        <string>software</string>
        <key>title</key>
        <string>${escapeXml(displayName)}</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>`;
}

function runCyan({ inputPath, outputPath, extraArgs }) {
  return new Promise((resolve, reject) => {
    const args = ['-i', inputPath, '-o', outputPath];
    if (extraArgs?.length) args.push(...extraArgs);

    const child = spawn(CYAN_CMD, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('error', (err) => {
      if (err && err.code === 'ENOENT') {
        return reject(new Error('cyan not found; install pyzule-rw or set CYAN_CMD, or disable Advanced tweaks.'));
      }
      reject(err);
    });
    child.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      const output = stderr.trim() || stdout.trim();
      reject(new Error(`cyan failed (${code})${output ? `: ${output}` : ''}`));
    });
  });
}

function signIpaInWorker({ p12Path, p12Password, mpPath, ipaPath, signedIpaPath }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'zsign-worker.js'), {
      workerData: { p12Path, p12Password, mpPath, ipaPath, signedIpaPath }
    });
    worker.on('message', (msg) => msg.status === 'ok' ? resolve(msg) : reject(new Error(msg.error)));
    worker.on('error', reject);
    worker.on('exit', (code) => code !== 0 && reject(new Error(`Worker exit code ${code}`)));
  });
}

// --- SIGN ENDPOINT ---
app.post('/sign',
  upload.fields([
    { name: 'ipa', maxCount: 1 },
    { name: 'p12', maxCount: 1 },
    { name: 'mobileprovision', maxCount: 1 },
  ]),
  async (req, res) => {
    logger.info('Sign request received');
    let uniqueSuffix, ipaPath, inputIpaPath, p12Path, mpPath, signedIpaPath, metadataPath, cyanIpaPath;

    try {
      if (!req.files?.p12 || !req.files?.mobileprovision) return res.status(400).json({ error: 'P12 and MobileProvision required' });

      uniqueSuffix = generateRandomSuffix();

      // Only handle IPA file upload
      if (req.files.ipa) {
        inputIpaPath = path.join(WORK_DIR, 'temp', `input_${uniqueSuffix}.ipa`);
        await fsp.rename(req.files.ipa[0].path, inputIpaPath);
        ipaPath = inputIpaPath;
      } else return res.status(400).json({ error: 'IPA file required' });

      const p12Password = (req.body.p12_password || '').trim();
      p12Path = path.join(WORK_DIR, 'p12', `cert_${uniqueSuffix}.p12`);
      mpPath = path.join(WORK_DIR, 'mp', `app_${uniqueSuffix}.mobileprovision`);

      await fsp.rename(req.files.p12[0].path, p12Path);
      await fsp.rename(req.files.mobileprovision[0].path, mpPath);

      const trimValue = (value) => (typeof value === 'string' ? value.trim() : '');
      const isChecked = (value) => value === 'on' || value === 'true' || value === true || value === '1';
      const cyanArgs = [];

      const advName = trimValue(req.body.adv_name);
      const advVersion = trimValue(req.body.adv_version);
      const advBundleId = trimValue(req.body.adv_bundle_id);
      const advMinOs = trimValue(req.body.adv_min_os);

      if (advName) cyanArgs.push('-n', advName);
      if (advVersion) cyanArgs.push('-v', advVersion);
      if (advBundleId) cyanArgs.push('-b', advBundleId);
      if (advMinOs) cyanArgs.push('-m', advMinOs);

      const removeExtensions = isChecked(req.body.adv_remove_extensions);
      const removeEncrypted = isChecked(req.body.adv_remove_encrypted);

      if (removeExtensions && removeEncrypted) {
        return res.status(400).json({ error: 'Choose either remove all extensions or only encrypted extensions.' });
      }

      if (isChecked(req.body.adv_remove_supported_devices)) cyanArgs.push('-u');
      if (isChecked(req.body.adv_no_watch)) cyanArgs.push('-w');
      if (isChecked(req.body.adv_fakesign)) cyanArgs.push('-s');
      if (isChecked(req.body.adv_thin)) cyanArgs.push('-q');
      if (removeExtensions) cyanArgs.push('-e');
      if (removeEncrypted) cyanArgs.push('-g');

      if (cyanArgs.length) {
        logger.info('Running cyan modifications');
        cyanIpaPath = path.join(WORK_DIR, 'temp', `cyan_${uniqueSuffix}.ipa`);
        await runCyan({
          inputPath: ipaPath,
          outputPath: cyanIpaPath,
          extraArgs: cyanArgs,
        });
        ipaPath = cyanIpaPath;
      }

      signedIpaPath = path.join(WORK_DIR, 'signed', `signed_${uniqueSuffix}.ipa`);
      await signIpaInWorker({ p12Path, p12Password, mpPath, ipaPath, signedIpaPath });
      logger.info(`Signed IPA created: ${signedIpaPath}`);

      const zipSigned = new AdmZip(signedIpaPath);
      let appFolderName = '';
      for (const entry of zipSigned.getEntries()) {
        const parts = entry.entryName.split('/');
        if (parts.length > 1 && parts[1].endsWith('.app')) {
          appFolderName = parts[1];
          break;
        }
      }
      if (!appFolderName) return res.status(500).json({ error: 'No .app found in IPA' });

      const plistEntry = zipSigned.getEntry(`Payload/${appFolderName}/Info.plist`);
      if (!plistEntry) return res.status(500).json({ error: 'Info.plist not found' });

      let plistData;
      const plistBuffer = plistEntry.getData();
      try { plistData = plist.parse(plistBuffer.toString('utf8')); }
      catch {
        try { const parsed = await bplistParser.parseBuffer(plistBuffer); plistData = parsed?.[0] || {}; }
        catch { return res.status(500).json({ error: 'Failed to parse Info.plist' }); }
      }

      const bundleId = plistData.CFBundleIdentifier || 'com.example.app';
      const bundleVersion = plistData.CFBundleVersion || '1.0.0';
      const displayName = plistData.CFBundleDisplayName || plistData.CFBundleName || 'App';

      const ipaUrl = buildPublicUrl(req, `signed/${path.basename(signedIpaPath)}`);
      const manifest = generateManifestPlist(ipaUrl, bundleId, bundleVersion, displayName);
      const plistFilename = `${sanitizeFilename(displayName)}_${uniqueSuffix}.plist`;
      const plistSavePath = path.join(WORK_DIR, 'plist', plistFilename);
      await fsp.writeFile(plistSavePath, manifest, 'utf8');

      const manifestUrl = buildPublicUrl(req, `plist/${plistFilename}`);
      const directInstallLink = `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestUrl)}`;
      const installPageUrl = buildPublicUrl(req, `install/${uniqueSuffix}`);

      metadataPath = path.join(WORK_DIR, 'metadata', `${uniqueSuffix}.json`);
      const metadata = {
        displayName,
        bundleId,
        bundleVersion,
        installLink: directInstallLink,
        expiresAt: Date.now() + 3600000
      };
      await fsp.writeFile(metadataPath, JSON.stringify(metadata), 'utf8');

      res.json({ installLink: installPageUrl, directInstallLink });

      setTimeout(async () => {
        try {
          if (fs.existsSync(signedIpaPath)) await fsp.unlink(signedIpaPath);
          if (fs.existsSync(plistSavePath)) await fsp.unlink(plistSavePath);
          if (fs.existsSync(metadataPath)) await fsp.unlink(metadataPath);
        } catch (e) {}
      }, 3600000);

    } catch (err) {
      logger.error(`Signing error: ${err}`);
      return res.status(500).json({ error: 'Signing failed', details: err.message });
    } finally {
      try { if (inputIpaPath && fs.existsSync(inputIpaPath)) await fsp.unlink(inputIpaPath);
            if (p12Path && fs.existsSync(p12Path)) await fsp.unlink(p12Path);
            if (mpPath && fs.existsSync(mpPath)) await fsp.unlink(mpPath);
            if (cyanIpaPath && fs.existsSync(cyanIpaPath)) await fsp.unlink(cyanIpaPath);
      } catch {}
    }
  }
);

// --- INSTALL PAGE ---
app.get('/install/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      return res.status(404).send('Install link expired or not found.');
    }

    const metadataPath = path.join(WORK_DIR, 'metadata', `${id}.json`);
    if (!fs.existsSync(metadataPath)) {
      return res.status(404).send('Install link expired or not found.');
    }

    const data = JSON.parse(await fsp.readFile(metadataPath, 'utf8'));
    if (Date.now() > data.expiresAt) {
      await fsp.unlink(metadataPath);
      return res.status(410).send('This install link has expired.');
    }

    const displayName = escapeHtml(data.displayName);
    const bundleVersion = escapeHtml(data.bundleVersion);
    const bundleId = escapeHtml(data.bundleId);
    const installLink = escapeHtml(data.installLink);

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Install ${displayName}</title>
          <link rel="stylesheet" href="/style.css">
        </head>
        <body>
          <main class="page">
            <div class="container">
              <div class="card install-info">
                <h1>${displayName}</h1>
                <p class="install-meta">Version <b>${bundleVersion}</b></p>
                <p class="install-meta">Bundle ID <b>${bundleId}</b></p>
                <a href="${installLink}" class="btn-link">Install on iOS</a>
              </div>
            </div>
          </main>
        </body>
      </html>
    `);
  } catch (err) {
    next(err);
  }
});

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const SHORT_LIVED_FILE_MAX_AGE_MS = 20 * 60 * 1000;
const INSTALL_FILE_MAX_AGE_MS = 60 * 60 * 1000;
const DIR_MAX_AGE_MS = {
  p12: SHORT_LIVED_FILE_MAX_AGE_MS,
  mp: SHORT_LIVED_FILE_MAX_AGE_MS,
  temp: SHORT_LIVED_FILE_MAX_AGE_MS,
  signed: INSTALL_FILE_MAX_AGE_MS,
  plist: INSTALL_FILE_MAX_AGE_MS,
  metadata: INSTALL_FILE_MAX_AGE_MS,
};

async function cleanupUploads() {
  try {
    for (const dir of REQUIRED_DIRS) {
      const dirPath = path.join(WORK_DIR, dir);
      const files = await fsp.readdir(dirPath);
      const maxAgeMs = DIR_MAX_AGE_MS[dir];

      for (const file of files) {
        const filePath = path.join(dirPath, file);

        try {
          const stat = await fsp.stat(filePath);
          if (stat.isFile() && Date.now() - stat.mtimeMs > maxAgeMs) {
            await fsp.unlink(filePath);
            logger.info(`Cleaned up old file: ${filePath}`);
          }
        } catch {}
      }
    }
  } catch (err) {
    logger.error(`Cleanup error: ${err.message}`);
  }
}

cleanupUploads();
setInterval(cleanupUploads, CLEANUP_INTERVAL_MS).unref();

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof multer.MulterError || err.message === 'Invalid file type') {
    logger.warn(`Upload rejected: ${err.message}`);
    return res.status(400).json({ error: err.message });
  }

  logger.error(`Unhandled request error: ${err.message}`);
  return res.status(500).json({ error: 'Internal server error' });
});

if (!global.serverStarted) {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Public domain: ${normalizeBaseUrl(PUBLIC_DOMAIN) || 'derived from request host'}`);
    global.serverStarted = true;
  });
}
