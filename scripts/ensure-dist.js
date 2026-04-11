#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const indexPath = path.join(process.cwd(), 'dist', 'index.html');
if (fs.existsSync(indexPath)) {
  console.log('dist/index.html found — skipping build.');
  process.exit(0);
}

console.log('dist/index.html not found — running `npm run build` before start...');
try {
  execSync('npm run build', { stdio: 'inherit' });
} catch (err) {
  console.error('Failed to run build during prestart:', err);
  process.exit(1);
}
