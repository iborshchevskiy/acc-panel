"use client";

import { useState, useRef, useTransition, useCallback } from "react";
import { updateClientKyc, uploadClientDocument, deleteClientDocument, getDocumentSignedUrl } from "../actions";

export interface KycDoc {
  id: string;
  docType: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  uploadedAt: string;
}

interface KycData {
  dateOfBirth: string | null;
  sex: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  sourceOfFunds: string | null;
  sourceOfWealth: string | null;
}

interface Props {
  clientId: string;
  initial: KycData;
  documents: KycDoc[];
}

const MAX_FILE_MB = 10;
const MAX_DOCS_PER_SECTION = 15;

const COMPLIANCE_DOC_TYPES = [
  { key: "proof_of_address", label: "Proof of Address", icon: "🏠" },
  { key: "source_of_funds",  label: "Source of Funds",  icon: "💰" },
  { key: "source_of_wealth", label: "Source of Wealth", icon: "📊" },
] as const;

const LEGAL_DOC_TYPES = [
  { key: "legal_passport",          label: "Passport",           icon: "🛂" },
  { key: "legal_id_card",           label: "National ID",        icon: "🪪" },
  { key: "legal_drivers_license",   label: "Driver's License",   icon: "🚗" },
  { key: "legal_residence_permit",  label: "Residence Permit",   icon: "🏛️" },
  { key: "legal_other",             label: "Other",              icon: "📄" },
] as const;

function fmtBytes(b: number | null): string {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

// ── Shared file icon ──────────────────────────────────────────────────────────

function FileIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ color: "var(--text-4)", flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ── Drop zone for one document type ──────────────────────────────────────────

function DocDropZone({
  clientId,
  docType,
  label,
  icon,
  docs,
}: {
  clientId: string;
  docType: string;
  label: string;
  icon: string;
  docs: KycDoc[];
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const zoneDocs = docs.filter((d) => d.docType === docType);
  const atLimit = zoneDocs.length >= MAX_DOCS_PER_SECTION;
  const busy = uploading || isPending;

  const upload = useCallback(async (file: File) => {
    setError(null);
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`Max ${MAX_FILE_MB} MB per file`);
      return;
    }
    if (zoneDocs.length >= MAX_DOCS_PER_SECTION) {
      setError(`Max ${MAX_DOCS_PER_SECTION} documents per section`);
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const result = await uploadClientDocument(clientId, docType, fd);
    setUploading(false);
    if (result.error) setError(result.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, docType, zoneDocs.length]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = "";
  }

  function handleDelete(docId: string) {
    startTransition(() => deleteClientDocument(docId, clientId));
  }

  async function handleDownload(docId: string) {
    const url = await getDocumentSignedUrl(docId);
    if (url) window.open(url, "_blank");
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Label row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs">{icon}</span>
          <span className="text-xs font-medium" style={{ color: "var(--text-2)" }}>{label}</span>
        </div>
        {zoneDocs.length > 0 && (
          <span className="text-[9px] font-mono tabular-nums" style={{ color: atLimit ? "var(--amber)" : "var(--text-4)" }}>
            {zoneDocs.length}/{MAX_DOCS_PER_SECTION}
          </span>
        )}
      </div>

      {/* Drop zone — hidden when at limit */}
      {!atLimit && (
        <div
          onClick={() => !busy && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className="flex flex-col items-center justify-center gap-1.5 rounded-lg transition-all"
          style={{
            height: 64,
            border: `1.5px dashed ${dragging ? "var(--accent)" : "var(--inner-border)"}`,
            backgroundColor: dragging ? "rgba(16,185,129,0.05)" : "var(--raised)",
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          <input ref={inputRef} type="file" className="hidden" onChange={onInputChange} />
          {busy ? (
            <span className="text-[10px]" style={{ color: "var(--text-4)" }}>Uploading…</span>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: "var(--text-4)" }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[9px]" style={{ color: "var(--text-4)" }}>
                Drop or click · max {MAX_FILE_MB} MB
              </span>
            </>
          )}
        </div>
      )}

      {atLimit && (
        <div className="flex items-center justify-center rounded-lg h-10"
          style={{ border: "1px dashed var(--inner-border)", backgroundColor: "var(--raised)" }}>
          <span className="text-[10px]" style={{ color: "var(--amber)" }}>
            Limit reached ({MAX_DOCS_PER_SECTION})
          </span>
        </div>
      )}

      {error && (
        <p className="text-[10px]" style={{ color: "var(--red)" }}>{error}</p>
      )}

      {/* Document list */}
      {zoneDocs.length > 0 && (
        <div className="flex flex-col gap-1">
          {zoneDocs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-2 rounded-md px-2.5 py-1.5"
              style={{ backgroundColor: "var(--raised)", border: "1px solid var(--inner-border)" }}>
              <FileIcon />
              <span className="text-[11px] font-mono flex-1 truncate min-w-0" style={{ color: "var(--text-2)" }}
                title={doc.fileName}>
                {doc.fileName}
              </span>
              {doc.fileSize && (
                <span className="text-[9px] shrink-0" style={{ color: "var(--text-4)" }}>
                  {fmtBytes(doc.fileSize)}
                </span>
              )}
              <button type="button" onClick={() => handleDownload(doc.id)}
                className="text-[11px] font-medium transition-opacity hover:opacity-70 shrink-0"
                style={{ color: "var(--accent)" }} title="Download">↓</button>
              <button type="button" onClick={() => handleDelete(doc.id)}
                className="text-[11px] transition-opacity hover:opacity-70 shrink-0"
                style={{ color: "var(--text-4)" }} title="Delete">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Document section block ────────────────────────────────────────────────────

function DocSection({
  title,
  subtitle,
  types,
  clientId,
  documents,
}: {
  title: string;
  subtitle: string;
  types: readonly { key: string; label: string; icon: string }[];
  clientId: string;
  documents: KycDoc[];
}) {
  const total = documents.filter((d) => types.some((t) => t.key === d.docType)).length;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--inner-border)" }}>
      <div className="px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: "var(--raised-hi)", borderBottom: "1px solid var(--inner-border)" }}>
        <div>
          <h3 className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{title}</h3>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-4)" }}>{subtitle}</p>
        </div>
        {total > 0 && (
          <span className="text-xs font-mono" style={{ color: "var(--text-4)" }}>{total} file{total !== 1 ? "s" : ""}</span>
        )}
      </div>
      <div className="p-4 grid gap-4" style={{
        backgroundColor: "var(--surface)",
        gridTemplateColumns: `repeat(${Math.min(types.length, 3)}, 1fr)`,
      }}>
        {types.map(({ key, label, icon }) => (
          <DocDropZone
            key={key}
            clientId={clientId}
            docType={key}
            label={label}
            icon={icon}
            docs={documents}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main KYC section ──────────────────────────────────────────────────────────

export default function KycSection({ clientId, initial, documents }: Props) {
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await updateClientKyc(clientId, fd);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  const fieldCls = "h-8 rounded-md px-3 text-sm outline-none focus:ring-1 focus:ring-emerald-500 w-full";
  const fieldStyle = { backgroundColor: "color-mix(in srgb, var(--text-1) 5%, transparent)", border: "1px solid var(--inner-border)", color: "var(--text-1)" };
  const labelCls = "text-[10px] uppercase tracking-wider font-medium";

  return (
    <div className="flex flex-col gap-4">
      {/* Personal details card */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--inner-border)" }}>
        <div className="px-4 py-3" style={{ backgroundColor: "var(--raised-hi)", borderBottom: "1px solid var(--inner-border)" }}>
          <h2 className="text-sm font-medium" style={{ color: "var(--text-1)" }}>KYC / Compliance</h2>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-4)" }}>
            Personal details and supporting documents
          </p>
        </div>

        <div className="p-4" style={{ backgroundColor: "var(--surface)" }}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="flex flex-col gap-1">
                <label className={labelCls} style={{ color: "var(--text-3)" }}>Date of birth</label>
                <input name="date_of_birth" type="date" defaultValue={initial.dateOfBirth ?? ""}
                  className={fieldCls} style={fieldStyle} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls} style={{ color: "var(--text-3)" }}>Sex</label>
                <select name="sex" defaultValue={initial.sex ?? ""}
                  className={`${fieldCls} appearance-none`} style={fieldStyle}>
                  <option value="">— not specified —</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls} style={{ color: "var(--text-3)" }}>Phone</label>
                <input name="phone" type="tel" defaultValue={initial.phone ?? ""}
                  placeholder="+1 555 000 0000" className={fieldCls} style={fieldStyle} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls} style={{ color: "var(--text-3)" }}>Email</label>
                <input name="email" type="email" defaultValue={initial.email ?? ""}
                  placeholder="client@example.com" className={fieldCls} style={fieldStyle} />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <label className={labelCls} style={{ color: "var(--text-3)" }}>Address</label>
                <input name="address" type="text" defaultValue={initial.address ?? ""}
                  placeholder="Street, City, Country, Postal Code"
                  className={fieldCls} style={fieldStyle} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls} style={{ color: "var(--text-3)" }}>Source of funds</label>
                <input name="source_of_funds" type="text" defaultValue={initial.sourceOfFunds ?? ""}
                  placeholder="e.g. Employment, Business income"
                  className={fieldCls} style={fieldStyle} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls} style={{ color: "var(--text-3)" }}>Source of wealth</label>
                <input name="source_of_wealth" type="text" defaultValue={initial.sourceOfWealth ?? ""}
                  placeholder="e.g. Savings, Inheritance, Investment"
                  className={fieldCls} style={fieldStyle} />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1" style={{ borderTop: "1px solid var(--inner-border)" }}>
              <button type="submit" disabled={isPending}
                className="h-8 rounded-md px-4 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ backgroundColor: "var(--green-btn-bg)", color: "var(--accent)", border: "1px solid var(--green-btn-border)" }}>
                {isPending ? "Saving…" : saved ? "Saved ✓" : "Save KYC"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Legal documents */}
      <DocSection
        title="Legal Documents"
        subtitle="Passport, national ID, driver's license — up to 15 files per type, max 10 MB each"
        types={LEGAL_DOC_TYPES}
        clientId={clientId}
        documents={documents}
      />

      {/* Compliance documents */}
      <DocSection
        title="Compliance Documents"
        subtitle="Proof of address, source of funds & wealth — up to 15 files per type, max 10 MB each"
        types={COMPLIANCE_DOC_TYPES}
        clientId={clientId}
        documents={documents}
      />
    </div>
  );
}
