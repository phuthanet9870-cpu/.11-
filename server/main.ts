// `npm run server` entry: starts the Veyloria server and keeps it running.
// Options: --port=7171  --data=./server-data  --woe-always  --emperium-hp=50000
import { startServer } from './server';

export async function main(args: string[] = []) {
  const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const port = Number(opt('port') ?? process.env.PORT ?? 7171);
  const srv = await startServer({ port, dataDir: opt('data'), woeAlways: args.includes('--woe-always'), emperiumHp: opt('emperium-hp') ? Number(opt('emperium-hp')) : undefined });
  console.log(`Veyloria server listening on ws://localhost:${srv.port}${args.includes('--woe-always') ? ' (guild war always open)' : ''}`);
  await new Promise(() => {});
}
