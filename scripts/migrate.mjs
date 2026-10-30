import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const password = process.argv[2];

if (!password) {
  console.error('Uso: node scripts/migrate.mjs <SENHA_DO_BANCO>');
  process.exit(1);
}

// Tenta conexão direta ou via pooler
const connectionString = `postgresql://postgres:${encodeURIComponent(password)}@db.bdlwizqxbfocqsekdkkl.supabase.co:5432/postgres`;

async function run() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('Conectando ao banco Supabase...');
    await client.connect();
    console.log('Conexão estabelecida com sucesso!');

    const sqlPath = path.join(__dirname, '..', 'supabase_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executando criação das tabelas...');
    await client.query(sql);
    console.log('✅ SUCESSO: Todas as tabelas e atletas de teste foram criados no Supabase!');
  } catch (err) {
    console.error('Erro na migração:', err.message);
  } finally {
    await client.end();
  }
}

run();
