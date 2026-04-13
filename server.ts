import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import cron from "node-cron";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { google } from "googleapis";

dotenv.config();

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(process.cwd(), "data.json");

app.use(express.json({ limit: '50mb' }));

// Initial data structure
const initialData = {
  patients: [],
  dentists: [],
  appointments: [],
  settings: {
    emailReminders: true,
    reminderHoursBefore: 24
  }
};

// Helper to read/write data
const getData = () => {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
};

const saveData = (data: any) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

// Google OAuth Setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Google Auth URL
app.get("/api/auth/google/url", (req, res) => {
  const dentistId = req.query.dentistId as string;
  if (!dentistId) return res.status(400).json({ error: "dentistId is required" });

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    state: dentistId,
    prompt: "consent"
  });
  res.json({ url });
});

// Google Auth Callback
app.get("/auth/google/callback", async (req, res) => {
  const { code, state: dentistId } = req.query;
  
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    const data = getData();
    const dentistIndex = data.dentists.findIndex((d: any) => d.id === dentistId);
    
    if (dentistIndex !== -1) {
      data.dentists[dentistIndex].googleTokens = tokens;
      saveData(data);
    }

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Google Calendar connected successfully! This window will close.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error exchanging code for tokens:", error);
    res.status(500).send("Authentication failed");
  }
});

const syncToGoogleCalendar = async (appointment: any, dentist: any, patient: any) => {
  if (!dentist.googleTokens) return;

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials(dentist.googleTokens);

  const calendar = google.calendar({ version: "v3", auth });

  const startDateTime = new Date(`${appointment.date}T${appointment.time}`);
  const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // Default 1 hour

  const event = {
    summary: `Consulta Odontológica: ${patient.name}`,
    description: `Paciente: ${patient.name}\nObservações: ${appointment.notes || "Nenhuma"}`,
    start: {
      dateTime: startDateTime.toISOString(),
      timeZone: "America/Sao_Paulo",
    },
    end: {
      dateTime: endDateTime.toISOString(),
      timeZone: "America/Sao_Paulo",
    },
  };

  try {
    if (appointment.googleEventId) {
      await calendar.events.update({
        calendarId: "primary",
        eventId: appointment.googleEventId,
        requestBody: event,
      });
    } else {
      const res = await calendar.events.insert({
        calendarId: "primary",
        requestBody: event,
      });
      appointment.googleEventId = res.data.id;
    }
  } catch (error) {
    console.error("Error syncing to Google Calendar:", error);
  }
};

app.put("/api/users/:id", (req, res) => {
  const { id } = req.params;
  const updatedUser = req.body;
  const data = getData();
  
  if (!data.users) data.users = [];
  
  const userIndex = data.users.findIndex((u: any) => u.id === id);
  if (userIndex === -1) {
    return res.status(404).json({ error: "Usuário não encontrado" });
  }
  
  data.users[userIndex] = { ...data.users[userIndex], ...updatedUser };
  saveData(data);
  res.json({ status: "ok", user: data.users[userIndex] });
});

// API Routes
app.get("/api/data", (req, res) => {
  res.json(getData());
});

app.post("/api/send-email", async (req, res) => {
  const { to, subject, text } = req.body;
  try {
    await sendEmail(to, subject, text);
    res.json({ status: "ok" });
  } catch (error) {
    res.status(500).json({ error: "Failed to send email" });
  }
});

app.get("/api/check-email-config", (req, res) => {
  const isConfigured = !!process.env.EMAIL_USER && !!process.env.EMAIL_PASS;
  res.json({ isConfigured });
});

app.get("/api/cbmpb/:identifier", async (req, res) => {
  // Limpar o identificador para garantir que apenas números sejam enviados
  const identifier = req.params.identifier.replace(/\D/g, '');
  const rawToken = process.env.CBMPB_API_TOKEN;
  
  if (!rawToken) {
    console.error("CBMPB_API_TOKEN não configurado");
    return res.status(500).json({ error: "Token não configurado no servidor" });
  }

  let token = rawToken.trim();
  
  // Se o usuário colou o cabeçalho inteiro "Authorization: Bearer ...", limpa para pegar só o código
  if (token.startsWith('Authorization:')) {
    token = token.replace(/^Authorization:\s*/i, '');
  }
  if (token.startsWith('Bearer ')) {
    token = token.replace(/^Bearer\s+/i, '');
  }
  
  // Log mascarado para conferência (apenas no console do servidor)
  console.log(`Token detectado (Tamanho: ${token.length}): ${token.substring(0, 10)}...${token.substring(token.length - 10)}`);

  try {
    const url = `https://bravo.bombeiros.pb.gov.br/api/v1/pbsaude/servidor/${identifier}`;
    console.log(`Buscando em: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://bravo.bombeiros.pb.gov.br/',
        'Origin': 'https://bravo.bombeiros.pb.gov.br'
      }
    });
    
    const responseText = await response.text();
    console.log(`Status: ${response.status}`);
    console.log(`Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`);
    console.log(`Body: ${responseText}`);
    
    // Status 203 com corpo vazio geralmente indica problema de permissão ou token inválido na API Bravo
    if (response.status === 203 && (!responseText || responseText.trim() === "")) {
        return res.status(401).json({ 
          error: "Acesso não autorizado ou Token inválido (Status 203)", 
          details: "A API retornou uma resposta sem dados. Verifique se o Token tem permissão para o módulo pbsaude." 
        });
    }

    if (!response.ok) {
        return res.status(response.status).json({ error: `API error: ${responseText}` });
    }
    
    if (!responseText || responseText.trim() === "") {
        return res.status(200).json({});
    }

    try {
      const data = JSON.parse(responseText);
      res.json(data);
    } catch (e) {
      console.error("Erro ao parsear JSON:", e);
      res.status(500).json({ error: "Resposta da API não é um JSON válido", body: responseText });
    }
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/data", async (req, res) => {
  const oldData = getData();
  const newData = req.body;
  
  // Preserve Google tokens if they are missing in the incoming data
  newData.dentists = newData.dentists.map((newDentist: any) => {
    const oldDentist = oldData.dentists.find((d: any) => d.id === newDentist.id);
    if (oldDentist && oldDentist.googleTokens && !newDentist.googleTokens) {
      return { ...newDentist, googleTokens: oldDentist.googleTokens };
    }
    return newDentist;
  });

  // Detect new or updated appointments to sync with Google Calendar
  const newAppointments = newData.appointments.filter((newApt: any) => {
    const oldApt = oldData.appointments.find((a: any) => a.id === newApt.id);
    return !oldApt || JSON.stringify(oldApt) !== JSON.stringify(newApt);
  });

  for (const apt of newAppointments) {
    const dentist = newData.dentists.find((d: any) => d.id === apt.dentistId);
    const patient = newData.patients.find((p: any) => p.id === apt.patientId);
    if (dentist && patient && dentist.googleTokens) {
      await syncToGoogleCalendar(apt, dentist, patient);
    }
  }

  saveData(newData);
  res.json({ status: "ok" });
});

// Reminder Logic
const sendEmail = async (to: string, subject: string, text: string) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log("Email credentials not set. Skipping email.");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, text });
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

// Cron job to check for reminders every hour
cron.schedule("0 * * * *", async () => {
  console.log("Checking for upcoming appointments...");
  const data = getData();
  const now = new Date();
  const reminderTime = new Date(now.getTime() + data.settings.reminderHoursBefore * 60 * 60 * 1000);

  data.appointments.forEach(async (app: any) => {
    const appDate = new Date(`${app.date}T${app.time}`);
    
    // If appointment is within the reminder window and hasn't been reminded yet
    if (appDate > now && appDate <= reminderTime && !app.reminderSent) {
      const patient = data.patients.find((p: any) => p.id === app.patientId);
      const dentist = data.dentists.find((d: any) => d.id === app.dentistId);

      if (patient && dentist) {
        const message = `Lembrete: Você tem uma consulta odontológica com ${dentist.name} em ${app.date} às ${app.time}.`;
        
        if (data.settings.emailReminders && patient.email) {
          await sendEmail(patient.email, "Lembrete de Consulta", message);
        }

        // Mark as sent
        app.reminderSent = true;
      }
    }
  });

  saveData(data);
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
