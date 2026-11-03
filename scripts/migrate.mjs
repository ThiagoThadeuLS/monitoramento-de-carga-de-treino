// Aplica o supabase_completo.sql no banco (o mesmo que colar o arquivo no SQL Editor).
//
// Uso:
//   1. No arquivo .env.local (não vai para o git), coloque a conexão do banco:
//        DATABASE_URL=postgresql://postgres:<SENHA>@db.<projeto>.supabase.co:5432/postgres
//      (Supabase -> Project Settings -> Database -> Connection string)
//   2. Baixe o certificado do banco (Project Settings -> Database -> SSL Configuration ->
//      Download certificate) e informe o caminho:
//        DATABASE_CA_CERT=./prod-ca-2021.crt
//   3. npm run db:migrate
//
// A senha não é passada na linha de comando (ficaria no histórico do terminal) e a conexão
// confere o certificado do servidor. Só para teste local é possível desligar a conferência
// com DATABASE_INSECURE_SSL=1 (não use no banco de produção).
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const sqlPath = path.join(root, 'supabase_completo.sql');

function fail(message) {
  console.error(`Erro: ${message}`);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  fail('defina DATABASE_URL no arquivo .env.local (veja as instruções no topo de scripts/migrate.mjs).');
}

function sslConfig() {
  if (process.env.DATABASE_INSECURE_SSL === '1') {
    console.warn('Atenção: conferência do certificado DESLIGADA (DATABASE_INSECURE_SSL=1). Use só em teste.');
    return { rejectUnauthorized: false };
  }
  const caPath = process.env.DATABASE_CA_CERT;
  if (!caPath) {
    fail('defina DATABASE_CA_CERT com o caminho do certificado do banco (Project Settings -> Database -> SSL Configuration).');
  }
  const resolved = path.resolve(root, caPath);
  if (!fs.existsSync(resolved)) fail(`certificado não encontrado em ${resolved}.`);
  return { rejectUnauthorized: true, ca: fs.readFileSync(resolved, 'utf8') };
}

if (!fs.existsSync(sqlPath)) fail(`arquivo não encontrado: ${sqlPath}`);

const client = new pg.Client({ connectionString, ssl: sslConfig() });

try {
  console.log('Conectando ao banco...');
  await client.connect();
  console.log(`Aplicando ${path.basename(sqlPath)}...`);
  await client.query(fs.readFileSync(sqlPath, 'utf8'));
  console.log('Pronto: banco atualizado.');
} catch (err) {
  console.error('Erro na migração:', err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
