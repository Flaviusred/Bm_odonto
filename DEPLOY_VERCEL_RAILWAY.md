Guia rápido: Deploy usando Vercel (frontend) + Railway (backend)

Resumo
- Frontend (React + Vite) será publicado no Vercel como site estático, usando o `dist` gerado por `npm run build`.
- Backend (Express + servidor que serve `dist`) será executado como serviço Node no Railway.

Pré-requisitos
- Conta no Vercel (https://vercel.com) e acesso ao repositório GitHub/GitLab/Bitbucket.
- Conta no Railway (https://railway.app) e acesso ao repositório.
- Variáveis de ambiente preparadas (veja `.env.example`).

1) Preparar repositório
- Confirmar que o repositório está com todas as alterações comitadas e push para um branch remoto.

2) Deploy do frontend (Vercel)
- No Vercel, crie um novo projeto e conecte ao repositório.
- Configure o projeto para usar o root do repositório (padrão).
- Build Command: `npm run build`
- Output Directory: `dist`
- O arquivo `vercel.json` já força o uso de `@vercel/static-build` e rota SPA.
- Em Settings → Environment Variables, defina `SITE_URL` apontando para a URL do Vercel (ex: `https://projeto.vercel.app`).

3) Deploy do backend (Railway)
- No Railway, crie um novo projeto e conecte ao repositório.
- Adicione um Service do tipo Web (Node). Railway detectará o `Procfile` e deve executar `npm run start`.
- Em Settings do serviço, adicione todas as variáveis de ambiente necessárias (veja `.env.example`):
  - `FIREBASE_SERVICE_ACCOUNT` (string JSON)
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
  - `SMTP_PROVIDER` / `EMAIL_USER` / `EMAIL_PASS` ou `SMTP_*` / `SENDGRID_API_KEY`
  - `CBMPB_API_TOKEN` (se usar)
  - `GEMINI_API_KEY` (se usar)
  - `SITE_URL` (a URL do frontend no Vercel)

Observações:
- O servidor usa `process.env.PORT` (modificado no `server.ts`), o Railway fornece isso automaticamente.
- O `start` do `package.json` já é `cross-env NODE_ENV=production tsx server.ts`. Garantimos que `tsx` está em `dependencies`.
- Se preferir, é possível compilar o servidor para JS antes do deploy e usar `node dist-server/server.js`.

4) Testes locais antes do deploy
- Instale dependências: `npm install`
- Executar build do frontend: `npm run build`
- Iniciar servidor em produção local: `npm run start` (vai usar `NODE_ENV=production` e servir `dist/`)

5) Pós-deploy
- No Railway, verifique logs do serviço para confirmar que o servidor iniciou e está ouvindo em `0.0.0.0:PORT`.
- No Vercel, acesse a URL do site e confirme que as rotas do SPA funcionam.

Se quiser, eu posso:
- Gerar os commits necessários e abrir um PR com estas alterações (já aplicadas aqui).
- Ajudar a configurar passos no painel do Vercel e Railway (posso fornecer os valores exatos de variáveis a preencher).
