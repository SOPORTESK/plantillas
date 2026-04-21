# SEKUNET App — Guía de instalación paso a paso

## Estructura del proyecto

```
sekunet-app/
├── src/
│   ├── config.js              ← constantes y URLs (sin secrets)
│   ├── state.js               ← estado global centralizado
│   ├── db/
│   │   └── supabase.js        ← cliente Supabase compartido
│   ├── api/
│   │   └── gemini.js          ← llamadas a Gemini (via Edge Function)
│   ├── features/
│   │   └── auth.js            ← login/logout con Supabase Auth
│   └── ui/
│       └── toast.js           ← (copiar de sekunet.html)
├── supabase/
│   ├── functions/
│   │   ├── gemini-proxy/      ← protege la API Key de Gemini
│   │   └── channel-webhook/   ← recibe mensajes de clientes reales
│   └── migrations/
│       ├── 001_rls_and_auth.sql   ← seguridad crítica
│       └── 002_channel_messages.sql ← tabla para canal de clientes
├── .env.example               ← copiar como .env y llenar
└── package.json
```

---

## PASO 1 — Instalar dependencias

Abrí PowerShell en la carpeta `sekunet-app` y ejecutá:

```powershell
npm install
```

---

## PASO 2 — Crear el archivo .env

1. Copiá `.env.example` y renombralo `.env`
2. Llenalo con tus datos de Supabase:

```
VITE_SB_URL=https://kzcyxeracvfxynddyjld.supabase.co
VITE_SB_ANON_KEY=tu_anon_key_aqui
```

La anon key la encontrás en:
**Supabase → Settings → API → Project API keys → anon public**

---

## PASO 3 — Ejecutar migraciones SQL en Supabase

1. Ir a **Supabase → SQL Editor**
2. Pegar y ejecutar `supabase/migrations/001_rls_and_auth.sql`
3. Pegar y ejecutar `supabase/migrations/002_channel_messages.sql`

> ⚠️ La migración 001 **elimina la columna `pass`** de `sek_agent_config`.
> Antes de ejecutarla, asegurate de que todos los usuarios existentes
> estén migrados a Supabase Auth (siguiente paso).

---

## PASO 4 — Migrar usuarios a Supabase Auth

Para cada usuario que ya existe en `sek_agent_config`:

1. Ir a **Supabase → Authentication → Users → Invite user**
2. Ingresar el email del agente
3. El agente recibirá un email para crear su contraseña

O bien usar la API de admin para migrarlos en bulk.

---

## PASO 5 — Instalar Supabase CLI y deployar Edge Functions

```powershell
# Instalar Supabase CLI
npm install -g supabase

# Login
supabase login

# Vincular al proyecto
supabase link --project-ref kzcyxeracvfxynddyjld

# Agregar la API Key de Gemini como secreto del servidor
supabase secrets set GEMINI_API_KEY=AIzaSy...

# Agregar token de verificación para WhatsApp (podés inventar uno)
supabase secrets set WHATSAPP_VERIFY_TOKEN=miTokenSecreto123

# Deployar la Edge Function que protege Gemini
supabase functions deploy gemini-proxy

# Deployar el webhook del canal de clientes
supabase functions deploy channel-webhook
```

---

## PASO 6 — Probar en local

```powershell
npm run dev
```

Abrí el browser en `http://localhost:5173`

---

## PASO 7 — Conectar WhatsApp (cuando estés listo)

1. Crear cuenta en [Meta for Developers](https://developers.facebook.com)
2. Crear app → WhatsApp → Configurar webhook
3. URL del webhook: `https://kzcyxeracvfxynddyjld.supabase.co/functions/v1/channel-webhook?channel=whatsapp`
4. Verify token: el mismo que pusiste en `WHATSAPP_VERIFY_TOKEN`

Cuando llegue un mensaje de WhatsApp:
- Se guarda en `sek_messages`
- El panel del agente lo recibe en tiempo real (Supabase Realtime)
- El agente responde desde el panel

---

## Capas de trabajo

| Capa | Estado | Descripción |
|------|--------|-------------|
| **Capa 1 — Seguridad** | ✅ Lista | Auth, RLS, Edge Function Gemini |
| **Capa 2 — Módulos JS** | 🔄 En progreso | Separar sekunet.html en módulos |
| **Capa 3 — Canal cliente** | 📋 Estructura lista | Conectar WhatsApp/webchat |
