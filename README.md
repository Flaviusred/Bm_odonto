# BM Odonto — Gabinete Odontológico CBMPB

Sistema de gestão odontológica desenvolvido para o Corpo de Bombeiros Militar da Paraíba. Permite o gerenciamento de pacientes (militares e civis), agendamentos, tratamentos, dentistas, atendentes e usuários administrativos.

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Estilização | Tailwind CSS v4 |
| Ícones | Lucide React |
| Backend | Node.js + Express + TypeScript (tsx) |
| Banco de dados | Firebase Firestore (database nomeado) |
| Autenticação | Firebase Authentication |
| Admin SDK | Firebase Admin SDK |
| E-mail | Nodemailer (Gmail / SMTP genérico) |
| Process manager | PM2 |
| Proxy reverso | Nginx |
| Deploy CI/CD | GitHub Actions → Firebase Hosting (frontend) + servidor Ubuntu (backend) |

---

## Estrutura de arquivos

```
├── src/
│   ├── App.tsx                   # Componente raiz, roteamento de abas e lógica de estado global
│   ├── main.tsx                  # Ponto de entrada React
│   ├── index.css                 # Estilos globais (Tailwind)
│   ├── firebase.ts               # Inicialização do Firebase client-side e helpers de Auth
│   ├── types.ts                  # Tipos e interfaces TypeScript globais
│   │
│   ├── components/
│   │   ├── AgendaView.tsx        # Visualização e gestão de agendamentos (dia/semana/mês)
│   │   ├── AnnouncementBanner.tsx# Banner de avisos/comunicados
│   │   ├── AnnouncementManager.tsx # Gestão de comunicados pelo admin
│   │   ├── AttendantList.tsx     # Listagem e gestão de atendentes
│   │   ├── AuditHistory.tsx      # Histórico de auditoria de ações
│   │   ├── Button.tsx            # Componente de botão reutilizável
│   │   ├── Card.tsx              # Componente de card reutilizável
│   │   ├── ChangePasswordModal.tsx # Modal de alteração de senha
│   │   ├── Dashboard.tsx         # Painel principal com métricas
│   │   ├── DentistList.tsx       # Listagem e gestão de dentistas
│   │   ├── DentistPortal.tsx     # Portal exclusivo para dentistas
│   │   ├── DentistScheduleManager.tsx # Gestão de horários dos dentistas
│   │   ├── Input.tsx             # Componente de input reutilizável
│   │   ├── InventoryManager.tsx  # Gestão de inventário/materiais
│   │   ├── LoadingOverlay.tsx    # Overlay de carregamento global
│   │   ├── Modal.tsx             # Componente de modal reutilizável
│   │   ├── PatientList.tsx       # Listagem, cadastro e gestão de pacientes
│   │   ├── PatientPortal.tsx     # Portal exclusivo para pacientes
│   │   ├── ProfileEditModal.tsx  # Modal de edição de perfil
│   │   ├── Sidebar.tsx           # Menu lateral com navegação por permissões
│   │   ├── TreatmentList.tsx     # Listagem e gestão de tratamentos
│   │   └── UserManager.tsx       # Gestão de usuários do sistema
│   │
│   ├── constants/
│   │   └── index.ts              # Constantes globais (permissões, roles, etc.)
│   │
│   ├── hooks/
│   │   └── index.ts              # Hooks React customizados
│   │
│   ├── lib/
│   │   ├── dateUtils.ts          # Utilitários de datas (parse, format, timezone)
│   │   ├── loadingStore.ts       # Store global de estado de carregamento
│   │   └── utils.ts              # Utilitários gerais (máscaras, validações, API_BASE)
│   │
│   └── services/
│       ├── emailService.ts       # Envio de e-mails via API do backend
│       └── patientService.ts     # Integração com API do CBMPB para busca de militares
│
├── server.ts                     # Servidor Express: API REST, Firebase Admin, autenticação JWT
├── index.html                    # HTML raiz do Vite
├── vite.config.ts                # Configuração do Vite (base path, aliases)
├── tsconfig.json                 # Configuração TypeScript
├── firebase.json                 # Configuração Firebase Hosting + Firestore
├── firestore.rules               # Regras de segurança do Firestore
├── firestore.indexes.json        # Índices compostos do Firestore
├── firebase-applet-config.json   # Config client-side do Firebase (sem segredos)
├── Procfile                      # Comando de start para plataformas PaaS
├── package.json
│
├── scripts/
│   ├── check-overdue-appointments.ts  # Script de checagem de agendamentos atrasados
│   ├── cleanup-empty-user-docs.ts     # Limpeza de documentos de usuário vazios
│   ├── deploy-firestore-rules.cjs     # Deploy programático das regras do Firestore
│   ├── ensure-dist.js                 # Garante que o build existe antes do start
│   └── migrate-authUid.js             # Migração de authUid em documentos legados
│
└── .github/
    └── workflows/
        └── deploy.yml            # CI/CD: build Vite + deploy Firebase Hosting
```

---

## Executar localmente

**Pré-requisitos:** Node.js 20+

```bash
# Instalar dependências
npm install

# Iniciar em modo desenvolvimento (frontend + backend)
npm run dev
```

O servidor Express sobe na porta `3000` (ou `PORT` via variável de ambiente). O Vite sobe na porta `5173` com proxy para o backend.

---

## Variáveis de ambiente

Crie um arquivo `.env` na raiz com as seguintes variáveis:

```env
PORT=3000
NODE_ENV=production

# Firebase Admin SDK — coloque o JSON inteiro em uma linha (escape \n da private_key)
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n","client_email":"..."}

# Alternativa: apontar para o arquivo de service account
# GOOGLE_APPLICATION_CREDENTIALS=/etc/bm_odonto/service-account.json

# E-mail (Gmail)
SMTP_PROVIDER=gmail
EMAIL_USER=seu@gmail.com
EMAIL_PASS=app-password
EMAIL_FROM=BM Odonto <no-reply@dominio.com>

# Token de integração com a API do CBMPB
CBMPB_API_TOKEN=Bearer xxxxx

# Origens permitidas pelo CORS
CORS_ORIGINS=https://seu-dominio.com
```

---

## Deploy em servidor Ubuntu 24 (com PM2 + Nginx)

### 1. Instalar dependências do sistema

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential ca-certificates nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g pm2
```

### 2. Clonar e configurar o projeto

```bash
git clone https://github.com/Flaviusred/Bm_odonto.git /opt/bm_odonto/Bm_odonto
cd /opt/bm_odonto/Bm_odonto
npm ci
npm run build
```

Crie o arquivo `.env` com as variáveis listadas acima.

### 3. Iniciar com PM2

```bash
pm2 start npm --name bm-odonto -- start
pm2 save
pm2 startup
```

### 4. Configurar Nginx como proxy reverso

Crie `/etc/nginx/sites-available/bm-odonto`:

```nginx
server {
    listen 80;
    server_name seu-dominio.com;

    location /bravoOdonto/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/bm-odonto /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 5. Atualizar após novo deploy

```bash
cd /opt/bm_odonto/Bm_odonto
git pull
npm run build
fuser -k 3000/tcp
pm2 restart bm-odonto
```

---

## Deploy do frontend (Firebase Hosting)

O CI/CD via GitHub Actions faz o deploy automaticamente a cada push na branch `main`. Configure os seguintes secrets no repositório:

| Secret | Descrição |
|---|---|
| `VITE_API_URL` | URL base do servidor Express em produção |
| `FIREBASE_PROJECT` | ID do projeto Firebase |
| `FIREBASE_TOKEN` | Token gerado com `firebase login:ci` |
| `VITE_SITE_URL` | URL pública do site |

---

## Permissões e roles

| Role | Acesso |
|---|---|
| `admin` | Acesso total ao sistema |
| `attendant` | Pacientes, agendamentos, dentistas, atendentes |
| `dentist` | Portal do dentista + abas extras conforme permissões |
| `patient` | Portal do paciente (agendamentos e tratamentos próprios) |

Permissões extras podem ser atribuídas individualmente a dentistas e atendentes pelo administrador.

