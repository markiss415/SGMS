/** Points the app at the test database. Imported first by every test file and by globalSetup. */
import 'dotenv/config';

process.env.NODE_ENV = 'test';
process.env.MYSQL_DATABASE = process.env.MYSQL_DATABASE_TEST || 'bangbang_sgms_test';
process.env.SEED_PASSWORD = 'TestSeed2026';
process.env.BCRYPT_ROUNDS = '4';
process.env.DISABLE_RATE_LIMIT = 'true';

if (!/test/i.test(process.env.MYSQL_DATABASE)) {
  throw new Error('Refusing to run tests: the test database name must contain "test".');
}
