> Historical checkpoint notes. For the current setup and behavior, see the root README. Database snapshots are private local artifacts excluded from Git; this checkpoint description is not a current production-readiness or model-accuracy claim.

# 📦 Contexa Full Production Checkpoint & Restore Guide

**Checkpoint Date:** August 28, 2026  
**Git Tag:** `v1.0.0-stable-backup`  
**Git Branch:** `backup/stable-checkpoint`  
**Archive:** `backups/contexa_backup_2026-08-28.tar.gz`

---

## 🌟 Included Features in this Checkpoint:
1. **🤖 Official Telegram Bot Gateway (`@contexa_app_bot`)**:
   - Long polling daemon with `/link <6-DIGIT-CODE>`, `/unlink`, and `/start`.
   - Live stream of team groups (e.g. `Test Contexa`) & private chat filtering.
2. **🎮 Discord Bot Gateway (`@Contexa#2421`)**:
   - Real-time WebSocket listener with `!link <6-DIGIT-CODE>`, `!unlink`, and semantic message extraction.
3. **⚡ Netflix-Style Instant 6-Digit PIN Pairing**:
   - Animated PIN boxes, live polling radar, 1-click clipboard copy, and zero manual token entry.
4. **🧠 PyTorch ContexaNet AI Correlation Engine**:
   - 128-dimensional multi-modal deep learning embeddings (`ml/server.py`).
   - Hard topic-shift boundary guard (-30 penalty for false matches) & Szymkiewicz–Simpson overlap coefficient.
5. **💎 Modern UI Redesign**:
   - Left-hand persistent navigation sidebar.
   - Force-directed interactive D3 context graph.
   - Glassmorphism LLM Prompt Generator & Restore Plan modal.
   - Multi-source timeline filtering (`Chrome | VS Code | Discord | Telegram | GitHub`).
6. **🛡️ Internal Self-Tracking Filter**:
   - Hard exclusion of `localhost`, `127.0.0.1`, and Contexa app tabs from being recorded into your timeline.

---

## 🔄 How to Restore to this Checkpoint Anytime:

### 1. Restore Code via Git:
```bash
git checkout v1.0.0-stable-backup
```
*Or switch to the backup branch:*
```bash
git checkout backup/stable-checkpoint
```

### 2. Restore Database Snapshot:
```bash
node backups/restore_db.js
```

### 3. Restore from Standalone Archive (If starting on a clean computer):
```bash
tar -xzf backups/contexa_backup_2026-08-28.tar.gz -C /path/to/destination
cd /path/to/destination
npm install
node backups/restore_db.js
npm run build
npm start
```
