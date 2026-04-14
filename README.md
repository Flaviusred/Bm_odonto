<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/f268cd8f-e6a5-4bba-b421-df1c4dc1d11c

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy no Render

Configuração recomendada para Web Service no Render:

1. Build Command:
   `npm install`
2. Start Command:
   `npm run start`

Observações:
- O script `start` roda em produção e, antes disso, o `prestart` executa `npm run build` para garantir que a pasta `dist` exista.
- Defina as variáveis de ambiente necessárias no painel do Render (ex.: `GEMINI_API_KEY`, credenciais Firebase/Admin e SMTP quando aplicável).

## Deploy em servidor Ubuntu 24 (instalação em servidor físico)

Esta seção descreve os pré-requisitos e passos recomendados para instalar e executar o sistema em um servidor Ubuntu 24 Standard.

### Pré-requisitos
- Ubuntu 24 LTS com acesso root/sudo
- Usuário com privilégios `sudo`
- Git
- Node.js 20.x (recomendado)
- `npm` (vem com Node.js)
- `build-essential` (compilação de packages nativos)
- `curl`, `ca-certificates`
- Nginx (opcional, recomendado para reverse-proxy e SSL)
- Certbot (opcional, para TLS)

### Resumo dos passos
1. Instalar dependências do sistema
2. Instalar Node.js 20
3. Clonar o repositório em `/opt/bm_odonto`
4. Colocar o arquivo de Service Account do Firebase em `/etc/bm_odonto/service-account.json`
5. Instalar dependências do projeto e gerar build (`npm ci` / `npm run build`)
6. Criar unidade `systemd` para iniciar o servidor (`npm run start`)
7. (Opcional) Criar `systemd` timer ou `cron` para rodar `scripts/check-overdue-appointments.ts` a cada 15 minutos
8. Configurar Nginx como reverse-proxy e habilitar TLS com Certbot

### Comandos (exemplo rápido)
Execute como usuário com `sudo`:

```bash
# Atualiza pacotes
sudo apt update && sudo apt upgrade -y

# Instala dependências básicas
sudo apt install -y git curl build-essential ca-certificates nginx certbot python3-certbot-nginx

# Instala Node.js 20 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Cria usuário de serviço (opcional)
sudo useradd -r -m -d /opt/bm_odonto -s /usr/sbin/nologin bm_odonto || true

# Clona o repositório
sudo git clone <REPO_URL> /opt/bm_odonto
sudo chown -R bm_odonto:bm_odonto /opt/bm_odonto

# Instala dependências do projeto
cd /opt/bm_odonto
sudo -u bm_odonto npm ci

# Faz build do frontend
sudo -u bm_odonto npm run build
```

### Service account (Firebase Admin)
1. No console do Firebase / Google Cloud, gere uma chave de Service Account (JSON) apropriada para o Admin SDK.
2. Transfira o arquivo para o servidor e salve em `/etc/bm_odonto/service-account.json`:

```bash
sudo mkdir -p /etc/bm_odonto
sudo cp ./service-account.json /etc/bm_odonto/service-account.json
sudo chown -R bm_odonto:bm_odonto /etc/bm_odonto
sudo chmod 640 /etc/bm_odonto/service-account.json
```

3. O servidor suporta duas formas de autenticação para o Admin SDK:
   - Definir a variável de ambiente `FIREBASE_SERVICE_ACCOUNT` contendo o JSON (não recomendado por questões de segurança)
   - Ou apontar `GOOGLE_APPLICATION_CREDENTIALS` para o caminho do arquivo `/etc/bm_odonto/service-account.json` (recomendado)

### Arquivo de ambiente (exemplo)
Crie `/etc/bm_odonto/env` com pares `KEY=VALUE` (lendo o `service-account.json` via `GOOGLE_APPLICATION_CREDENTIALS`):

```
GOOGLE_APPLICATION_CREDENTIALS=/etc/bm_odonto/service-account.json
FIREBASE_PROJECT_ID=odonto-490913
FIREBASE_DATABASE_ID=ai-studio-f268cd8f-e6a5-4bba-b421-df1c4dc1d11c
PORT=3000
NODE_ENV=production
CORS_ORIGINS=http://localhost,https://seu-dominio.com
SENDGRID_API_KEY=xxxxx
```

Defina permissões restritas: `sudo chown root:root /etc/bm_odonto/env && sudo chmod 600 /etc/bm_odonto/env`.

### Exemplo de unidade `systemd` (server)
Crie `/etc/systemd/system/bm-odonto.service` com o conteúdo:

```
[Unit]
Description=BM Odonto server
After=network.target

[Service]
User=bm_odonto
WorkingDirectory=/opt/bm_odonto
EnvironmentFile=/etc/bm_odonto/env
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

Ative e inicie:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bm-odonto.service
sudo journalctl -u bm-odonto -f
```

### Agendamento de checagem de agendamentos atrasados (systemd timer)
Crie `/etc/systemd/system/check-overdue.service`:

```
[Unit]
Description=Check overdue appointments - BM Odonto

[Service]
Type=oneshot
User=bm_odonto
WorkingDirectory=/opt/bm_odonto
EnvironmentFile=/etc/bm_odonto/env
ExecStart=/usr/bin/npm run notifications:check-overdue
```

Crie `/etc/systemd/system/check-overdue.timer`:

```
[Unit]
Description=Run check-overdue every 15 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=15min
Persistent=true

[Install]
WantedBy=timers.target
```

Ative o timer:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now check-overdue.timer
sudo systemctl status check-overdue.timer
```

### Nginx (reverse proxy) — exemplo mínimo
Crie `/etc/nginx/sites-available/bm_odonto` apontando para `localhost:3000` e habilite com `ln -s`.
Use Certbot para habilitar TLS:

```bash
sudo certbot --nginx -d seu-dominio.com
```

### Logs e troubleshooting
- Visualizar logs do servidor: `sudo journalctl -u bm-odonto -f`
- Visualizar logs do job de checagem: `sudo journalctl -u check-overdue.service -f`
- Testar manualmente o job: `sudo -u bm_odonto /usr/bin/npm run notifications:check-overdue`

### Observações finais
- Evite colocar o conteúdo bruto da service account em arquivos públicos. Proteja `/etc/bm_odonto` e o arquivo de env com permissões restritas.
- Se preferir, use `pm2` ou outro process manager em vez de systemd; o exemplo acima usa `systemd` por ser padrão em servidores modernos.

Se quiser, eu gero os arquivos `systemd` e um pequeno script helper para instalar automaticamente no servidor — me diga se quer que eu crie esses artefatos no repositório.
