import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const serverDir = path.join(rootDir, 'server');

const killProcessOnPort = (port) => {
  try {
    const pids = execSync(`lsof -ti tcp:${port}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean);

    if (!pids.length) {
      return;
    }

    console.log(`Stopping existing process(es) on port ${port}: ${pids.join(', ')}`);
    execSync(`kill -9 ${pids.join(' ')}`, { stdio: 'ignore' });
  } catch {
    // Ignore if no process is listening on the port.
  }
};

const startProcess = (name, cwd, command, args) => {
  const child = spawn(command, args, {
    cwd,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`\n${name} exited with code ${code}`);
    }
  });

  return child;
};

killProcessOnPort(3001);
killProcessOnPort(5173);

console.log('Starting backend and frontend...');
const backend = startProcess('backend', serverDir, 'npm', ['run', 'dev']);
const frontend = startProcess('frontend', rootDir, 'npm', ['run', 'dev']);

const shutdown = () => {
  backend.kill('SIGTERM');
  frontend.kill('SIGTERM');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
