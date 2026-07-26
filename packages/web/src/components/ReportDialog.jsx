// packages/web/src/components/ReportDialog.jsx
import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../services/api';

const REASONS = ['Spam', 'Harassment', 'Hate speech', 'Misinformation', 'Other'];

export default function ReportDialog({ target, targetType, community, onClose }) {
  const [reason, setReason] = useState(REASONS[0]);
  const [detail, setDetail] = useState('');
  const dialogRef = useRef(null);

  const mutation = useMutation({
    mutationFn: () => api.post('/reports', { target, targetType, reason, detail, community }),
    onSuccess: onClose,
  });

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = dialog.querySelectorAll('select, textarea, button:not([disabled])');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-label="Report content">
      <div ref={dialogRef} tabIndex={-1} className="bg-white dark:bg-neutral-900 rounded-lg p-6 w-full max-w-md outline-none">
        <h2 className="text-lg font-semibold mb-4">Report content</h2>
        <label htmlFor="report-reason" className="sr-only">Reason</label>
        <select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-gray-900 dark:text-neutral-100 rounded p-2 mb-3">
          {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <label htmlFor="report-detail" className="sr-only">Additional details</label>
        <textarea
          id="report-detail"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Additional details (optional)"
          className="w-full border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-gray-900 dark:text-neutral-100 rounded p-2 mb-4"
          rows={3}
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm dark:text-neutral-300">Cancel</button>
          {mutation.isError && (
            <p className="text-xs text-red-500 dark:text-red-400 self-center mr-2">
              {mutation.error?.response?.data?.error || 'Failed to submit'}
            </p>
          )}
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="px-4 py-2 bg-red-600 text-white rounded text-sm"
          >
            {mutation.isPending ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  );
}