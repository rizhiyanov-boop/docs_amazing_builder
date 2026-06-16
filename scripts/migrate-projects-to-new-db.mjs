import { createHash, randomBytes } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function makeId(prefix) {
  return `${prefix}_${randomBytes(9).toString('hex')}`;
}

function hashProjectPayload(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function normalizeLogin(value) {
  return value.trim().toLowerCase();
}

const oldDatabaseUrl = requiredEnv('OLD_DATABASE_URL');
const newDatabaseUrl = requiredEnv('NEW_DATABASE_URL');
const ownerLogin = normalizeLogin(requiredEnv('NEW_OWNER_LOGIN'));
const ownerPassword = requiredEnv('NEW_OWNER_PASSWORD');
const oldProjectUserId = process.env.OLD_PROJECT_USER_ID?.trim();

if (oldDatabaseUrl === newDatabaseUrl) {
  throw new Error('OLD_DATABASE_URL and NEW_DATABASE_URL must point to different databases');
}

const oldSql = neon(oldDatabaseUrl);
const newSql = neon(newDatabaseUrl);

async function createNewSchema() {
  await newSql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      login TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL DEFAULT '',
      password_algorithm TEXT NOT NULL DEFAULT 'bcrypt',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await newSql`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;

  await newSql`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      workspace JSONB NOT NULL,
      history JSONB,
      payload_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await newSql`CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects(user_id)`;
  await newSql`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)`;
  await newSql`CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at)`;
}

async function upsertOwner() {
  const passwordHash = await bcrypt.hash(ownerPassword, BCRYPT_ROUNDS);
  const created = await newSql`
    INSERT INTO users (id, login, password_hash, password_salt, password_algorithm)
    VALUES (${makeId('usr')}, ${ownerLogin}, ${passwordHash}, ${''}, ${'bcrypt'})
    ON CONFLICT (login) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        password_salt = EXCLUDED.password_salt,
        password_algorithm = EXCLUDED.password_algorithm,
        updated_at = now()
    RETURNING id, login
  `;
  return created[0];
}

async function readOldProjects() {
  if (oldProjectUserId) {
    return oldSql`
      SELECT id, user_id, name, workspace, history, payload_hash, created_at, updated_at
      FROM projects
      WHERE user_id = ${oldProjectUserId}
      ORDER BY updated_at DESC
    `;
  }

  return oldSql`
    SELECT id, user_id, name, workspace, history, payload_hash, created_at, updated_at
    FROM projects
    ORDER BY updated_at DESC
  `;
}

async function copyProject(project, newOwnerId) {
  const workspace = project.workspace ?? {};
  const history = project.history ?? null;
  const name = String(project.name || 'Документ API');
  const payloadHash = project.payload_hash || hashProjectPayload({ name, workspace, history });

  await newSql`
    INSERT INTO projects (id, user_id, name, workspace, history, payload_hash, created_at, updated_at)
    VALUES (
      ${String(project.id)},
      ${newOwnerId},
      ${name},
      ${JSON.stringify(workspace)}::jsonb,
      ${history === null ? null : JSON.stringify(history)}::jsonb,
      ${payloadHash},
      ${project.created_at ?? new Date().toISOString()},
      ${project.updated_at ?? new Date().toISOString()}
    )
    ON CONFLICT (id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        name = EXCLUDED.name,
        workspace = EXCLUDED.workspace,
        history = EXCLUDED.history,
        payload_hash = EXCLUDED.payload_hash,
        updated_at = EXCLUDED.updated_at
  `;
}

async function main() {
  console.log('Creating clean schema in NEW_DATABASE_URL...');
  await createNewSchema();

  console.log(`Creating/updating owner user "${ownerLogin}" in NEW_DATABASE_URL...`);
  const owner = await upsertOwner();

  console.log(`Reading projects from OLD_DATABASE_URL${oldProjectUserId ? ` for user_id=${oldProjectUserId}` : ''}...`);
  const projects = await readOldProjects();

  console.log(`Copying ${projects.length} project(s) to NEW_DATABASE_URL...`);
  for (const project of projects) {
    await copyProject(project, owner.id);
  }

  console.log(`Done. Copied ${projects.length} project(s) to owner ${owner.login} (${owner.id}).`);
  console.log('Next: set Vercel DATABASE_URL to NEW_DATABASE_URL and redeploy.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
