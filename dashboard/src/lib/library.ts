import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/database";

export const LIBRARY_MEDIA_LIMIT = 4 * 1024 * 1024;

export type LibraryNode = {
  id: string;
  parent_id: string | null;
  kind: "folder" | "text" | "media";
  name: string;
  content: string | null;
  content_type: string | null;
  storage_file_id: string | null;
  thumbnail_content: string | null;
  thumbnail_file_id: string | null;
  thumbnail_message_id: number | null;
  storage_message_id: number | null;
  file_size: number;
  created_at: number;
  updated_at: number;
};

function mapNode(row: Record<string, unknown>): LibraryNode {
  return {
    id: String(row.id),
    parent_id: row.parent_id == null ? null : String(row.parent_id),
    kind: row.kind as LibraryNode["kind"],
    name: String(row.name),
    content: row.content == null ? null : String(row.content),
    content_type: row.content_type == null ? null : String(row.content_type),
    storage_file_id:
      row.storage_file_id == null ? null : String(row.storage_file_id),
    thumbnail_content:
      row.thumbnail_content == null ? null : String(row.thumbnail_content),
    thumbnail_file_id:
      row.thumbnail_file_id == null ? null : String(row.thumbnail_file_id),
    thumbnail_message_id:
      row.thumbnail_message_id == null ? null : Number(row.thumbnail_message_id),
    storage_message_id:
      row.storage_message_id == null ? null : Number(row.storage_message_id),
    file_size: Number(row.file_size ?? 0),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  };
}

async function ensureLibraryTable(): Promise<void> {
  await getDatabase().execute(`
    CREATE TABLE IF NOT EXISTS library_nodes (
      id TEXT PRIMARY KEY,
      owner_uid INTEGER NOT NULL,
      parent_id TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('folder', 'text', 'media')),
      name TEXT NOT NULL,
      content TEXT,
      content_type TEXT,
      storage_file_id TEXT,
      thumbnail_content TEXT,
      thumbnail_file_id TEXT,
      thumbnail_message_id INTEGER,
      storage_message_id INTEGER,
      file_size INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  const columns = await getDatabase().execute("PRAGMA table_info(library_nodes)");
  const existingColumns = new Set(
    columns.rows.map((row) => String(row.name ?? "")),
  );
  for (const [name, definition] of [
    ["storage_file_id", "TEXT"],
    ["thumbnail_content", "TEXT"],
    ["thumbnail_file_id", "TEXT"],
    ["thumbnail_message_id", "INTEGER"],
    ["storage_message_id", "INTEGER"],
  ] as const) {
    if (!existingColumns.has(name)) {
      await getDatabase().execute(
        `ALTER TABLE library_nodes ADD COLUMN ${name} ${definition}`,
      );
    }
  }
  await getDatabase().execute(
    "CREATE INDEX IF NOT EXISTS library_nodes_owner_parent ON library_nodes(owner_uid, parent_id)",
  );
  await getDatabase().execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS library_nodes_unique_location ON library_nodes(owner_uid, COALESCE(parent_id, ''), lower(name))",
  );
}

async function assertParentFolder(
  ownerUid: number,
  parentId: string | null,
): Promise<void> {
  if (parentId === null) return;
  const result = await getDatabase().execute({
    sql: "SELECT id FROM library_nodes WHERE id = ? AND owner_uid = ? AND kind = 'folder' LIMIT 1",
    args: [parentId, ownerUid],
  });
  if (result.rows.length === 0) throw new Error("PARENT_NOT_FOUND");
}

async function assertUniqueName(
  ownerUid: number,
  parentId: string | null,
  name: string,
  exceptId?: string,
): Promise<void> {
  const result = await getDatabase().execute({
    sql: `SELECT id FROM library_nodes
          WHERE owner_uid = ? AND parent_id IS NOT DISTINCT FROM ? AND lower(name) = lower(?) AND id != ?
          LIMIT 1`,
    args: [ownerUid, parentId, name, exceptId ?? ""],
  });
  if (result.rows.length > 0) throw new Error("NAME_EXISTS");
}

export async function validateLibraryDestination(
  ownerUid: number,
  parentId: string | null,
  name: string,
): Promise<void> {
  await ensureLibraryTable();
  await assertParentFolder(ownerUid, parentId);
  await assertUniqueName(ownerUid, parentId, name);
}

export async function listLibraryNodes(
  ownerUid: number,
  parentId: string | null,
): Promise<LibraryNode[]> {
  await ensureLibraryTable();
  if (parentId !== null) await assertParentFolder(ownerUid, parentId);
  const result = await getDatabase().execute({
    sql: `SELECT id, parent_id, kind, name, content_type, file_size, created_at, updated_at
          FROM library_nodes
          WHERE owner_uid = ? AND parent_id IS ?
          ORDER BY CASE kind WHEN 'folder' THEN 0 ELSE 1 END, lower(name)`,
    args: [ownerUid, parentId],
  });
  return result.rows.map((row) =>
    mapNode(row as unknown as Record<string, unknown>),
  );
}

export async function getLibraryNode(
  ownerUid: number,
  id: string,
): Promise<LibraryNode | null> {
  await ensureLibraryTable();
  const result = await getDatabase().execute({
    sql: "SELECT * FROM library_nodes WHERE id = ? AND owner_uid = ? LIMIT 1",
    args: [id, ownerUid],
  });
  const row = result.rows[0];
  return row
    ? mapNode(row as unknown as Record<string, unknown>)
    : null;
}

export async function createLibraryNode(input: {
  id?: string;
  ownerUid: number;
  parentId: string | null;
  kind: LibraryNode["kind"];
  name: string;
  content?: string | null;
  contentType?: string | null;
  storageFileId?: string | null;
  storageMessageId?: number | null;
  fileSize?: number;
}): Promise<LibraryNode> {
  await ensureLibraryTable();
  await assertParentFolder(input.ownerUid, input.parentId);
  await assertUniqueName(input.ownerUid, input.parentId, input.name);
  const id = input.id ?? randomUUID();
  const now = Date.now();
  await getDatabase().execute({
    sql: `INSERT INTO library_nodes
          (id, owner_uid, parent_id, kind, name, content, content_type,
           storage_file_id, storage_message_id, file_size, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.ownerUid,
      input.parentId,
      input.kind,
      input.name,
      input.content ?? null,
      input.contentType ?? null,
      input.storageFileId ?? null,
      input.storageMessageId ?? null,
      input.fileSize ?? 0,
      now,
      now,
    ],
  });
  const node = await getLibraryNode(input.ownerUid, id);
  if (!node) throw new Error("LIBRARY_CREATE_FAILED");
  return node;
}

export async function setLibraryThumbnailStorage(
  ownerUid: number,
  id: string,
  thumbnailFileId: string,
  thumbnailMessageId: number | null = null,
): Promise<boolean> {
  await ensureLibraryTable();
  const result = await getDatabase().execute({
    sql: `UPDATE library_nodes
          SET thumbnail_file_id = ?, thumbnail_message_id = ?, updated_at = ?
          WHERE id = ? AND owner_uid = ? AND kind = 'media'`,
    args: [thumbnailFileId, thumbnailMessageId, Date.now(), id, ownerUid],
  });
  return result.rowsAffected === 1;
}

export async function listLibraryStoragePaths(
  ownerUid: number,
): Promise<string[]> {
  await ensureLibraryTable();
  const result = await getDatabase().execute({
    sql: `SELECT storage_file_id, thumbnail_file_id FROM library_nodes
          WHERE owner_uid = ?
            AND (storage_file_id IS NOT NULL OR thumbnail_file_id IS NOT NULL)`,
    args: [ownerUid],
  });
  return Array.from(
    new Set(
      result.rows
        .flatMap((row) => [
          String(row.storage_file_id ?? ""),
          String(row.thumbnail_file_id ?? ""),
        ])
        .filter(Boolean),
    ),
  );
}

export async function updateLibraryNode(
  ownerUid: number,
  id: string,
  input: { name?: string; content?: string; parentId?: string | null },
): Promise<LibraryNode | null> {
  await ensureLibraryTable();
  const existing = await getLibraryNode(ownerUid, id);
  if (!existing) return null;
  if (existing.kind === "folder" && input.content !== undefined) {
    throw new Error("INVALID_CONTENT");
  }
  const name = input.name ?? existing.name;
  const parentId =
    input.parentId === undefined ? existing.parent_id : input.parentId;
  await assertParentFolder(ownerUid, parentId);
  if (existing.kind === "folder" && parentId !== existing.parent_id) {
    const result = await getDatabase().execute({
      sql: `WITH RECURSIVE descendants(id) AS (
              SELECT id FROM library_nodes WHERE id = ? AND owner_uid = ?
              UNION ALL
              SELECT child.id FROM library_nodes child
              JOIN descendants parent ON child.parent_id = parent.id
              WHERE child.owner_uid = ?
            )
            SELECT 1 FROM descendants WHERE id = ? LIMIT 1`,
      args: [id, ownerUid, ownerUid, parentId],
    });
    if (result.rows.length > 0) throw new Error("INVALID_MOVE");
  }
  await assertUniqueName(ownerUid, parentId, name, id);
  await getDatabase().execute({
    sql: `UPDATE library_nodes
          SET name = ?, parent_id = ?, content = ?, file_size = ?, updated_at = ?
          WHERE id = ? AND owner_uid = ?`,
    args: [
      name,
      parentId,
      input.content ?? existing.content,
      input.content === undefined ? existing.file_size : Buffer.byteLength(input.content),
      Date.now(),
      id,
      ownerUid,
    ],
  });
  return getLibraryNode(ownerUid, id);
}

export async function deleteLibraryNode(
  ownerUid: number,
  id: string,
): Promise<{
  deleted: boolean;
  storagePaths: string[];
}> {
  await ensureLibraryTable();
  const descendants = await getDatabase().execute({
    sql: `WITH RECURSIVE descendants(id) AS (
            SELECT id FROM library_nodes WHERE id = ? AND owner_uid = ?
            UNION ALL
            SELECT child.id FROM library_nodes child
            JOIN descendants parent ON child.parent_id = parent.id
            WHERE child.owner_uid = ?
          )
          SELECT node.storage_file_id, node.thumbnail_file_id
          FROM library_nodes node
          JOIN descendants ON descendants.id = node.id
          WHERE node.owner_uid = ?`,
    args: [id, ownerUid, ownerUid, ownerUid],
  });
  const result = await getDatabase().execute({
    sql: `WITH RECURSIVE descendants(id) AS (
            SELECT id FROM library_nodes WHERE id = ? AND owner_uid = ?
            UNION ALL
            SELECT child.id FROM library_nodes child
            JOIN descendants parent ON child.parent_id = parent.id
            WHERE child.owner_uid = ?
          )
          DELETE FROM library_nodes
          WHERE owner_uid = ? AND id IN (SELECT id FROM descendants)`,
    args: [id, ownerUid, ownerUid, ownerUid],
  });
  return {
    deleted: result.rowsAffected > 0,
    storagePaths: Array.from(
      new Set(
        descendants.rows
          .flatMap((row) => [
            String(row.storage_file_id ?? ""),
            String(row.thumbnail_file_id ?? ""),
          ])
          .filter(Boolean),
      ),
    ),
  };
}
