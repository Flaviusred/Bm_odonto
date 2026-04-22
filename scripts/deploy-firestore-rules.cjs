// Script para fazer deploy das Firestore rules no banco de dados nomeado
// Uso: node scripts/deploy-firestore-rules.cjs [--token <FIREBASE_TOKEN>]
// Para CI: use variável de ambiente FIREBASE_TOKEN
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ID = 'odonto-490913';
const DB_ID = 'ai-studio-f268cd8f-e6a5-4bba-b421-df1c4dc1d11c';
const RULES_FILE = path.join(__dirname, '..', 'firestore.rules');

const rulesContent = fs.readFileSync(RULES_FILE, 'utf-8');

function request(method, hostname, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const options = {
      hostname,
      path: urlPath,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        } else {
          resolve(JSON.parse(data));
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Obtém um access_token a partir de um refresh_token (firebase login:ci token)
function exchangeRefreshToken(refreshToken) {
  return new Promise((resolve, reject) => {
    const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
    const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
    const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`;
    const options = {
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.access_token) resolve(parsed.access_token);
        else reject(new Error('Token exchange failed: ' + data));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getAccessToken() {
  // 1. Variável de ambiente FIREBASE_TOKEN (CI) ou argumento --token
  const args = process.argv.slice(2);
  const tokenArg = args.indexOf('--token');
  const ciToken = tokenArg !== -1 ? args[tokenArg + 1] : process.env.FIREBASE_TOKEN;

  if (ciToken) {
    console.log('Usando FIREBASE_TOKEN do ambiente CI...');
    return exchangeRefreshToken(ciToken);
  }

  // 2. Configstore local (desenvolvimento)
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const refreshToken = config.tokens?.refresh_token;
    if (refreshToken) {
      console.log('Usando token do configstore local...');
      return exchangeRefreshToken(refreshToken);
    }
  }

  throw new Error('Nenhum token encontrado. Use FIREBASE_TOKEN env var ou firebase login.');
}

async function main() {
  const token = await getAccessToken();
  console.log('Autenticação OK.');

  // 1. Criar ruleset
  console.log('Criando ruleset...');
  const rulesetBody = {
    source: { files: [{ name: 'firestore.rules', content: rulesContent }] }
  };
  const rulesetResp = await request('POST', 'firebaserules.googleapis.com',
    `/v1/projects/${PROJECT_ID}/rulesets`, rulesetBody, token);
  const rulesetName = rulesetResp.name;
  console.log('Ruleset criado:', rulesetName);

  // 2. Atualizar release do banco nomeado
  const releaseName = `cloud.firestore/${DB_ID}`;
  const fullReleaseName = `projects/${PROJECT_ID}/releases/${releaseName}`;
  console.log('Atualizando release:', fullReleaseName);

  const releaseBody = { release: { name: fullReleaseName, rulesetName } };

  let releaseResp;
  try {
    releaseResp = await request('PATCH', 'firebaserules.googleapis.com',
      `/v1/projects/${PROJECT_ID}/releases/${encodeURIComponent(releaseName)}`, releaseBody, token);
  } catch (e) {
    console.log('PATCH falhou, tentando criar com POST...');
    releaseResp = await request('POST', 'firebaserules.googleapis.com',
      `/v1/projects/${PROJECT_ID}/releases`, { name: fullReleaseName, rulesetName }, token);
  }
  console.log('Release atualizado:', releaseResp.name || JSON.stringify(releaseResp));
  console.log('\n✓ Regras deployadas com sucesso no banco:', DB_ID);
}

main().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
