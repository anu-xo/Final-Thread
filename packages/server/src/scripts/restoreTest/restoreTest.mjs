import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '..', '.env') });

const DUMP_DIR = resolve(__dirname, '.dump');
const SOURCE_URI = process.env.SOURCE_URI || process.env.MONGODB_URI;
const TARGET_URI = process.env.TARGET_URI || 'mongodb://admin:password123@localhost:27018/threadverse?authSource=admin';
const DB_NAME = 'threadverse';

const COMPARE_FIELDS = {
  posts: ['_id', 'title', 'body', 'author', 'community', 'type', 'score', 'commentCount', 'isRemoved', 'isDeleted', 'createdAt', 'updatedAt'],
  comments: ['_id', 'body', 'author', 'post', 'parent', 'depth', 'score', 'isRemoved', 'createdAt', 'updatedAt'],
  aimessages: ['_id', 'conversation', 'role', 'content', 'tokensUsed', 'rating', 'createdAt', 'updatedAt'],
};

const SAMPLE_SIZE = 5;

function run(cmd, opts = {}) {
  console.log(`\n  $ ${cmd}`);
  const start = Date.now();
  try {
    execSync(cmd, { stdio: 'inherit', ...opts });
  } catch (e) {
    console.error(`  FAILED (exit code ${e.status})`);
    process.exit(1);
  }
  return Date.now() - start;
}

function checkTool(name) {
  try {
    execSync(`where ${name}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function elapsed(ms) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

async function sourceClient() {
  const c = new MongoClient(SOURCE_URI);
  await c.connect();
  return c;
}

async function targetClient() {
  const c = new MongoClient(TARGET_URI);
  await c.connect();
  return c;
}

async function countDocs(db, coll) {
  try {
    return await db.collection(coll).estimatedDocumentCount();
  } catch {
    return -1;
  }
}

async function sampleDocs(db, coll, n) {
  return await db.collection(coll).aggregate([{ $sample: { size: n } }]).toArray();
}

function pickFields(doc, fields) {
  const picked = {};
  for (const f of fields) {
    const val = doc[f];
    picked[f] = val instanceof Date ? val.toISOString() : val;
  }
  return picked;
}

async function verifyCollection(name, sourceDb, targetDb) {
  const fields = COMPARE_FIELDS[name];
  console.log(`\n  ── ${name} ──`);

  const sourceCount = await countDocs(sourceDb, name);
  const targetCount = await countDocs(targetDb, name);
  console.log(`  Documents: ${sourceCount} (source) → ${targetCount} (target)`);

  if (sourceCount === 0) {
    console.log('  SKIP (empty collection)');
    return { ok: true, sourceCount: 0, targetCount: 0, mismatches: 0 };
  }

  if (targetCount === 0) {
    console.log('  FAIL (target empty)');
    return { ok: false, sourceCount, targetCount: 0, mismatches: -1 };
  }

  const sourceSamples = await sampleDocs(sourceDb, name, SAMPLE_SIZE);
  let mismatches = 0;

  for (const srcDoc of sourceSamples) {
    const targetDoc = await targetDb.collection(name).findOne({ _id: srcDoc._id });

    if (!targetDoc) {
      console.log(`  MISSING _id=${srcDoc._id}`);
      mismatches++;
      continue;
    }

    const srcPicked = pickFields(srcDoc, fields);
    const tgtPicked = pickFields(targetDoc, fields);
    const diffs = [];

    for (const f of fields) {
      const sv = String(srcPicked[f] ?? '');
      const tv = String(tgtPicked[f] ?? '');
      if (sv !== tv) {
        diffs.push(`    ${f}: "${sv}" → "${tv}"`);
      }
    }

    if (diffs.length) {
      console.log(`  FIELD MISMATCH _id=${srcDoc._id}:`);
      diffs.forEach((d) => console.log(d));
      mismatches++;
    }
  }

  const ok = mismatches === 0;
  console.log(`  Result: ${ok ? 'PASS' : `FAIL (${mismatches} mismatches)`}`);
  return { ok, sourceCount, targetCount, mismatches };
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  MongoDB Atlas Restore Test');
  console.log('═══════════════════════════════════════════\n');

  if (!SOURCE_URI) {
    console.error('ERROR: SOURCE_URI or MONGODB_URI must be set');
    process.exit(1);
  }

  const hasDump = checkTool('mongodump');
  const hasRestore = checkTool('mongorestore');
  console.log(`  mongodump:    ${hasDump ? '✓' : '✗ (install MongoDB Database Tools)'}`);
  console.log(`  mongorestore: ${hasRestore ? '✓' : '✗'}`);
  console.log(`  SOURCE:       ${SOURCE_URI.replace(/\/\/.*@/, '//<credentials>@')}`);
  console.log(`  TARGET:       ${TARGET_URI.replace(/\/\/.*@/, '//<credentials>@')}`);
  console.log(`  DB:           ${DB_NAME}\n`);

  let dumpMs = 0;
  let restoreMs = 0;

  if (hasDump && hasRestore) {
    if (existsSync(DUMP_DIR)) {
      rmSync(DUMP_DIR, { recursive: true });
    }
    mkdirSync(DUMP_DIR, { recursive: true });

    console.log('── Stage 1: mongodump from source ──');
    dumpMs = run(
      `mongodump --uri="${SOURCE_URI}" --db=${DB_NAME} --out="${DUMP_DIR}" --numParallelCollections=4`,
      { timeout: 600000 }
    );

    console.log(`\n── Stage 2: mongorestore to target ──`);
    restoreMs = run(
      `mongorestore --uri="${TARGET_URI}" --db=${DB_NAME} --dir="${DUMP_DIR}/${DB_NAME}" --drop --numParallelCollections=4`,
      { timeout: 600000 }
    );
  } else {
    console.log('── Stage 1+2: SKIP (mongodump/mongorestore not found) ──');
    console.log('  Assuming target DB is already populated.\n');
  }

  console.log('── Stage 3: Data integrity verification ──');

  let source, target;
  try {
    const srcConn = await sourceClient();
    source = srcConn.db(DB_NAME);
    const tgtConn = await targetClient();
    target = tgtConn.db(DB_NAME);

    const verifyMs = Date.now();

    const results = {
      posts: await verifyCollection('posts', source, target),
      comments: await verifyCollection('comments', source, target),
      aimessages: await verifyCollection('aimessages', source, target),
    };

    const verifyDuration = Date.now() - verifyMs;
    const allOk = Object.values(results).every((r) => r.ok);
    const totalRtoMs = dumpMs + restoreMs;
    const totalTimeMs = dumpMs + restoreMs + verifyDuration;

    console.log('\n═══════════════════════════════════════════');
    console.log('  RESTORE TEST RESULTS');
    console.log('═══════════════════════════════════════════');
    console.log(`  Dump time:              ${elapsed(dumpMs)}`);
    console.log(`  Restore time:           ${elapsed(restoreMs)}`);
    console.log(`  Verification time:      ${elapsed(verifyDuration)}`);
    console.log(`  ─────────────────────────────────────`);
    console.log(`  Total RTO (dump+restore): ${elapsed(totalRtoMs)}`);
    console.log(`  Total elapsed:           ${elapsed(totalTimeMs)}`);
    console.log(`  Data integrity:         ${allOk ? '✓ PASS' : '✗ FAIL'}`);

    for (const [coll, r] of Object.entries(results)) {
      const status = r.ok ? '✓' : '✗';
      console.log(`    ${status} ${coll}: ${r.sourceCount} → ${r.targetCount} docs, ${r.mismatches} mismatches`);
    }
    console.log('');

    await srcConn.close();
    await tgtConn.close();
  } catch (err) {
    console.error(`\nERROR during verification: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
