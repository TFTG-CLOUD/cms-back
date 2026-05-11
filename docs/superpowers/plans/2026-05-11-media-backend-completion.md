# Media Backend Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the backend so it supports API-key-protected file uploads, chunked uploads, S3-compatible object storage, archive extraction, and real-time image transformation through query parameters.

**Architecture:** Introduce a storage abstraction with local and S3 drivers, move upload and processing flows onto that abstraction, and add a dedicated image delivery route that transforms originals on demand with caching. Preserve the existing queue-based media/archive processing model, but fix the broken upload/status/download paths and unify configuration around `.env`.

**Tech Stack:** Express, MongoDB/Mongoose, Bull/Redis, Sharp, FFmpeg, AWS SDK v3, Jest.

---

### Task 1: Add tests for env API key auth and image transform parameter parsing

**Files:**
- Create: `tests/auth-and-image-options.test.js`
- Create: `src/config/runtime.js`
- Create: `src/services/ImageVariantService.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run the targeted test and verify it fails**
- [ ] **Step 3: Implement runtime config parsing and image option normalization**
- [ ] **Step 4: Run the targeted test and verify it passes**

### Task 2: Add tests for chunk upload correctness and signed token validation

**Files:**
- Create: `tests/chunked-upload-manager.test.js`
- Modify: `src/services/ChunkedUploadManager.js`
- Modify: `src/routes/upload.js`
- Modify: `src/middleware/auth.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run the targeted test and verify it fails**
- [ ] **Step 3: Implement fixed chunk URL generation, index validation, and signed token verification**
- [ ] **Step 4: Run the targeted test and verify it passes**

### Task 3: Add tests for S3-compatible storage driver behavior

**Files:**
- Create: `tests/storage-service.test.js`
- Create: `src/services/storage/StorageService.js`
- Create: `src/services/storage/drivers/LocalStorageDriver.js`
- Create: `src/services/storage/drivers/S3StorageDriver.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run the targeted test and verify it fails**
- [ ] **Step 3: Implement local/S3 storage abstraction with env-driven selection**
- [ ] **Step 4: Run the targeted test and verify it passes**

### Task 4: Route upload, archive, and processed-file flows through the storage abstraction

**Files:**
- Modify: `src/routes/upload.js`
- Modify: `src/services/ChunkedUploadManager.js`
- Modify: `src/services/MediaProcessor.js`
- Modify: `src/services/ArchiveProcessor.js`
- Modify: `src/routes/processed.js`
- Modify: `src/models/File.js`
- Modify: `src/models/ProcessingJob.js`

- [ ] **Step 1: Write the failing integration-oriented test for storage metadata persistence**
- [ ] **Step 2: Run the targeted test and verify it fails**
- [ ] **Step 3: Implement storage-backed upload/download/result persistence**
- [ ] **Step 4: Run the targeted test and verify it passes**

### Task 5: Add the real-time image transformation delivery API and documentation

**Files:**
- Create: `tests/image-transform-route.test.js`
- Modify: `src/routes/processed.js`
- Modify: `README.md`
- Modify: `.env`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run the targeted test and verify it fails**
- [ ] **Step 3: Implement `?width=&height=&format=` delivery with aspect-ratio auto-fit and cache keys**
- [ ] **Step 4: Run the targeted test and verify it passes**
- [ ] **Step 5: Run the full test suite and update setup docs**
