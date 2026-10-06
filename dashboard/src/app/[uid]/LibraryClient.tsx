"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Code2,
  File,
  FileText,
  Folder,
  FolderPlus,
  Grid2X2,
  HardDrive,
  Image as ImageIcon,
  List,
  LoaderCircle,
  MoveRight,
  Pencil,
  Plus,
  Play,
  Search,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import Image from "next/image";
import { useBackDismiss } from "@/lib/back-dismiss";

type LibraryNode = {
  id: string;
  parent_id: string | null;
  kind: "folder" | "text" | "media";
  name: string;
  content: string | null;
  content_type: string | null;
  thumbnail_content: string | null;
  storage_message_id: number | null;
  file_size: number;
  created_at: number;
  updated_at: number;
};

type EditorState = {
  id: string | null;
  name: string;
  content: string;
  kind: "text" | "folder";
};

export function LibraryClient({ uid, username }: { uid: string; username: string }) {
  const [nodes, setNodes] = useState<LibraryNode[]>([]);
  const [path, setPath] = useState<LibraryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [previewMedia, setPreviewMedia] = useState<LibraryNode | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [movingNode, setMovingNode] = useState<LibraryNode | null>(null);
  const [movePath, setMovePath] = useState<LibraryNode[]>([]);
  const [moveFolders, setMoveFolders] = useState<LibraryNode[]>([]);
  const [moveLoading, setMoveLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const parentId = path.at(-1)?.id ?? null;
  const moveParentId = movePath.at(-1)?.id ?? null;
  const basePath = `/home/${username}`;
  const editorLineCount = editor ? editor.content.split("\n").length : 1;
  const editorLanguage = editor ? languageFromFilename(editor.name) : "Text";

  useBackDismiss(Boolean(previewMedia), () => setPreviewMedia(null), "library-preview");
  useBackDismiss(Boolean(editor), () => setEditor(null), "library-editor");
  useBackDismiss(Boolean(movingNode), () => {
    setMovingNode(null);
    setMovePath([]);
    setMoveFolders([]);
  }, "library-move");

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
      const response = await fetch(`/api/library/${uid}${query}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Library could not be loaded.");
      setNodes(result.nodes as LibraryNode[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Library could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [parentId, uid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!movingNode) return;
    let cancelled = false;
    setMoveLoading(true);
    const query = moveParentId ? `?parentId=${encodeURIComponent(moveParentId)}` : "";
    fetch(`/api/library/${uid}${query}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Folders could not be loaded.");
        if (!cancelled) {
          setMoveFolders(
            (result.nodes as LibraryNode[]).filter(
              (node) => node.kind === "folder" && node.id !== movingNode.id,
            ),
          );
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Folders could not be loaded.");
        }
      })
      .finally(() => {
        if (!cancelled) setMoveLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [moveParentId, movingNode, uid]);

  const visibleNodes = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return term ? nodes.filter((node) => node.name.toLocaleLowerCase().includes(term)) : nodes;
  }, [nodes, search]);

  const createItem = (kind: "folder" | "text") => {
    setEditor({ id: null, kind, name: "", content: "" });
    setMessage("");
  };

  const openTextFile = async (node: LibraryNode) => {
    if (node.kind === "folder") {
      setPath((current) => [...current, node]);
      setSearch("");
      return;
    }
    if (node.kind === "media") {
      if (
        node.content_type?.startsWith("image/") ||
        node.content_type?.startsWith("video/")
      ) {
        setPreviewMedia(node);
      } else {
        window.location.assign(
          `/api/library/${uid}/${encodeURIComponent(node.id)}/download`,
        );
      }
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/library/${uid}/${encodeURIComponent(node.id)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "File could not be opened.");
      setEditor({
        id: node.id,
        kind: "text",
        name: result.node.name,
        content: result.node.content ?? "",
      });
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "File could not be opened.");
    } finally {
      setBusy(false);
    }
  };

  const saveEditor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) {
      setMessage("Nama file atau folder wajib diisi.");
      return;
    }
    setBusy(true);
    try {
      const url = editor.id
        ? `/api/library/${uid}/${encodeURIComponent(editor.id)}`
        : `/api/library/${uid}`;
      const response = await fetch(url, {
        method: editor.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editor.id
            ? { name, ...(editor.kind === "text" ? { content: editor.content } : {}) }
            : { parentId, kind: editor.kind, name, ...(editor.kind === "text" ? { content: editor.content } : {}) },
        ),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Changes could not be saved.");
      setEditor(null);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Changes could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const uploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setMessage("Ukuran media maksimal 4 MiB per file.");
      return;
    }
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setMessage("Pilih file gambar atau video.");
      return;
    }
    const nodeId = crypto.randomUUID();
    let thumbnail: Blob | null = null;
    setBusy(true);
    setUploadProgress(null);
    setMessage("");
    let uploadNotice = "";
    try {
      thumbnail = await createMediaThumbnail(file);
      setUploadProgress(0);
      const form = new FormData();
      form.append("nodeId", nodeId);
      form.append("parentId", parentId ?? "");
      form.append("name", file.name);
      form.append("file", file, file.name);
      const response = await fetch(`/api/library/${uid}/upload`, {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "File could not be uploaded.");
      }
      setUploadProgress(100);
      if (thumbnail) {
        const response = await fetch(
          `/api/library/${uid}/${encodeURIComponent(nodeId)}/thumbnail`,
          {
            method: "PUT",
            headers: { "Content-Type": "image/jpeg" },
            body: thumbnail,
          },
        );
        if (!response.ok) {
          uploadNotice = "File berhasil diunggah, tetapi thumbnail tidak tersimpan.";
        }
      } else {
        uploadNotice = "File berhasil diunggah, tetapi thumbnail tidak dapat dibuat.";
      }
      await refresh();
      if (uploadNotice) setMessage(uploadNotice);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "File could not be uploaded.");
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  };

  const renameNode = async (node: LibraryNode) => {
    const name = window.prompt("Enter a new name", node.name);
    if (name === null || name.trim() === node.name) return;
    try {
      const response = await fetch(`/api/library/${uid}/${encodeURIComponent(node.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Item could not be renamed.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Item could not be renamed.");
    }
  };

  const deleteNode = async (node: LibraryNode) => {
    const warning = node.kind === "folder"
      ? "Delete this folder and everything inside it?"
      : `Delete "${node.name}"?`;
    if (!window.confirm(warning)) return;
    try {
      const response = await fetch(`/api/library/${uid}/${encodeURIComponent(node.id)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Item could not be deleted.");
      await refresh();
      if (result.storageCleanupFailed > 0) {
        setMessage("Item dihapus, tetapi sebagian media belum dapat dibersihkan dari cloud storage.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Item could not be deleted.");
    }
  };

  const openMoveDialog = (node: LibraryNode) => {
    setMovingNode(node);
    setMovePath([]);
    setMoveFolders([]);
    setMessage("");
  };

  const moveItem = async () => {
    if (!movingNode || moveParentId === movingNode.parent_id) {
      setMovingNode(null);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        `/api/library/${uid}/${encodeURIComponent(movingNode.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId: moveParentId }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Item could not be moved.");
      setMovingNode(null);
      setMovePath([]);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Item could not be moved.");
    } finally {
      setBusy(false);
    }
  };

  const goToPath = (index: number) => {
    setPath((current) => current.slice(0, index));
    setSearch("");
  };

  return (
    <div className="relative mx-auto min-w-0 w-full max-w-[600px] overflow-x-clip px-3 pt-4 sm:px-4 sm:pt-6">
      <header className="mb-6 sm:mb-7">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-ink-mute shadow-sm backdrop-blur">
              <HardDrive size={13} className="text-[#7c70cc]" />
              Personal Library
            </div>
            <h1 className="mt-3 text-[28px] font-semibold tracking-[-.045em] text-ink sm:text-[32px]">Library</h1>
            <p className="mt-1 max-w-[520px] text-[12px] leading-relaxed text-ink-mute sm:text-[13px]">
              Simpan dan kelola folder, catatan, serta media dalam ruang penyimpanan akun ini.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-ink px-4 text-[12px] font-semibold text-white shadow-[0_5px_14px_rgba(0,0,0,.12)] transition hover:opacity-90 disabled:opacity-50"
          >
            <Upload size={15} /> <span className="hidden sm:inline">Upload</span>
          </button>
        </div>
        <input ref={fileInput} type="file" accept="image/*,video/*" className="hidden" onChange={uploadFile} />
      </header>

      <section className="min-w-0 overflow-hidden rounded-[26px] border border-white/80 bg-white/85 shadow-[0_18px_60px_rgba(25,28,45,.07)] backdrop-blur-xl">
        <div className="border-b border-[#e9e9ed] bg-white/70 px-4 py-4 sm:px-6 sm:py-5">
          <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-[.08em] text-ink-mute">Current location</p>
              <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1 text-[12px] font-medium text-ink sm:text-[13px]">
                <button type="button" onClick={() => goToPath(0)} className={`shrink-0 ${path.length ? "text-ink-mute hover:text-ink" : "text-ink"}`}>Home</button>
                {path.map((item, index) => (
                  <span key={item.id} className="flex min-w-0 items-center gap-1">
                    <ChevronRight size={14} className="shrink-0 text-ink-mute" />
                    <button type="button" onClick={() => goToPath(index + 1)} className={`max-w-[120px] truncate ${index === path.length - 1 ? "text-ink" : "text-ink-mute hover:text-ink"}`}>
                      {item.name}
                    </button>
                  </span>
                ))}
              </div>
              <p className="mt-1 truncate font-mono text-[10px] text-ink-mute sm:text-[10.5px]">{basePath}{path.length ? `/${path.map((item) => item.name).join("/")}` : ""}</p>
            </div>
            {path.length > 0 && (
              <button type="button" onClick={() => goToPath(path.length - 1)} aria-label="Go to parent folder" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink-soft shadow-sm hover:bg-[#f7f7f7]">
                <ArrowLeft size={16} />
              </button>
            )}
          </div>
          <div className="flex min-w-0 gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this folder" className="h-10 w-full rounded-full border border-[#e9e9ed] bg-[#f6f6f8] pl-9 pr-3 text-[12px] text-ink outline-none placeholder:text-ink-mute focus:border-[#c8c8c8] sm:text-[12.5px]" />
            </div>
            <div className="flex shrink-0 items-center rounded-full border border-[#e9e9ed] bg-[#f6f6f8] p-0.5" aria-label="Change view">
              <button type="button" onClick={() => setViewMode("list")} aria-label="List view" aria-pressed={viewMode === "list"} className={`flex h-8 w-8 items-center justify-center rounded-full transition ${viewMode === "list" ? "bg-white text-ink shadow-sm" : "text-ink-mute"}`}>
                <List size={15} />
              </button>
              <button type="button" onClick={() => setViewMode("grid")} aria-label="Grid view" aria-pressed={viewMode === "grid"} className={`flex h-8 w-8 items-center justify-center rounded-full transition ${viewMode === "grid" ? "bg-white text-ink shadow-sm" : "text-ink-mute"}`}>
                <Grid2X2 size={14} />
              </button>
            </div>
            <button type="button" onClick={() => createItem("folder")} aria-label="New folder" className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-[#e9e9ed] bg-white px-3 text-[12px] font-semibold text-ink-soft transition hover:bg-[#f7f7f7]">
              <FolderPlus size={15} /> <span className="hidden sm:inline">Folder</span>
            </button>
            <button type="button" onClick={() => createItem("text")} aria-label="New text file" className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-[#e9e9ed] bg-white px-3 text-[12px] font-semibold text-ink-soft transition hover:bg-[#f7f7f7]">
              <Plus size={15} /> <span className="hidden sm:inline">New file</span>
            </button>
          </div>
        </div>

        <div className="px-2 py-2 sm:px-3">
          {message && (
            <div role="status" className="mx-2 my-2 flex items-start justify-between gap-3 rounded-xl border border-[#f0d8d8] bg-[#fff8f8] px-3.5 py-3 text-[12px] leading-relaxed text-[#8c3b3b]">
              {message}
              <button type="button" onClick={() => setMessage("")} aria-label="Dismiss message"><X size={15} /></button>
            </div>
          )}
          {loading ? (
            <div className="flex min-h-[180px] items-center justify-center text-ink-mute"><LoaderCircle size={20} className="animate-spin" /></div>
          ) : visibleNodes.length === 0 ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center px-5 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5f5f5] text-ink-mute"><Folder size={22} strokeWidth={1.7} /></div>
              <p className="text-[13px] font-semibold text-ink">{search ? "No matching items" : "Folder is empty"}</p>
              <p className="mt-1 max-w-[270px] text-[11.5px] leading-relaxed text-ink-mute">
                {search ? "Coba kata kunci lain." : "Buat folder atau file baru untuk mulai menyimpan data."}
              </p>
            </div>
          ) : (
            <ul className={viewMode === "grid" ? "grid min-w-0 grid-cols-2 gap-2 p-2 sm:grid-cols-3 sm:gap-3 sm:p-3 lg:grid-cols-4" : "min-w-0 divide-y divide-[#f1f1f1]"}>
              {visibleNodes.map((node) => (
                <li key={node.id} className={viewMode === "grid" ? "group min-w-0 overflow-hidden rounded-2xl border border-[#ececf0] bg-white p-2.5 shadow-[0_2px_8px_rgba(20,24,40,.03)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(20,24,40,.08)] sm:p-3" : "group flex min-h-[64px] min-w-0 items-center gap-3 rounded-xl px-2.5 transition hover:bg-[#f8f8fa] sm:px-3"}>
                  <button type="button" onClick={() => void openTextFile(node)} className={viewMode === "grid" ? "block w-full min-w-0 text-left" : "flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left"}>
                    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden ${viewMode === "grid" ? "mb-2.5 aspect-[4/3] w-full rounded-xl" : "h-10 w-10 rounded-xl"} ${node.kind === "folder" ? "bg-[#f2f0ff] text-[#6956c7]" : node.kind === "media" ? "bg-[#eff6ff] text-[#4778bd]" : "bg-[#fff5e9] text-[#be8033]"}`}>
                      {node.kind === "media" && (
                        <Image
                          src={`/api/library/${uid}/${encodeURIComponent(node.id)}/thumbnail`}
                          alt=""
                          fill
                          sizes={viewMode === "grid" ? "(max-width: 640px) 45vw, 260px" : "40px"}
                          className="object-cover"
                          unoptimized
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      )}
                      {node.kind === "folder" ? <Folder size={viewMode === "grid" ? 28 : 18} /> : node.kind === "media" ? (
                        node.content_type?.startsWith("video/") ? <Video size={viewMode === "grid" ? 28 : 18} /> : <ImageIcon size={viewMode === "grid" ? 28 : 18} />
                      ) : <Code2 size={viewMode === "grid" ? 25 : 18} />}
                      {node.kind === "media" && node.content_type?.startsWith("video/") && (
                        <span className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur">
                          <Play size={11} fill="currentColor" />
                        </span>
                      )}
                    </span>
                    <span className={viewMode === "grid" ? "block min-w-0" : "min-w-0 flex-1"}>
                      <span className="block truncate text-[12px] font-medium text-ink sm:text-[13px]">{node.name}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-ink-mute sm:text-[10.5px]">
                        {node.kind === "folder" ? "Folder" : node.kind === "media" ? `${formatBytes(node.file_size)} · Media file` : "Text file"}
                      </span>
                    </span>
                    {viewMode === "list" && node.kind === "folder" && <ChevronRight size={16} className="shrink-0 text-ink-mute" />}
                  </button>
                  <div className={viewMode === "grid" ? "mt-2 flex shrink-0 items-center justify-end gap-1 border-t border-[#f0f0f2] pt-1.5" : "flex shrink-0 items-center gap-1"}>
                    <button type="button" onClick={() => openMoveDialog(node)} aria-label={`Move ${node.name}`} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-mute transition hover:bg-[#f1f1f4] hover:text-ink">
                      <MoveRight size={14} />
                    </button>
                    <button type="button" onClick={() => void renameNode(node)} aria-label={`Rename ${node.name}`} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-mute transition hover:bg-[#f1f1f4] hover:text-ink">
                      <Pencil size={14} />
                    </button>
                    <button type="button" onClick={() => void deleteNode(node)} aria-label={`Delete ${node.name}`} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-mute transition hover:bg-[#fff2f2] hover:text-[#bd4d4d]">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="flex items-center justify-between border-t border-[#e9e9ed] bg-white/65 px-4 py-3 text-[10px] text-ink-mute sm:px-6 sm:text-[10.5px]">
          <span>{nodes.length} {nodes.length === 1 ? "item" : "items"}</span>
          <span>Media up to 30 MiB</span>
        </footer>
      </section>

      {busy && (
        <div className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[min(340px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/10 bg-[#24242a]/95 px-4 py-3 text-[11px] font-medium text-white shadow-xl backdrop-blur-xl">
          <LoaderCircle size={15} className="shrink-0 animate-spin" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span>{uploadProgress === null ? "Processing" : "Uploading media"}</span>
              {uploadProgress !== null && <span className="tabular-nums">{uploadProgress}%</span>}
            </div>
            {uploadProgress !== null && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${uploadProgress}%` }} />
              </div>
            )}
          </div>
        </div>
      )}

      {editor && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/35 p-0 backdrop-blur-[3px] sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditor(null); }}>
          <form onSubmit={saveEditor} className="flex max-h-[min(94dvh,850px)] w-full max-w-[900px] flex-col overflow-hidden rounded-t-[26px] border border-white/70 bg-[#fafafc] shadow-2xl sm:rounded-[26px]">
            <div className="flex items-start justify-between gap-4 border-b border-[#e8e8ed] bg-white/90 px-5 py-4 backdrop-blur-xl sm:px-7">
              <div>
                <div className="flex items-center gap-2">
                  {editor.kind === "text" ? <Code2 size={17} className="text-[#7667c9]" /> : <FolderPlus size={17} className="text-[#7667c9]" />}
                  <h2 className="text-[16px] font-semibold tracking-[-.02em] text-ink">{editor.id ? "Edit file" : editor.kind === "folder" ? "New folder" : "New text file"}</h2>
                </div>
                <p className="mt-1 text-[11px] text-ink-mute">Konten hanya dapat diakses oleh pemilik akun.</p>
              </div>
              <button type="button" disabled={busy} onClick={() => setEditor(null)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-mute hover:bg-[#f5f5f5]"><X size={17} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-7 sm:py-5">
              <label className="mb-4 block text-[10px] font-semibold uppercase tracking-[.08em] text-ink-mute">
                File name
                <input autoFocus value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} maxLength={180} className="mt-1.5 h-11 w-full min-w-0 rounded-xl border border-[#e7e7ec] bg-white px-3.5 text-[13px] font-medium normal-case tracking-normal text-ink outline-none transition focus:border-[#b7b1dc] focus:ring-4 focus:ring-[#7667c9]/10" placeholder={editor.kind === "folder" ? "Folder name" : "example.ts"} />
              </label>
              {editor.kind === "text" && (
                <div className="overflow-hidden rounded-2xl border border-[#292930] bg-[#1f2026] shadow-[0_8px_28px_rgba(0,0,0,.12)]">
                  <div className="flex h-10 items-center justify-between border-b border-white/10 bg-[#292a31] px-3.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-[#ff6259]" />
                      <span className="h-2 w-2 rounded-full bg-[#ffbe2f]" />
                      <span className="h-2 w-2 rounded-full bg-[#29c840]" />
                      <span className="ml-2 max-w-[180px] truncate font-mono text-[10.5px] text-white/70">{editor.name || "untitled"}</span>
                    </div>
                    <span className="rounded-md bg-white/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-white/55">{editorLanguage}</span>
                  </div>
                  <div className="grid min-h-[280px] grid-cols-[38px_minmax(0,1fr)] sm:min-h-[400px]">
                    <div ref={gutterRef} aria-hidden="true" className="overflow-hidden border-r border-white/[.06] py-3 text-right font-mono text-[11px] leading-[22px] text-white/25">
                      {Array.from({ length: editorLineCount }, (_, index) => (
                        <div key={index} className="px-2">{index + 1}</div>
                      ))}
                    </div>
                    <textarea
                      ref={editorRef}
                      value={editor.content}
                      onChange={(event) => setEditor({ ...editor, content: event.target.value })}
                      onScroll={(event) => {
                        if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop;
                      }}
                      maxLength={1_000_000}
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                      className="min-h-[280px] w-full min-w-0 resize-y overflow-auto border-0 bg-transparent px-3 py-3 font-mono text-[12px] leading-[22px] text-[#e7e7eb] outline-none placeholder:text-white/25 focus:ring-0 sm:min-h-[400px] sm:text-[13px]"
                      placeholder="// Write your code or text…"
                    />
                  </div>
                </div>
              )}
              {editor.kind === "text" && (
                <div className="mt-2 flex items-center justify-between text-[10px] text-ink-mute">
                  <span>Plain text · UTF-8</span>
                  <span>{formatBytes(new TextEncoder().encode(editor.content).length)} / 1 MB</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#e8e8ed] bg-white/90 px-5 py-3.5 pb-[calc(.875rem+env(safe-area-inset-bottom))] backdrop-blur-xl sm:px-7 sm:pb-3.5">
              <button type="button" disabled={busy} onClick={() => setEditor(null)} className="h-10 rounded-full border border-[#e7e7ec] bg-white px-5 text-[12px] font-semibold text-ink-soft hover:bg-[#fafafa]">Cancel</button>
              <button type="submit" disabled={busy} className="flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-[12px] font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50">
                <Check size={14} /> Save
              </button>
            </div>
          </form>
        </div>
      )}

      {previewMedia && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 backdrop-blur-md sm:items-center sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewMedia(null);
          }}
        >
          <section className="flex max-h-[96dvh] w-full max-w-[1050px] flex-col overflow-hidden rounded-t-[26px] border border-white/20 bg-[#f7f7fa] shadow-2xl sm:max-h-[90dvh] sm:rounded-[26px]">
            <header className="flex min-w-0 items-center justify-between gap-3 border-b border-[#e7e7ec] bg-white/85 px-4 py-3.5 backdrop-blur-xl sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eeedf5] text-[#7667c9]">
                  {previewMedia.content_type?.startsWith("video/") ? <Video size={18} /> : <ImageIcon size={18} />}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-[13px] font-semibold text-ink">{previewMedia.name}</h2>
                  <p className="mt-0.5 text-[10px] text-ink-mute">{formatBytes(previewMedia.file_size)} · {previewMedia.content_type}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <a
                  href={`/api/library/${uid}/${encodeURIComponent(previewMedia.id)}/download`}
                  className="flex h-9 items-center gap-2 rounded-full bg-ink px-3.5 text-[11px] font-semibold text-white hover:opacity-90"
                >
                  <Upload size={14} className="rotate-180" />
                  <span className="hidden sm:inline">Download</span>
                </a>
                <button type="button" onClick={() => setPreviewMedia(null)} aria-label="Close preview" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eeeeF2] text-ink-soft hover:bg-[#e5e5eb]">
                  <X size={16} />
                </button>
              </div>
            </header>
            <div className="flex min-h-[240px] flex-1 items-center justify-center overflow-auto bg-[#1e1e22] p-2 sm:min-h-[420px] sm:p-5">
              {previewMedia.content_type?.startsWith("video/") ? (
                <video
                  key={previewMedia.id}
                  src={`/api/library/${uid}/${encodeURIComponent(previewMedia.id)}/content`}
                  controls
                  playsInline
                  preload="metadata"
                  className="max-h-[min(72dvh,760px)] w-full max-w-full rounded-xl object-contain"
                >
                  Browser ini tidak mendukung pemutaran video.
                </video>
              ) : (
                <Image
                  src={`/api/library/${uid}/${encodeURIComponent(previewMedia.id)}/content`}
                  alt={previewMedia.name}
                  width={1400}
                  height={1000}
                  unoptimized
                  className="h-auto max-h-[min(72dvh,760px)] w-auto max-w-full rounded-xl object-contain"
                />
              )}
            </div>
            <footer className="flex items-center justify-between gap-3 border-t border-[#e7e7ec] bg-white/85 px-4 py-3 text-[10px] text-ink-mute backdrop-blur-xl sm:px-6">
              <span className="min-w-0 truncate">Preview media · {basePath}{path.length ? `/${path.map((item) => item.name).join("/")}` : ""}/{previewMedia.name}</span>
              <span className="shrink-0">Private</span>
            </footer>
          </section>
        </div>
      )}

      {movingNode && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setMovingNode(null);
          }}
        >
          <section className="flex max-h-[min(78vh,620px)] w-full max-w-[480px] flex-col rounded-t-[24px] border border-line bg-white p-5 shadow-2xl sm:rounded-[24px] sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-[17px] font-semibold tracking-[-.02em] text-ink">Move item</h2>
                <p className="mt-1 truncate text-[11.5px] text-ink-mute">{movingNode.name}</p>
              </div>
              <button type="button" disabled={busy} onClick={() => setMovingNode(null)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-mute hover:bg-[#f5f5f5]"><X size={17} /></button>
            </div>
            <div className="mb-3 rounded-xl bg-[#f8f8f8] px-3 py-2.5">
              <p className="text-[10px] font-medium text-ink-mute">Destination</p>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1 text-[12px] font-medium text-ink">
                <button type="button" onClick={() => setMovePath([])} className="shrink-0 hover:text-ink-mute">Home</button>
                {movePath.map((folder, index) => (
                  <span key={folder.id} className="flex min-w-0 items-center gap-1">
                    <ChevronRight size={13} className="shrink-0 text-ink-mute" />
                    <button type="button" onClick={() => setMovePath((current) => current.slice(0, index + 1))} className="max-w-[120px] truncate hover:text-ink-mute">{folder.name}</button>
                  </span>
                ))}
              </div>
              <p className="mt-1 truncate font-mono text-[10px] text-ink-mute">{basePath}{movePath.length ? `/${movePath.map((folder) => folder.name).join("/")}` : ""}</p>
            </div>
            <div className="min-h-[120px] flex-1 overflow-y-auto rounded-xl border border-line">
              {moveLoading ? (
                <div className="flex h-28 items-center justify-center text-ink-mute"><LoaderCircle size={18} className="animate-spin" /></div>
              ) : moveFolders.length ? (
                <ul className="divide-y divide-[#f1f1f1]">
                  {moveFolders.map((folder) => (
                    <li key={folder.id}>
                      <button type="button" onClick={() => setMovePath((current) => [...current, folder])} className="flex h-11 w-full items-center gap-2.5 px-3 text-left hover:bg-[#fafafa]">
                        <Folder size={16} className="shrink-0 text-[#6956c7]" />
                        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">{folder.name}</span>
                        <ChevronRight size={15} className="text-ink-mute" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex h-28 items-center justify-center px-4 text-center text-[11px] text-ink-mute">
                  Folder ini tidak berisi subfolder.
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setMovingNode(null)} className="h-10 rounded-xl border border-line px-4 text-[12px] font-semibold text-ink-soft hover:bg-[#fafafa]">Cancel</button>
              <button type="button" disabled={busy || moveLoading || moveParentId === movingNode.parent_id} onClick={() => void moveItem()} className="flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                <MoveRight size={14} /> Move here
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function languageFromFilename(filename: string): string {
  const extension = filename.split(".").at(-1)?.toLowerCase();
  const labels: Record<string, string> = {
    c: "C",
    cc: "C++",
    cpp: "C++",
    css: "CSS",
    html: "HTML",
    js: "JavaScript",
    json: "JSON",
    jsx: "JSX",
    md: "Markdown",
    mjs: "JavaScript",
    py: "Python",
    sh: "Shell",
    sql: "SQL",
    svg: "SVG",
    ts: "TypeScript",
    tsx: "TSX",
    txt: "Text",
    yaml: "YAML",
    yml: "YAML",
  };
  return extension ? labels[extension] ?? "Text" : "Text";
}

async function createMediaThumbnail(file: File): Promise<Blob | null> {
  const sourceUrl = URL.createObjectURL(file);
  let video: HTMLVideoElement | null = null;
  try {
    let width: number;
    let height: number;
    let source: CanvasImageSource;
    if (file.type.startsWith("video/")) {
      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      const loaded = new Promise<void>((resolve, reject) => {
        video?.addEventListener("loadeddata", () => resolve(), { once: true });
        video?.addEventListener("error", () => reject(new Error("Video thumbnail could not be generated.")), { once: true });
      });
      video.src = sourceUrl;
      await loaded;
      width = video.videoWidth;
      height = video.videoHeight;
      source = video;
    } else {
      const image = new window.Image();
      image.src = sourceUrl;
      await image.decode();
      width = image.naturalWidth;
      height = image.naturalHeight;
      source = image;
    }
    if (!width || !height) return null;
    const maxDimension = 320;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const thumbnail = document.createElement("canvas");
    thumbnail.width = Math.max(1, Math.round(width * scale));
    thumbnail.height = Math.max(1, Math.round(height * scale));
    const context = thumbnail.getContext("2d");
    if (!context) return null;
    context.drawImage(source, 0, 0, thumbnail.width, thumbnail.height);
    let preview = await canvasToJpeg(thumbnail, 0.68);
    if (preview && preview.size > 110 * 1024) {
      thumbnail.width = Math.max(1, Math.round(thumbnail.width * 0.75));
      thumbnail.height = Math.max(1, Math.round(thumbnail.height * 0.75));
      const resizedContext = thumbnail.getContext("2d");
      if (!resizedContext) return null;
      resizedContext.drawImage(source, 0, 0, thumbnail.width, thumbnail.height);
      preview = await canvasToJpeg(thumbnail, 0.5);
    }
    return preview && preview.size <= 120 * 1024 ? preview : null;
  } catch {
    return null;
  } finally {
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    URL.revokeObjectURL(sourceUrl);
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}
