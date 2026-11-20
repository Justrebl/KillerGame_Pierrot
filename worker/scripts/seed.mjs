import { randomBytes, randomUUID, webcrypto } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const inputPath = new URL("../event.local.json", import.meta.url);
const outputPath = new URL("../../.private/seed.sql", import.meta.url);
const event = JSON.parse(await readFile(inputPath, "utf8"));

if (event.password === "A_REMPLIR_LOCALEMENT" || event.password.length < 12) {
  throw new Error("Renseigne un mot de passe local d'au moins 12 caractères.");
}
if (!event.eventId || !event.killer || !Array.isArray(event.targets) || !event.targets.length) {
  throw new Error("Le fichier event.local.json doit définir eventId, killer et au moins une cible.");
}

const encoder = new TextEncoder();
const iterations = 120000;
const authSalt = randomBytes(16).toString("base64");
const encryptionSalt = randomBytes(16).toString("base64");
const baseKey = await webcrypto.subtle.importKey(
  "raw",
  encoder.encode(event.password),
  "PBKDF2",
  false,
  ["deriveBits"]
);
const verifierBits = await webcrypto.subtle.deriveBits(
  {
    name: "PBKDF2",
    salt: Uint8Array.from(Buffer.from(authSalt, "base64")),
    iterations,
    hash: "SHA-256"
  },
  baseKey,
  256
);
const verifier = Buffer.from(verifierBits).toString("hex");

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const now = new Date().toISOString();
const statements = [
  `INSERT INTO events(id, killer_name, credential_verifier, auth_salt, encryption_salt, kdf_iterations, created_at) VALUES (${quote(event.eventId)}, ${quote(event.killer)}, ${quote(verifier)}, ${quote(authSalt)}, ${quote(encryptionSalt)}, ${iterations}, ${quote(now)});`
];

for (const [index, target] of event.targets.entries()) {
  if (!target.name || !target.condition) {
    throw new Error(`La cible ${index + 1} doit avoir un nom et une condition.`);
  }
  statements.push(
    `INSERT INTO targets(id, event_id, name, condition, position) VALUES (${quote(randomUUID())}, ${quote(event.eventId)}, ${quote(target.name)}, ${quote(target.condition)}, ${index + 1});`
  );
}

await mkdir(new URL("../../.private/", import.meta.url), { recursive: true });
await writeFile(outputPath, `${statements.join("\n")}\n`, "utf8");
console.log(`Seed SQL généré dans .private/seed.sql avec ${event.targets.length} cibles.`);
console.log("Le SQL ignoré par Git contient les noms et défis; le mot de passe brut est remplacé par son empreinte.");
