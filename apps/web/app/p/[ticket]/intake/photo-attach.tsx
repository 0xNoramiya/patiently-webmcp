'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export interface AttachmentItem {
  id: string;
  url: string;
  mime_type: string;
  caption: string | null;
  created_at: string | null;
  size_bytes: number;
}

const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

async function fetchList(ticketId: string): Promise<AttachmentItem[]> {
  const res = await fetch(`${API_BASE}/api/intake/${ticketId}/photos`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as AttachmentItem[];
}

async function upload(
  ticketId: string,
  file: File
): Promise<AttachmentItem> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE}/api/intake/${ticketId}/photos`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as AttachmentItem;
}

async function remove(ticketId: string, attachmentId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/intake/${ticketId}/photos/${attachmentId}`,
    { method: 'DELETE' }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`HTTP ${res.status}`);
  }
}

interface Props {
  ticketId: string;
  disabled?: boolean;
  onUpload?: (item: AttachmentItem) => void;
  onError?: (message: string) => void;
}

export function PhotoAttach({ ticketId, disabled, onUpload, onError }: Props) {
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await fetchList(ticketId);
      setItems(list);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Failed to load photos');
    }
  }, [ticketId, onError]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          onError?.(`${file.name} is too large (10 MB max). Try the camera instead of the gallery.`);
          continue;
        }
        const item = await upload(ticketId, file);
        setItems((cur) => [...cur, item]);
        onUpload?.(item);
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove(ticketId, id);
      setItems((cur) => cur.filter((i) => i.id !== id));
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Could not remove photo');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
        aria-label="Attach a photo"
        title="Attach a photo of a rash, injury, or pill bottle"
        className={cn(
          'shrink-0 rounded-full w-12 h-12 grid place-items-center transition-all border shadow-soft',
          busy
            ? 'bg-brand-600 border-brand-700 text-white'
            : 'bg-white border-ink-200 text-brand-700 hover:bg-brand-50'
        )}
      >
        {busy ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="animate-spin">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
            <path d="M12 3 a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="6" width="18" height="14" rx="2" />
            <circle cx="12" cy="13" r="3.5" />
            <path d="M8 6l1.5-2h5L16 6" />
          </svg>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {items.length > 0 && (
        <PhotoStrip items={items} onDelete={handleDelete} />
      )}
    </>
  );
}

function PhotoStrip({
  items,
  onDelete,
}: {
  items: AttachmentItem[];
  onDelete: (id: string) => void;
}) {
  return (
    <div className="absolute -top-24 left-3 right-3 pointer-events-none">
      <div className="bg-white/95 backdrop-blur border border-ink-100 rounded-2xl shadow-card p-2 pointer-events-auto">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wider text-ink-500 font-bold">
            Photos shared with your doctor ({items.length})
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto scroll-thin">
          {items.map((it) => (
            <div
              key={it.id}
              className="relative shrink-0 chip-pop"
            >
              <a
                href={`${API_BASE}${it.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-16 h-16 rounded-xl overflow-hidden border border-ink-200 bg-ink-50"
                aria-label="Open photo"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${API_BASE}${it.url}`}
                  alt={it.caption || 'Patient-uploaded photo'}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </a>
              <button
                type="button"
                onClick={() => onDelete(it.id)}
                aria-label="Remove photo"
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-alert-600 text-white text-[10px] leading-none grid place-items-center shadow"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
