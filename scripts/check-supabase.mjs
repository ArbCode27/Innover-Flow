import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { randomBytes, scrypt as scryptCb } from "crypto";
import { promisify } from "util";
import { createClient } from "@supabase/supabase-js";

const scryptAsync = promisify(scryptCb);

// Load .env manually if not in process.env
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log("==================================================");
console.log("   VERIFICACIÓN DE CONEXIÓN SUPABASE (INNOVER)");
console.log("==================================================");

if (!supabaseUrl) {
  console.error("❌ FALTA: NEXT_PUBLIC_SUPABASE_URL no está definido en .env");
  process.exit(1);
}

if (!serviceKey) {
  console.error("❌ FALTA: SUPABASE_SERVICE_ROLE_KEY no está definido en .env");
  process.exit(1);
}

console.log(`🔗 URL: ${supabaseUrl}`);
console.log(`🔑 Anon Key: ${anonKey ? "Configurada ✅" : "Falta ❌"}`);
console.log(`🛡️ Service Role Key: ${serviceKey ? "Configurada ✅" : "Falta ❌"}`);
console.log(`🔐 CRM_INTERNAL_SECRET: ${process.env.CRM_INTERNAL_SECRET ? "Configurada ✅" : "Falta ❌"}`);
console.log(`🔐 INTEGRATION_ENCRYPTION_KEY: ${process.env.INTEGRATION_ENCRYPTION_KEY ? "Configurada ✅" : "Falta ❌"}`);
console.log("--------------------------------------------------");

const supabase = createClient(supabaseUrl, serviceKey);

const REQUIRED_TABLES = [
  "organizations",
  "organization_members",
  "organization_integrations",
  "agents",
  "clients",
  "conversations",
  "messages",
  "tickets",
  "labels",
  "quick_replies",
  "crm_settings",
  "crm_settings_history",
  "conversation_history",
  "history_messages",
  "crm_payments",
  "ai_runs",
  "ai_tool_invocations",
  "conversation_assignments",
  "conversation_events",
];

const REQUIRED_BUCKETS = [
  process.env.SUPABASE_WHATSAPP_AUDIO_BUCKET || "audio-bucket",
  process.env.SUPABASE_WHATSAPP_IMAGE_BUCKET || "image-bucket",
  process.env.SUPABASE_WHATSAPP_VIDEO_BUCKET || "video-bucket",
  process.env.SUPABASE_WHATSAPP_DOCUMENT_BUCKET || "document-bucket",
];

async function checkDatabase() {
  console.log("\n📊 Verificando tablas en la base de datos...\n");
  const missingTables = [];
  const existingTables = [];

  for (const table of REQUIRED_TABLES) {
    try {
      const { data, error } = await supabase.from(table).select("*").limit(1);
      if (error) {
        missingTables.push({ table, error: error.message });
        console.log(`  ❌ [${table}]: No encontrada o error (${error.message})`);
      } else {
        existingTables.push(table);
        console.log(`  ✅ [${table}]: OK`);
      }
    } catch (err) {
      missingTables.push({ table, error: err.message });
      console.log(`  ❌ [${table}]: ${err.message}`);
    }
  }

  console.log("\n📦 Verificando Storage Buckets...\n");
  try {
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) {
      console.log(`  ⚠️ No se pudieron listar los buckets: ${bucketError.message}`);
    } else {
      const bucketNames = (buckets || []).map((b) => b.name);
      for (const reqBucket of REQUIRED_BUCKETS) {
        if (bucketNames.includes(reqBucket)) {
          console.log(`  ✅ Bucket [${reqBucket}]: Existe`);
        } else {
          console.log(`  ⚠️ Bucket [${reqBucket}]: No existe. Creándolo automáticamente...`);
          try {
            const { error: createErr } = await supabase.storage.createBucket(reqBucket, { public: true });
            if (createErr) {
              console.log(`     ❌ Falló al crear: ${createErr.message}`);
            } else {
              console.log(`     ✅ Bucket [${reqBucket}] creado exitosamente como público.`);
            }
          } catch (e) {
            console.log(`     ❌ Error: ${e.message}`);
          }
        }
      }
    }
  } catch (err) {
    console.log(`  ⚠️ Error al interactuar con Storage: ${err.message}`);
  }

  if (missingTables.length > 0) {
    const projectRef = supabaseUrl.replace("https://", "").split(".")[0];
    console.log("\n--------------------------------------------------");
    console.log(`⚠️ Faltan ${missingTables.length} tablas por crear en esta base de datos.`);
    console.log("👉 Por favor copia y ejecuta el contenido de 'supabase/schema.sql' en el SQL Editor de Supabase:");
    console.log(`   🔗 Enlace directo: https://supabase.com/dashboard/project/${projectRef}/sql`);
    console.log("==================================================\n");
    return;
  }

  console.log("\n👤 Verificando datos semilla (Organización y Agente Admin)...\n");
  try {
    const defaultOrgId = "00000000-0000-4000-8000-000000000001";
    let { data: orgs } = await supabase.from("organizations").select("id, name, slug");
    if (!orgs?.length) {
      console.log("  ⚠️ No se encontró ninguna organización. Creando organización por defecto 'Innover'...");
      const { error: insOrgErr } = await supabase.from("organizations").insert({
        id: defaultOrgId,
        name: "Innover",
        slug: "innover",
      });
      if (insOrgErr) {
        console.log(`     ❌ Error creando organización: ${insOrgErr.message}`);
      } else {
        console.log("     ✅ Organización 'Innover' creada con éxito.");
      }
    } else {
      console.log(`  ✅ Organización encontrada: "${orgs[0].name}" (${orgs[0].id})`);
    }

    let { data: agents } = await supabase.from("agents").select("id, email, name, role");
    if (!agents?.length) {
      console.log("  ⚠️ No se encontraron agentes registrados. Creando Administrador inicial...");
      const salt = randomBytes(16);
      const derived = await scryptAsync("Admin123!", salt, 64);
      const hashedPassword = `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;

      const { data: newAgent, error: insAgentErr } = await supabase.from("agents").insert({
        id: 1,
        organization_id: defaultOrgId,
        name: "Administrador",
        email: "admin@innover.com",
        password: hashedPassword,
        role: "admin",
        status: "offline",
        initials: "AD",
      }).select("id, email, name, role").single();

      if (insAgentErr) {
        console.log(`     ❌ Error creando admin: ${insAgentErr.message}`);
      } else {
        console.log(`     ✅ Agente Administrador creado: ${newAgent.email} (Contraseña: Admin123!)`);

        // Vincular a organization_members
        await supabase.from("organization_members").upsert({
          organization_id: defaultOrgId,
          agent_id: newAgent.id,
          role: "admin",
          status: "active",
        });

        // Ajustes CRM
        await supabase.from("crm_settings").upsert({
          organization_id: defaultOrgId,
          bot_engine: "ai",
          ai_model: "llama-3.3-70b-versatile",
        });

        // Etiquetas estándar
        await supabase.from("labels").upsert([
          { organization_id: defaultOrgId, name: "verificar pago", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)" },
          { organization_id: defaultOrgId, name: "pagado api", color: "#10b981", bg: "rgba(16, 185, 129, 0.15)" },
          { organization_id: defaultOrgId, name: "soporte", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.15)" },
          { organization_id: defaultOrgId, name: "ia error", color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)" },
        ]);
        console.log("     ✅ Miembro de organización, ajustes y etiquetas iniciales creados.");
      }
    } else {
      console.log(`  ✅ Agentes registrados: ${agents.length}`);
      for (const a of agents) {
        console.log(`     - [${a.role}] ${a.name} (${a.email})`);
      }
    }
  } catch (err) {
    console.log(`  ⚠️ Error al verificar datos iniciales: ${err.message}`);
  }

  console.log("\n--------------------------------------------------");
  if (missingTables.length === 0) {
    console.log("🎉 ¡TODAS LAS TABLAS EXISTEN Y ESTÁN LISTAS!");
    console.log("El CRM está 100% conectado y listo para usarse.");
  } else {
    console.log(`⚠️ Faltan ${missingTables.length} tablas por crear.`);
    console.log("👉 Por favor ejecuta el archivo 'supabase/schema.sql' en el SQL Editor de Supabase.");
  }
  console.log("==================================================\n");
}

checkDatabase();
