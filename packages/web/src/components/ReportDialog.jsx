// packages/web/src/components/ReportDialog.jsx
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../services/api';

const REASONS = ['Spam', 'Harassment', 'Hate speech', 'Misinformation', 'Other'];

export default function ReportDialog({ target, targetType, community, onClose }) {
  const [reason, setReason] = useState(REASONS[0]);
  const [detail, setDetail] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.post('/reports', { target, targetType, reason, detail, community }),
    onSuccess: onClose,
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-neutral-900 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Report content</h2>
        <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full border rounded p-2 mb-3">
          {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Additional details (optional)"
          className="w-full border rounded p-2 mb-4"
          rows={3}
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm">Cancel</button>
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