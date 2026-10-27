// Generates raw images with the OpenAI Images API (gpt-image-1).
//   npm run assets:ai:generate -- [--only <job id or asset>] [--force] [--dry-run]
// Needs OPENAI_API_KEY in the environment and network access to api.openai.com.
// Raw images go to tools/asset-studio/ai-raw/ (one PNG + the prompt used per job);
// existing files are skipped unless --force. Turn them into game sheets with
// `npm run assets:ai:import`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { aiJobs, type AiJob } from './jobs';

export const RAW_DIR = join(process.cwd(), 'tools/asset-studio/ai-raw');
const MODEL = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1';

function call(job: AiJob, key: string): Buffer {
  const size = job.kind === 'reference' ? '1024x1536' : '1536x1024';
  // curl honours the environment's HTTPS proxy; the key goes in a header file, never on the command line.
  const hdr = join(RAW_DIR, '.auth-header');
  writeFileSync(hdr, `Authorization: Bearer ${key}\n`, { mode: 0o600 });
  try {
    const ref = job.reference ? join(RAW_DIR, `${job.reference}.png`) : null;
    const args = ref
      ? ['-sS', '--fail-with-body', '-H', `@${hdr}`, 'https://api.openai.com/v1/images/edits',
        '-F', `model=${MODEL}`, '-F', `image[]=@${ref}`, '-F', `prompt=${job.prompt}`, '-F', `size=${size}`, '-F', 'background=transparent', '-F', 'quality=high']
      : ['-sS', '--fail-with-body', '-H', `@${hdr}`, '-H', 'Content-Type: application/json', 'https://api.openai.com/v1/images/generations',
        '-d', JSON.stringify({ model: MODEL, prompt: job.prompt, size, background: 'transparent', quality: 'high', output_format: 'png', n: 1 })];
    const res = JSON.parse(execFileSync('curl', args, { maxBuffer: 64 << 20 }).toString());
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error(`no image in response: ${JSON.stringify(res).slice(0, 300)}`);
    return Buffer.from(b64, 'base64');
  } finally {
    writeFileSync(hdr, '');
  }
}

export async function main(args: string[]) {
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  const force = args.includes('--force'), dry = args.includes('--dry-run');
  const jobs = aiJobs().filter((j) => !only || j.id === only || j.asset === only);
  // References first so animation sheets can use them.
  jobs.sort((a, b) => Number(b.kind === 'reference') - Number(a.kind === 'reference'));
  mkdirSync(RAW_DIR, { recursive: true });
  if (dry) { for (const j of jobs) console.log(`${j.id}${j.reference ? ` (ref ${j.reference})` : ''}\n  ${j.prompt}\n`); console.log(`${jobs.length} jobs`); return; }
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set. Add it to the environment settings (not the chat) and start a new session.');
  let made = 0, failed = 0;
  for (const j of jobs) {
    const out = join(RAW_DIR, `${j.id}.png`);
    if (existsSync(out) && !force) { console.log(`skip ${j.id} (exists)`); continue; }
    if (j.reference && !existsSync(join(RAW_DIR, `${j.reference}.png`))) { console.log(`skip ${j.id}: reference ${j.reference} missing`); failed++; continue; }
    try {
      process.stdout.write(`generate ${j.id} … `);
      const png = call(j, key);
      writeFileSync(out, png);
      writeFileSync(join(RAW_DIR, `${j.id}.prompt.txt`), `${MODEL}\n${j.reference ? `reference: ${j.reference}.png\n` : ''}${j.prompt}\n`);
      made++; console.log('ok');
    } catch (e) {
      failed++; console.log(`FAILED: ${String((e as Error).message).slice(0, 300)}`);
    }
  }
  console.log(`AI generate: ${made} new, ${failed} failed, ${jobs.length} jobs`);
}
