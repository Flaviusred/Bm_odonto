#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
