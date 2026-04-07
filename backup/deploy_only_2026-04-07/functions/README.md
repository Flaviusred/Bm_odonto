# Funções Cloud (functions)

Instruções rápidas para instalar, configurar o segredo da Service Account e fazer deploy da função `agendarConsulta`.

Pré-requisitos
- Projeto GCP com API Calendar habilitada
- Firebase CLI (`npm i -g firebase-tools`) ou `gcloud` configurado
- Permissões para criar/accessar Secret Manager

1) Instalar dependências

```bash
cd functions
npm install
```

2) Adicionar a chave da Service Account ao Secret Manager (recomendado)

Substitua `PROJECT_ID` e `SECRET_NAME` pelos seus valores.

```bash
gcloud secrets create SECRET_NAME --replication-policy="automatic" --project=PROJECT_ID
gcloud secrets versions add projects/PROJECT_ID/secrets/SECRET_NAME --data-file=/path/to/service-account.json
```

Depois, configure a variável de ambiente `SERVICE_ACCOUNT_SECRET_NAME` na sua função (ou deixe a função ler `SERVICE_ACCOUNT_SECRET_NAME` do env do runtime). Exemplo com Firebase (runtime env):

```bash
firebase functions:config:set service_account.secret_name="SECRET_NAME"
# ou configurar via console para a Cloud Function após deploy
```

3) Deploy (Firebase Functions)

```bash
# inicializar se necessário
firebase login
firebase init functions
# Deploy
firebase deploy --only functions:agendarConsulta
```

4) Alternativa (definir SERVICE_ACCOUNT_JSON em dev)

Para desenvolvimento local rápido, você pode exportar a variável de ambiente com o conteúdo JSON:

```bash
export SERVICE_ACCOUNT_JSON='$(cat /path/to/service-account.json)'
# No Windows PowerShell:
$env:SERVICE_ACCOUNT_JSON = Get-Content -Raw C:\path\to\service-account.json
```

Observações
- A service account deve ter permissão de Calendar (acesso de escrita) para o calendário do dentista, ou o calendário deve compartilhar permissão com a conta de serviço.
- A função `agendarConsulta` espera payload: `{ calendarId, emailPaciente, dataInicio, dataFim, nomeProcedimento }` e usa `sendUpdates: 'all'` para que o Google envie convites.
