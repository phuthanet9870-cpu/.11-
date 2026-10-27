// Runs an asset-studio TypeScript entry (export function main) through Vite's SSR loader.
import { createServer } from 'vite';
const entry = process.argv[2];
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', configFile: false });
try {
  const mod = await server.ssrLoadModule(entry);
  await mod.main?.(process.argv.slice(3));
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await server.close();
}
