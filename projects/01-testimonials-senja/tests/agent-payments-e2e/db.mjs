import { createRequire } from 'node:module';
const require = createRequire(process.env.AGENT_E2E_SOURCE + '/package.json');
const { Client } = require('pg');
const connectionString = process.env.TEST_DATABASE_URL;
if (new URL(connectionString).hostname !== 'postgres' || process.env.AGENT_E2E_ISOLATED !== 'true') throw Error('Dedicated test database required');
const input = JSON.parse(process.argv[2]);
const client = new Client({ connectionString }); await client.connect();
try { console.log(JSON.stringify((await client.query(input.sql, input.params)).rows)); } finally { await client.end(); }
