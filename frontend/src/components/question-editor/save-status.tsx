import type { AutosaveStatus } from '@/hooks/use-autosave';

export const SAVE_STATUS_LABELS: Record<AutosaveStatus, string> = {
  idle: 'No changes',
  pending: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved ✓',
  failed: 'Save failed',
  conflict: 'Needs review',
};

const SAVE_STATUS_TONES: Record<AutosaveStatus, string> = {
  idle: 'text-gray-400',
  pending: 'text-amber-600',
  saving: 'text-gray-500',
  saved: 'text-emerald-600',
  failed: 'text-red-600',
  conflict: 'text-orange-600',
};

interface SaveStatusProps {
  status: AutosaveStatus;
  showHint?: boolean;
}

export default function SaveStatus({ status, showHint = false }: SaveStatusProps) {
  return (
    <span className="mr-auto inline-flex items-baseline gap-2 text-xs">
      <span className={SAVE_STATUS_TONES[status]} role="status" data-status={status}>
        {SAVE_STATUS_LABELS[status]}
      </span>
      {showHint && status === 'pending' && (
        <span className="hidden sm:inline text-gray-400">
          Autosaved · Ctrl/⌘+S save · Ctrl/⌘+Enter save &amp; next
        </span>
      )}
    </span>
  );
}