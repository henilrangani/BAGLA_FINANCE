# Reclaiming C: space from Docker: steps for the founder

**The situation (2026-11-06):**
- C: has about 2 GB free.
- Docker's disk file is about 6.2 GB, at `C:\Users\henil\AppData\Local\Docker\wsl\disk\docker_data.vhdx`.
- About 2.4 GB inside it was freed tonight (build cache), but Windows doesn't get that space back until the file is compacted or moved.

## What's inside the disk (must survive)
| Volume | What it is |
|---|---|
| `bagla_finance_python_ready_bagla_pgdata` | legacy database (protected) |
| `f6ff40d4…` | legacy Redis (protected) |
| `bagla_rc_pgdata` | release-stack database (68 users, 90 entries) |
| `8a785421…` | `bagla-pg-test` (contents unverified; keep) |

## Before you start
1. Make sure the verified backups exist in `D:\BAGLA_FINANCE_WORKSPACE\backups\` (legacy dumps with `.sha256` files).
2. Optional, recommended: back up the release DB:
   ```
   powershell -ExecutionPolicy Bypass -File scripts\windows\backup.ps1
   ```
   This writes to `main-app\backups\` on D:.
3. Close anything using Docker.

## Option A (recommended): move Docker's disk to D:
1. Docker Desktop → **Settings → Resources → Advanced → Disk image location**.
2. Choose a folder on D:, for example `D:\DockerData`. Click **Apply & restart**.
3. Docker moves the disk, with all images, containers and volumes, and restarts. Wait for "Docker Desktop is running".
4. Check that all four volumes are still listed:
   ```
   docker volume ls
   ```
   Then start the stack again:
   ```
   powershell -ExecutionPolicy Bypass -File scripts\windows\start.ps1
   ```

**Effect:** about 6 GB comes back to C:, and future builds use D:.

## Option B: compact in place
Docker Desktop versions differ. If **Settings → Resources → Advanced** has a "Reclaim"/"Compact" disk option, use it. Otherwise:
1. Quit Docker Desktop.
2. In PowerShell, run `wsl --shutdown`.
3. In an **admin** PowerShell, run `diskpart`, then:
   ```
   select vdisk file="C:\Users\henil\AppData\Local\Docker\wsl\disk\docker_data.vhdx"
   attach vdisk readonly
   compact vdisk
   detach vdisk
   exit
   ```
4. Start Docker Desktop. Check `docker volume ls` and `docker ps -a`.

## Never use
- **Troubleshoot → Clean / Purge data**, or **Reset to factory defaults**: both delete every volume, including the legacy and release databases.
- `docker system prune --volumes` or `docker volume prune`.
- Moving or copying the `.vhdx` file by hand.
