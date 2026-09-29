"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Calendar,
  Check,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Layers,
  LogOut,
  Shield,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";

type Device = {
  deviceId: string;
  type: string | null;
  os: string | null;
  brand: string | null;
  model: string | null;
  browser: string | null;
  lastSeen: string;
  revoked: boolean;
};

type Tab = "general" | "security" | "data" | "about";

const DEVICE_ID_KEY = "cheya_device_id";
const DELETE_CONFIRMATION = "HAPUS AKUN";

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Belum diketahui";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function SettingsClient({
  uid,
  mediaTtlDays,
}: {
  uid: string;
  mediaTtlDays: number;
}) {
  const [tab, setTab] = useState<Tab>("general");
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [deviceError, setDeviceError] = useState("");
  const [cleared, setCleared] = useState(false);
  const [notice, setNotice] = useState("");
  const [revokingDevice, setRevokingDevice] = useState<Device | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [revokeError, setRevokeError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    setDeviceError("");
    try {
      const response = await fetch("/api/session/devices", { cache: "no-store" });
      const result = (await response.json()) as {
        ok?: boolean;
        currentDeviceId?: string | null;
        devices?: Device[];
      };
      if (!response.ok || !result.ok || !Array.isArray(result.devices)) {
        throw new Error(
          response.status === 401
            ? "Sesi berakhir. Silakan login kembali."
            : "Daftar perangkat tidak dapat dimuat.",
        );
      }
      setCurrentDeviceId(result.currentDeviceId ?? null);
      setDevices(result.devices);
    } catch (cause) {
      setDeviceError(
        cause instanceof Error
          ? cause.message
          : "Daftar perangkat tidak dapat dimuat.",
      );
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      setCurrentDeviceId(window.localStorage.getItem(DEVICE_ID_KEY));
    } catch (cause) {
      console.warn("[settings] could not read current device ID:", cause);
    }
  }, []);

  useEffect(() => {
    if (tab === "security") void loadDevices();
  }, [tab, loadDevices]);

  function clearCache() {
    try {
      localStorage.removeItem("cheya-media-view");
      setCleared(true);
      setNotice("");
      window.setTimeout(() => setCleared(false), 1800);
    } catch (cause) {
      console.error("[settings] local cache could not be cleared:", cause);
      setNotice("Cache lokal tidak dapat dibersihkan di browser ini.");
    }
  }

  async function revokeDevice() {
    if (!revokingDevice || revokeBusy) return;
    setRevokeBusy(true);
    setDeviceError("");
    setRevokeError("");
    try {
      const response = await fetch("/api/session/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: Number(uid),
          deviceId: revokingDevice.deviceId,
        }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        throw new Error(
          result.error === "unknown_device"
            ? "Perangkat tersebut sudah tidak terdaftar."
            : "Sesi perangkat tidak dapat dihentikan.",
        );
      }
      const current = revokingDevice.deviceId === currentDeviceId;
      setDevices((items) =>
        items.map((item) =>
          item.deviceId === revokingDevice.deviceId
            ? { ...item, revoked: true }
            : item,
        ),
      );
      setRevokingDevice(null);
      if (current) {
        try {
          window.localStorage.removeItem(DEVICE_ID_KEY);
        } catch (cause) {
          console.warn("[settings] could not clear revoked device ID:", cause);
        }
        window.location.replace("/blocked");
      }
    } catch (cause) {
      setRevokeError(
        cause instanceof Error
          ? cause.message
          : "Sesi perangkat tidak dapat dihentikan.",
      );
    } finally {
      setRevokeBusy(false);
    }
  }

  async function deleteAccount() {
    if (deleteText !== DELETE_CONFIRMATION || deleteBusy) return;
    setDeleteBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteText }),
        cache: "no-store",
      });
      const result = (await response.json()) as {
        ok?: boolean;
        storageCleanupFailed?: number;
      };
      if (!response.ok || !result.ok) {
        throw new Error(
          response.status === 401
            ? "Sesi perangkat tidak valid. Login kembali lalu coba lagi."
            : "Akun belum dapat dihapus. Silakan coba lagi.",
        );
      }
      try {
        window.localStorage.removeItem(DEVICE_ID_KEY);
      } catch (cause) {
        console.warn("[settings] could not clear deleted account device ID:", cause);
      }
      setDeleteOpen(false);
      setDeleteText("");
      setNotice(
        result.storageCleanupFailed
          ? `Akun sudah dihapus. ${result.storageCleanupFailed} file tidak berhasil dihapus dari penyimpanan Telegram.`
          : "Akun dan data web berhasil dihapus. Anda akan diarahkan ke halaman login.",
      );
      window.setTimeout(() => {
        window.location.replace("/login");
      }, 3500);
    } catch (cause) {
      setNotice(
        cause instanceof Error ? cause.message : "Akun belum dapat dihapus.",
      );
      setDeleteBusy(false);
    }
  }

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "general", label: "Umum", icon: <Globe size={16} /> },
    { id: "security", label: "Devices & Security", icon: <Shield size={16} /> },
    { id: "data", label: "Data", icon: <Database size={16} /> },
    { id: "about", label: "Tentang", icon: <Layers size={16} /> },
  ];

  return (
    <>
      <div className="mb-5 overflow-x-auto rounded-[22px] border border-white bg-[#f0f1f5] p-1.5 shadow-sm">
        <nav aria-label="Kategori pengaturan" className="flex min-w-max gap-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              id={`settings-tab-${item.id}`}
              type="button"
              aria-pressed={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-2 rounded-[17px] px-3.5 py-2.5 text-[12px] font-semibold transition-all ${
                tab === item.id
                  ? "bg-white text-ink shadow-[0_3px_10px_-7px_rgba(0,0,0,.4)]"
                  : "text-ink-mute hover:text-ink-soft"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {notice && !deleteOpen && (
        <p
          role="status"
          className="mb-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-800"
        >
          {notice}
        </p>
      )}

      {tab === "general" && (
        <div
          id="settings-panel-general"
          className="animate-fade-up space-y-5"
        >
          <SettingsSection title="Preferensi">
            <Row icon={<Globe size={17} />} title="Bahasa" value="Indonesia" />
            <Row icon={<Calendar size={17} />} title="Format tanggal" value="24 jam" last />
          </SettingsSection>
          <SettingsSection title="Akun">
            <Row
              icon={<Smartphone size={17} />}
              title="Telegram ID"
              value={uid}
              last
            />
          </SettingsSection>
        </div>
      )}

      {tab === "security" && (
        <div
          id="settings-panel-security"
          className="animate-fade-up space-y-5"
        >
          <div className="flex items-start justify-between gap-4 px-3">
            <div>
              <h2 className="text-[11.5px] font-semibold uppercase tracking-[.08em] text-ink-mute">
                Devices & Security
              </h2>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-mute">
                Sesi aktif tetap tercatat sampai Anda menghentikannya. Perangkat yang dicabut tidak dapat login kembali.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadDevices()}
              disabled={devicesLoading}
              className="shrink-0 rounded-full border border-line bg-white px-3 py-1.5 text-[11px] font-semibold text-ink-soft disabled:opacity-50"
            >
              {devicesLoading ? "Memuat…" : "Refresh"}
            </button>
          </div>
          {deviceError && (
            <p role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-[12px] text-danger">
              {deviceError}
            </p>
          )}
          <div className="space-y-2.5">
            {devices.map((device) => {
              const current = device.deviceId === currentDeviceId;
              const name = [device.brand, device.model]
                .filter((part, index, values) => part && values.indexOf(part) === index)
                .join(" ") || device.type || "Perangkat";
              return (
                <article
                  key={device.deviceId}
                  className="rounded-[22px] border border-line bg-white p-4 shadow-[0_8px_32px_-28px_rgba(15,23,42,.38)]"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] bg-[#f1f2f8] text-[#626b9d]">
                      <Smartphone size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="truncate text-[13px] font-semibold text-ink">{name}</h3>
                        {current && (
                          <span className="rounded-full bg-[#eef1ff] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#59649f]">
                            Perangkat ini
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-ink-mute">
                        {[device.os, device.browser].filter(Boolean).join(" · ") || "Detail perangkat tidak tersedia"}
                      </p>
                      <p className="mt-2 text-[10.5px] text-ink-mute">
                        Aktivitas terakhir · {formatDate(device.lastSeen)}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-ink-mute">
                        ID · {device.deviceId}
                      </p>
                    </div>
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${device.revoked ? "bg-[#c9cbd3]" : "bg-emerald-500"}`} title={device.revoked ? "Sesi dihentikan" : "Sesi valid"} />
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-[#f0f0f2] pt-3">
                    <span className={`text-[10px] font-medium ${device.revoked ? "text-ink-mute" : "text-emerald-700"}`}>
                      {device.revoked ? "Sesi dihentikan" : "Sesi valid"}
                    </span>
                    {!device.revoked && (
                      <button
                        type="button"
                        onClick={() => {
                          setRevokeError("");
                          setRevokingDevice(device);
                        }}
                        className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-danger transition-colors hover:bg-red-50"
                      >
                        Hentikan sesi
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
            {!devicesLoading && !deviceError && devices.length === 0 && (
              <div className="rounded-[22px] border border-line bg-white px-4 py-8 text-center text-[12px] text-ink-mute">
                Belum ada perangkat terdaftar.
              </div>
            )}
            {devicesLoading && devices.length === 0 && (
              <div role="status" className="rounded-[22px] border border-line bg-white px-4 py-8 text-center text-[12px] text-ink-mute">
                Memuat daftar perangkat…
              </div>
            )}
          </div>
          <SettingsSection title="Penghapusan akun">
            <div className="p-4">
              <p className="text-[13px] font-semibold text-ink">Hapus akun CheyaVerse</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-mute">
                Profil dan data milik Anda di web akan dihapus. Salinan pesan yang sudah ada di percakapan akun lain tetap tersedia bagi mereka.
              </p>
              <button
                type="button"
                onClick={() => {
                  setDeleteText("");
                  setDeleteOpen(true);
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-4 py-2.5 text-[12px] font-semibold text-danger transition-colors hover:bg-red-100"
              >
                <Trash2 size={15} />
                Hapus akun
              </button>
            </div>
          </SettingsSection>
        </div>
      )}

      {tab === "data" && (
        <div
          id="settings-panel-data"
          className="animate-fade-up space-y-5"
        >
          <SettingsSection title="Penyimpanan">
            <Row icon={<Database size={17} />} title="Masa simpan media" value={`${mediaTtlDays} hari`} />
            <Row icon={<HardDrive size={17} />} title="Penyimpanan media" value="Telegram" />
            <Row
              icon={<Trash2 size={17} />}
              title="Bersihkan cache lokal"
              subtitle="Hapus preferensi tampilan media di perangkat ini"
              action={
                <button
                  type="button"
                  onClick={clearCache}
                  className={`text-[12px] font-semibold transition-colors ${cleared ? "text-emerald-700" : "text-ink-soft hover:text-ink"}`}
                >
                  {cleared ? (
                    <span className="inline-flex items-center gap-1">
                      <Check size={13} strokeWidth={2.4} /> Selesai
                    </span>
                  ) : "Bersihkan"}
                </button>
              }
              last
            />
          </SettingsSection>
        </div>
      )}

      {tab === "about" && (
        <div
          id="settings-panel-about"
          className="animate-fade-up"
        >
          <SettingsSection title="Tentang aplikasi">
            <Row icon={<Layers size={17} />} title="Versi" value="v1.7.3-release" />
            <Row icon={<Cpu size={17} />} title="Runtime" value="Next.js 14" />
            <Row icon={<Database size={17} />} title="Backend" value="Turso · Telegram" last />
          </SettingsSection>
        </div>
      )}

      {revokingDevice && (
        <Dialog
          title="Hentikan sesi perangkat?"
          description={`Perangkat ${revokingDevice.brand ?? ""} ${revokingDevice.model ?? ""} akan kehilangan akses ke akun ini.`}
          confirmLabel={revokeBusy ? "Menghentikan…" : "Hentikan sesi"}
          busy={revokeBusy}
          error={revokeError}
          onCancel={() => setRevokingDevice(null)}
          onConfirm={() => void revokeDevice()}
        />
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/45 p-3 backdrop-blur-[3px] sm:items-center sm:p-5">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            className="w-full max-w-[420px] animate-fade-up rounded-[28px] border border-white/70 bg-white p-5 shadow-[0_24px_80px_-24px_rgba(0,0,0,.35)] sm:p-6"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[17px] bg-[#fff1f0] text-danger">
              <Trash2 size={21} />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="delete-account-title" className="text-[18px] font-bold tracking-tight text-ink">
                  Hapus akun secara permanen?
                </h2>
                <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
                  Profil, perangkat, notifikasi, media, dan data akun web akan dihapus. Pesan di percakapan akun lain tetap disimpan untuk mereka. Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
              <button
                type="button"
                aria-label="Tutup konfirmasi"
                disabled={deleteBusy}
                onClick={() => setDeleteOpen(false)}
                className="rounded-full p-1.5 text-ink-mute hover:bg-[#f4f4f5]"
              >
                <X size={17} />
              </button>
            </div>
            <label htmlFor="delete-account-confirmation" className="mt-5 block text-[11px] font-semibold text-ink-soft">
              Ketik <span className="font-mono text-danger">{DELETE_CONFIRMATION}</span> untuk mengonfirmasi
            </label>
            <input
              id="delete-account-confirmation"
              value={deleteText}
              onChange={(event) => setDeleteText(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-2 w-full rounded-2xl border border-line bg-[#fafafa] px-4 py-3 text-[13px] text-ink outline-none focus:border-danger"
            />
            {notice && (
              <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-[11px] text-danger">
                {notice}
              </p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteOpen(false)}
                className="rounded-2xl border border-line bg-white px-4 py-3 text-[12px] font-semibold text-ink-soft hover:bg-[#f8f8f8] disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleteBusy || deleteText !== DELETE_CONFIRMATION}
                onClick={() => void deleteAccount()}
                className="rounded-2xl bg-danger px-4 py-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {deleteBusy ? "Menghapus…" : "Hapus akun"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 px-3 text-[11.5px] font-semibold uppercase tracking-[.08em] text-ink-mute">
        {title}
      </h2>
      <div className="overflow-hidden rounded-[22px] border border-line bg-white shadow-[0_8px_32px_-28px_rgba(15,23,42,.38)]">
        {children}
      </div>
    </section>
  );
}

function Row({
  icon,
  title,
  subtitle,
  value,
  action,
  last,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  action?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`relative flex min-h-[56px] items-center gap-3.5 px-4 py-[14px] ${
        last
          ? ""
          : "before:absolute before:bottom-0 before:left-[46px] before:right-0 before:h-px before:bg-divider"
      }`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-ink-soft">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[14px] leading-tight tracking-[-.005em] text-ink">
          {title}
        </span>
        {subtitle && (
          <span className="truncate text-[11.5px] leading-tight text-ink-mute">
            {subtitle}
          </span>
        )}
      </span>
      {action ? (
        <span className="shrink-0">{action}</span>
      ) : value !== undefined ? (
        <span className="shrink-0 text-[12px] text-ink-soft">{value}</span>
      ) : null}
    </div>
  );
}

function Dialog({
  title,
  description,
  confirmLabel,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/45 p-3 backdrop-blur-[3px] sm:items-center sm:p-5">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="revoke-session-title"
        className="w-full max-w-[380px] animate-fade-up rounded-[28px] border border-white/70 bg-white p-5 shadow-[0_24px_80px_-24px_rgba(0,0,0,.35)] sm:p-6"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[17px] bg-[#fff1f0] text-danger">
          <LogOut size={21} />
        </div>
        <h2 id="revoke-session-title" className="text-[18px] font-bold tracking-tight text-ink">
          {title}
        </h2>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">{description}</p>
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-[11px] text-danger">
            {error}
          </p>
        )}
        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-2xl border border-line px-4 py-3 text-[12px] font-semibold text-ink-soft hover:bg-[#f8f8f8] disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-2xl bg-danger px-4 py-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
