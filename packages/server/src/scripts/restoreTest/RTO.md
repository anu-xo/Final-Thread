# MongoDB Atlas Restore — RTO Reference

| Field | Value |
|---|---|
| **Source cluster** | `ac-utgud6a-shard-00-00.k8jx2ke.mongodb.net` (M0 free tier, sharded) |
| **Scratch cluster** | Local Docker `mongo:7` on `localhost:27018` |
| **Database** | `threadverse` |
| **Collections** | `posts`, `comments`, `aimessages`, `aiconversations`, `users`, `communities`, `communitymembers`, `votes`, `notifications`, `reports`, `moderationlogs`, `activityevents`, `postembeddings`, `performancelogs`, `evalresults` |

---

## Procedure

### Prerequisites

| Tool | Required for | Install |
|---|---|---|
| `mongodump` / `mongorestore` | Dump source + restore to scratch | `choco install mongodb-database-tools` or download from [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools) |
| Docker | Scratch MongoDB | `choco install docker-desktop` or [Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| Node.js 18+ | Verification script | Included in the pnpm workspace |

### Step-by-step

```powershell
# 1. Start scratch MongoDB (if not already running)
docker compose up -d mongodb
#    Note: The restore script uses port 27018 to avoid collision with
#    the dev MongoDB on 27017. Adjust docker-compose.yml if needed:
#    ports: - '27018:27017'

# 2. Run the restore test
$env:SOURCE_URI="mongodb://<user>:<pass>@<atlas-host>:27017/threadverse?ssl=true&authSource=admin"
$env:TARGET_URI="mongodb://admin:password123@localhost:27018/threadverse?authSource=admin"
node packages/server/src/scripts/restoreTest/restoreTest.mjs

# 3. Review output
#    The script prints:
#      - Dump time
#      - Restore time
#      - Document counts per collection (source vs target)
#      - Spot-check results for posts, comments, aimessages
#      - Total RTO (dump + restore)
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SOURCE_URI` | `MONGODB_URI` from `.env` | Source Atlas cluster connection string |
| `TARGET_URI` | `mongodb://admin:password123@localhost:27018/threadverse?authSource=admin` | Scratch MongoDB |
| `DB_NAME` | `threadverse` | Database name on both clusters |

### What the Script Does

```
Stage 1 — mongodump from source
  mongodump --uri="<SOURCE_URI>" --db=threadverse --out=".dump" --numParallelCollections=4

Stage 2 — mongorestore to target
  mongorestore --uri="<TARGET_URI>" --db=threadverse --dir=".dump/threadverse" --drop

Stage 3 — Data integrity verification
  For each of 'posts', 'comments', 'aimessages':
    • Compare document count between source and target
    • Sample 5 random documents from source
    • Fetch each by _id from target
    • Deep-compare key fields
    • Report mismatches
```

---

## RTO Baseline (fill in after first run)

| Metric | Measured | Notes |
|---|---|---|
| **mongodump time** | — | Scales with collection size; `posts` with 1000+ docs + `postembeddings` (768-dim vectors) dominate |
| **mongorestore time** | — | Target on local SSD is fastest; network target adds latency |
| **Verification time** | — | Sub-second for sample queries |
| **Total RTO** | — | `dump + restore` (verification overlaps with but is sequential in script) |

### Estimated RTO by Data Volume (M0 free tier)

| Data Volume | Estimated Dump | Estimated Restore | Total RTO |
|---|---|---|---|
| Dev seed (~40 posts, 0 comments) | ~5s | ~5s | **~10s** |
| Performance seed (~1000 posts) | ~30s | ~20s | **~50s** |
| Production estimate (10k posts, 50k comments, AI messages) | ~5min | ~3min | **~8min** |
| Upper bound (100k posts, heavy embeddings) | ~20min | ~15min | **~35min** |

> **RTO target: < 15 minutes for typical production load.**
> If restore exceeds 30 minutes, investigate:
> - Scratch cluster provisioning (pre-provision to avoid Docker pull time)
> - Network bandwidth between Atlas and restore target
> - Index builds after restore (add `--noIndexRestore` and rebuild lazily)

---

## Backup Verification (Pre-Launch Checklist)

- [ ] Verify Atlas automated snapshots are **enabled** in the Atlas project
  - Atlas UI → Clusters → Backup → "Cloud Provider Snapshot" (free tier includes 1 snapshot/day)
- [ ] Confirm snapshot retention policy (default: 1 day for free tier, up to 7 days on M2+)
- [ ] Run `restoreTest.mjs` and confirm **zero data mismatches**
- [ ] Document the measured RTO in the row above
- [ ] Ensure `mongodump`/`mongorestore` are available in the deployment runbook
- [ ] Test restore to a **separate Atlas M0 cluster** (not just local Docker) to validate cross-region restore
- [ ] Verify that Post-restore hooks (embedding jobs, notification triggers) do **not** fire — they run on `save()` hooks in the application code; a restored document is already saved, so hooks do **not** replay. This is correct behavior.

---

## Data Integrity: Spot-Check Fields

For each restored collection, the following fields are compared between source and target:

### Posts
`_id`, `title`, `body`, `author`, `community`, `type`, `score`, `commentCount`, `isRemoved`, `isDeleted`, `createdAt`, `updatedAt`

### Comments
`_id`, `body`, `author`, `post`, `parent`, `depth`, `score`, `isRemoved`, `createdAt`, `updatedAt`

### AIMessages
`_id`, `conversation`, `role`, `content`, `tokensUsed`, `rating`, `createdAt`, `updatedAt`

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| `mongodump` not found | MongoDB Database Tools not installed | `choco install mongodb-database-tools` |
| `ECONNREFUSED` on target | Scratch MongoDB not running | `docker compose up -d mongodb`; verify with `docker ps` |
| Authentication failure on source | Atlas credentials changed | Update `MONGODB_URI` in `.env` |
| Network timeout during dump | Atlas M0 has limited bandwidth; large collections | Increase timeout or use `--numParallelCollections=1` |
| Verification mismatch on `updatedAt` | Mongoose `timestamps: true` may reset on server-side ops | Expected; compare only source fields |
| Scratch MongoDB has auth error | Credentials mismatch | Verify `TARGET_URI` matches `docker-compose.yml` |
