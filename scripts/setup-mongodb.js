/**
 * One-command MongoDB setup: ensures DATABASE_URL is set, then runs prisma generate + db push.
 * - Reads .env and .env.local. If DATABASE_URL in .env is missing or still has "cluster0.xxxxx",
 *   uses DATABASE_URL from .env.local if present and writes it to .env so Prisma can use it.
 * - Then runs: npx prisma generate && npx prisma db push
 * Run: node scripts/setup-mongodb.js
 * Or: npm run db:setup (after setting DATABASE_URL in .env)
 */

const { readFileSync, writeFileSync, existsSync } = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const envLocalPath = path.join(root, '.env.local');

function parseEnv(content) {
  const out = {};
  (content || '').split('\n').forEach((line) => {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
  return out;
}

function readEnv(filePath) {
  if (!existsSync(filePath)) return {};
  return parseEnv(readFileSync(filePath, 'utf8'));
}

function writeEnv(filePath, env) {
  const lines = Object.entries(env).map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`);
  writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
}

const env = readEnv(envPath);
const envLocal = readEnv(envLocalPath);

let databaseUrl = env.DATABASE_URL || envLocal.DATABASE_URL;
const isPlaceholder = databaseUrl && databaseUrl.includes('cluster0.xxxxx');

if (!databaseUrl || isPlaceholder) {
  if (envLocal.DATABASE_URL && !envLocal.DATABASE_URL.includes('cluster0.xxxxx')) {
    databaseUrl = envLocal.DATABASE_URL;
    const newEnv = { ...env, DATABASE_URL: databaseUrl };
    writeEnv(envPath, newEnv);
    console.log('Updated .env with DATABASE_URL from .env.local');
  } else {
    console.error('');
    console.error('DATABASE_URL is missing or still has the placeholder "cluster0.xxxxx".');
    console.error('1. Go to https://cloud.mongodb.com → your project → Database → Connect');
    console.error('2. Choose "Connect your application" and copy the connection string');
    console.error('3. Put it in .env or .env.local as: DATABASE_URL="mongodb+srv://..."');
    console.error('4. Run this script again: node scripts/setup-mongodb.js');
    process.exit(1);
  }
}

process.env.DATABASE_URL = databaseUrl;

console.log('Running prisma generate...');
execSync('npx prisma generate', { cwd: root, stdio: 'inherit' });
console.log('Running prisma db push...');
execSync('npx prisma db push', { cwd: root, stdio: 'inherit', env: { ...process.env, DATABASE_URL: databaseUrl } });
console.log('MongoDB setup done. Collections are ready in Atlas.');
