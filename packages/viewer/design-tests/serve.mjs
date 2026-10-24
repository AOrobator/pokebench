import { mkdtemp, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { startViewer } from '../dist/server.js';

const root = await mkdtemp(join(tmpdir(), 'pokebench-card-design-'));
await mkdir(join(root, 'sprites'));
await symlink(resolve(process.env.POKEBENCH_CARD_ART ?? '../../runs/sprites/trainer-card-v1'), join(root, 'sprites/trainer-card-v1'));
const viewer = await startViewer({ runsRoot: root, port: 18793, staticDir: resolve('static'), appDir: resolve('dist') });
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await viewer.close();
  await rm(root, { recursive: true, force: true });
}
process.once('SIGTERM', () => { void close(); });
process.once('SIGINT', () => { void close(); });
