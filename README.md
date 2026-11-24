# BM Odonto — Gabinete Odontológico CBMPB

Sistema de gestão odontológica desenvolvido para o Corpo de Bombeiros Militar da Paraíba. Permite o gerenciamento de pacientes (militares e civis), agendamentos, tratamentos, dentistas, atendentes e usuários administrativos.

O dashboard e os relatórios Excel/PDF apresentam quantidades de procedimentos por tipo e dentista. Os totais somam as quantidades registradas nos tratamentos pela data do tratamento, independentemente do status dos agendamentos; o filtro de período do relatório é selecionado na exportação.

Na agenda e no portal do dentista, agendamentos em aberto podem ser marcados como “Não compareceu” após o horário marcado, mediante confirmação. A falta permanece no histórico e não libera o horário; não conta como atendimento concluído. Para localizar consultas passadas na agenda, utilize a opção de mostrar agendamentos passados.

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

## Testar antes do deploy (modo teste com Firebase Emulator)

O modo teste roda o app inteiro no seu computador usando o **Firebase Emulator** (Auth + Firestore + Storage).
Nenhum dado de produção é lido ou alterado, as regras de `firestore.rules` locais são aplicadas
e nenhum e-mail é enviado de verdade (o conteúdo aparece no terminal).

Pré-requisitos (uma vez só):

- Java 21 ou superior (necessário para o emulador do Firestore). No Windows: `winget install EclipseAdoptium.Temurin.21.JDK` e reabra o VS Code
- Firebase CLI: `npm install -g firebase-tools`

Para rodar:

```bash
npm install
npm run dev:emulador
```

Ou no VS Code: *Terminal → Run Task → Testar com emulador (modo teste)*.

- App: http://localhost:3000 (a aba do navegador mostra `[TESTE]`)
- Painel do emulador (usuários, documentos e arquivos): http://localhost:4000
  - Dados do Firestore (o app usa um banco com nome, não o `(default)`):
    http://localhost:4000/firestore/ai-studio-f268cd8f-e6a5-4bba-b421-df1c4dc1d11c/data
- Usuários de teste (senha `teste123`): `admin@teste.local`, `atendente@teste.local`,
  `dentista@teste.local`, `paciente@teste.local`
- Os dados de teste ficam salvos em `.emulator-data/` (fora do Git). Apague a pasta para recomeçar do zero.
- Para parar: `Ctrl+C` no terminal.

> Lembrete: qualquer push na branch `main` faz deploy automático. Teste em outra branch e só depois faça o merge.

## Remover senhas antigas em texto puro do Firestore

As senhas ficam apenas no Firebase Auth. Para apagar cópias antigas gravadas nos documentos
(`users`, `patients`, `dentists`, `attendants`):

```bash
npm run senhas:simular
```

Mostra o que seria removido, sem alterar nada. Para aplicar:

```bash
npm run senhas:aplicar
```

- Só remove a senha de quem tem conta no Firebase Auth; contas antigas sem Auth são mantidas e listadas.
- Precisa de credencial de produção: `FIREBASE_SERVICE_ACCOUNT_PATH=caminho/da/service-account.json`
  (ou `FIREBASE_SERVICE_ACCOUNT` com o JSON) no `.env.local`.
- Nunca imprime senhas.

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

Se a recuperação de senha retornar HTTP 503, verifique a resposta na aba Network do navegador e os logs do proxy e do processo Express (`pm2 logs bm-odonto`). A rota `/api/forgot-password` retorna 500 para erros internos, portanto um 503 pode vir do proxy ou de outro serviço. Confirme se o backend está ativo, se o proxy encaminha `/bravoOdonto/api/` para o Express e se `VITE_API_URL`, definido no momento do build quando necessário, aponta para o backend correto. Se a requisição chegar ao Express, investigue nos logs a conexão com Firestore e a configuração de e-mail. Não compartilhe credenciais nem dados pessoais ao solicitar suporte.

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

### Documentos do prontuário (Firebase Storage)

Os PDFs (até 2 MB) são enviados pelo Express e armazenados no Firebase Storage em `secure-patient-documents/{id}.pdf`. O servidor verifica o token do Firebase Auth e o perfil no Firestore para autorizar o upload; na leitura, também permite o acesso ao paciente vinculado. O vínculo confiável do arquivo fica na coleção `document_files`, inacessível aos clientes pelas regras do Firestore. Novos arquivos não usam URLs públicas de download.

O Storage deve estar habilitado e o servidor deve ter credenciais Firebase Admin com acesso ao Auth, ao banco Firestore configurado e ao bucket. Em desenvolvimento, configure `FIREBASE_SERVICE_ACCOUNT` ou `GOOGLE_APPLICATION_CREDENTIALS` em `.env.local` (não versionado) com um caminho válido para a máquina local. O login na Firebase CLI não configura automaticamente essas credenciais. Reinicie o servidor após alterar a configuração.

Publique o servidor Express e o frontend para ativar a mudança. As regras do Storage continuam em `storage.rules`; o acesso direto ao novo caminho não é permitido. Arquivos armazenados anteriormente com URLs de download continuam usando essas URLs e não são migrados automaticamente; quem possuir uma URL com token pode acessá-la.

Documentos enviados antes desta mudança (URL `blob:`) não podem ser recuperados; na lista aparecem como "Arquivo indisponível" / "Reenviar" e exigem novo upload.

Administradores, atendentes e dentistas podem excluir documentos após confirmação. O Express remove o arquivo do Storage e os registros do Firestore; documentos antigos em `blob:` ou `data:` têm apenas o registro removido. Arquivos externos sem caminho de Storage identificado não são excluídos automaticamente.

---

## Permissões e roles

| Role | Acesso |
|---|---|
| `admin` | Acesso total ao sistema |
| `attendant` | Pacientes, agendamentos, dentistas, atendentes |
| `dentist` | Portal do dentista + abas extras conforme permissões |
| `patient` | Portal do paciente (agendamentos e tratamentos próprios) |

Permissões extras podem ser atribuídas individualmente a dentistas e atendentes pelo administrador.

Na ficha do dentista, **Nova Senha** atualiza a conta vinculada na gestão de usuários pelo mesmo endpoint administrativo de autenticação. A senha é exibida para cópia somente após a confirmação da API; ela não é enviada por e-mail. A operação requer uma sessão de administrador e um usuário de dentista vinculado.
