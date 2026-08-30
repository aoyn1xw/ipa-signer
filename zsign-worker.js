const { parentPort, workerData } = require('worker_threads');
const { execFile, execFileSync } = require('child_process');
const path = require('path');
const os = require('os');

const { p12Path, p12Password, mpPath, ipaPath, signedIpaPath } = workerData;

let zsignPath;
try {
  const lookupCommand = os.platform() === 'win32' ? 'where' : 'which';
  zsignPath = execFileSync(lookupCommand, ['zsign'], { encoding: 'utf8' })
    .split(/\r?\n/)[0]
    .trim();
} catch {
  zsignPath = os.platform() === 'win32'
    ? path.join(__dirname, 'zsign.exe')
    : path.join(__dirname, 'zsign');
}

const args = ['-k', p12Path, '-m', mpPath];

if (p12Password) {
  args.push('-p', p12Password);
}

args.push('-o', signedIpaPath, ipaPath);

execFile(zsignPath, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
  if (error) {
    const detail = stderr.trim() || `zsign exited with code ${error.code ?? 'unknown'}`;
    parentPort.postMessage({
      status: 'error',
      error: detail
    });
    return;
  }

  parentPort.postMessage({
    status: 'ok',
    output: stdout
  });
});
