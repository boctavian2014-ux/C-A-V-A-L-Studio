#!/usr/bin/env node
/**
 * Pull recommended Ollama models for CAVALLO Studio local inference.
 * Usage: node scripts/setup-ollama-models.mjs
 */
import { spawn } from 'node:child_process';

const MODELS = [
  'qwen2.5-coder:7b',
  'llama3.1:8b',
];

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`));
    });
  });
}

async function main() {
  console.log('CAVALLO — setup modele Ollama locale\n');
  for (const model of MODELS) {
    console.log(`\n▶ ollama pull ${model}`);
    await run('ollama', ['pull', model]);
  }
  console.log('\n✓ Gata. Selectează Auto Free în panoul AI.');
}

main().catch((err) => {
  console.error('\nEroare:', err.message);
  console.error('Asigură-te că Ollama rulează: https://ollama.com');
  process.exit(1);
});
