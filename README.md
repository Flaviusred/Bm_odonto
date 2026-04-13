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
