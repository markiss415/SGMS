import './testEnv';

export default async function setup() {
  const { dropAllTables, runMigrations } = await import('../src/db/migrate');
  const { seed } = await import('../src/db/seed');
  const { closePool } = await import('../src/db/pool');
  await dropAllTables();
  await runMigrations(() => {});
  await seed({ demo: true });
  await closePool();
}
