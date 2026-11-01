/**
 * Cron entry point for Hostinger hPanel cron jobs.
 *   Bundle:  node /path/to/app/cron.js heartbeat
 *   Dev:     npm run cron -w @andy/api -- heartbeat
 * Exit code 0 on success or skip, 1 on failure (so cron emails show failures).
 */
import { db, disconnectDb } from '../src/core/db.js';
import { runJob } from '../src/jobs/runner.js';
import { jobs, tickJobs } from '../src/jobs/registry.js';

// "tick" runs every regular job in turn, so hPanel needs a single cron line (every 5 minutes).
const name = process.argv[2];
if (!name || (name !== 'tick' && !jobs[name])) {
  console.error(`Usage: cron <job|tick>\nJobs: ${Object.keys(jobs).join(', ')}`);
  process.exit(1);
}

const names = name === 'tick' ? tickJobs : [name];
let failed = false;
for (const job of names) {
  const result = await runJob(db(), job, 'cli');
  console.log(JSON.stringify({ job, ...result }));
  if (result.status === 'FAILED') failed = true;
}
await disconnectDb();
process.exit(failed ? 1 : 0);
