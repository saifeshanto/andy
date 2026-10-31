/**
 * Cron entry point for Hostinger hPanel cron jobs.
 *   Bundle:  node /path/to/app/cron.js heartbeat
 *   Dev:     npm run cron -w @andy/api -- heartbeat
 * Exit code 0 on success or skip, 1 on failure (so cron emails show failures).
 */
import { db, disconnectDb } from '../src/core/db.js';
import { runJob } from '../src/jobs/runner.js';
import { jobs } from '../src/jobs/registry.js';

const name = process.argv[2];
if (!name || !jobs[name]) {
  console.error(`Usage: cron <job>\nJobs: ${Object.keys(jobs).join(', ')}`);
  process.exit(1);
}

const result = await runJob(db(), name, 'cli');
console.log(JSON.stringify(result));
await disconnectDb();
process.exit(result.status === 'FAILED' ? 1 : 0);
