'use strict';

/**
 * Storage interface. Visit photos are stored behind this interface so the
 * backing store can change without touching call sites.
 *
 * Drivers:
 *   - local : disk (dev). Files served by express.static at /uploads.
 *   - mysql : photo bytes in a MySQL LONGBLOB table (no external store needed).
 *             Served by the app at /api/photos/:key.
 *   - azure : Azure Blob Storage (production). Durable + shared across instances.
 *
 * Every driver exposes the same shape:
 *   save(buffer, filename, subdir?) -> Promise<string relPath>   (the stored key)
 *   publicUrl(relPath)              -> string                     (absolute URL)
 *   absolutePath(relPath)           -> string|null               (local only)
 *   remove(relPath)                 -> Promise<boolean>           (delete; true if removed)
 *   isRemote                        -> boolean
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');

/** Local-disk driver. */
function createLocalStorage() {
  const root = path.resolve(config.storage.uploadDir);
  fs.mkdirSync(root, { recursive: true });

  return {
    isRemote: false,
    async save(buffer, filename, subdir = '') {
      const dir = path.join(root, subdir);
      fs.mkdirSync(dir, { recursive: true });
      const abs = path.join(dir, filename);
      await fs.promises.writeFile(abs, buffer);
      return path.posix.join('uploads', subdir.replace(/\\/g, '/'), filename).replace(/\/+/g, '/');
    },
    publicUrl(relPath) {
      return `${config.storage.publicBaseUrl.replace(/\/$/, '')}/${relPath.replace(/^\//, '')}`;
    },
    absolutePath(relPath) {
      const clean = relPath.replace(/^uploads[\\/]/, '');
      return path.join(root, clean);
    },
    async remove(relPath) {
      const clean = relPath.replace(/^uploads[\\/]/, '');
      const abs = path.join(root, clean);
      try {
        await fs.promises.unlink(abs);
        return true;
      } catch (err) {
        if (err.code === 'ENOENT') return false; // already gone
        throw err;
      }
    },
  };
}

/** Azure Blob Storage driver. */
function createAzureStorage() {
  // Lazy require so the dependency is only loaded when this driver is used.
  // eslint-disable-next-line global-require
  const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
  const a = config.storage.azure;

  let service;
  if (a.connectionString) {
    service = BlobServiceClient.fromConnectionString(a.connectionString);
  } else if (a.accountName && a.accountKey) {
    const cred = new StorageSharedKeyCredential(a.accountName, a.accountKey);
    service = new BlobServiceClient(`https://${a.accountName}.blob.core.windows.net`, cred);
  } else {
    throw new Error(
      'Azure storage selected but no credentials. Set AZURE_STORAGE_CONNECTION_STRING '
      + 'or AZURE_STORAGE_ACCOUNT + AZURE_STORAGE_KEY.',
    );
  }

  const container = service.getContainerClient(a.container);
  // Ensure the container exists (blob-level public read so photo URLs work).
  // Fire-and-forget at startup; failures surface on first upload.
  container.createIfNotExists({ access: 'blob' }).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[storage:azure] could not ensure container:', err.message);
  });

  return {
    isRemote: true,
    async save(buffer, filename, subdir = '') {
      const key = path.posix.join(subdir.replace(/\\/g, '/'), filename).replace(/^\/+/, '');
      const block = container.getBlockBlobClient(key);
      await block.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: 'image/jpeg' },
      });
      return key; // store the blob key as the relPath
    },
    publicUrl(relPath) {
      return container.getBlockBlobClient(relPath).url;
    },
    absolutePath() {
      return null; // not applicable for remote blobs
    },
    async remove(relPath) {
      const block = container.getBlockBlobClient(relPath);
      const res = await block.deleteIfExists();
      return res.succeeded === true;
    },
  };
}

/** MySQL LONGBLOB driver — stores photo bytes in the DB, served by the app. */
function createMysqlStorage() {
  // Lazy require to avoid a circular dependency at module load time.
  // eslint-disable-next-line global-require
  const db = require('../db/knex');

  return {
    isRemote: false,
    async save(buffer, filename, subdir = '') {
      const key = path.posix.join(subdir.replace(/\\/g, '/'), filename).replace(/^\/+/, '');
      await db('photo_blobs')
        .insert({
          key,
          content_type: 'image/jpeg',
          data: buffer,
          size_bytes: buffer.length,
        })
        .onConflict('key')
        .merge(); // overwrite if the same key is re-uploaded
      return key;
    },
    publicUrl(relPath) {
      // Served by the app's GET /api/photos/:key route.
      const base = config.storage.publicBaseUrl.replace(/\/$/, '');
      return `${base}/api/photos/${encodeURIComponent(relPath)}`;
    },
    absolutePath() {
      return null;
    },
    async remove(relPath) {
      const n = await db('photo_blobs').where({ key: relPath }).del();
      return n > 0;
    },
    // Used by the photo-serving route.
    async fetch(relPath) {
      const row = await db('photo_blobs').where({ key: relPath }).first();
      if (!row) return null;
      return { data: row.data, contentType: row.content_type };
    },
  };
}

function createStorage() {
  switch (config.storage.driver) {
    case 'local':
      return createLocalStorage();
    case 'mysql':
      return createMysqlStorage();
    case 'azure':
      return createAzureStorage();
    default:
      throw new Error(`Unknown STORAGE_DRIVER: ${config.storage.driver}`);
  }
}

module.exports = { storage: createStorage() };
