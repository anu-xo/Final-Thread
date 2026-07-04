import TiptapSmokeTest from '../components/TiptapSmokeTest.jsx';

export default function TiptapSmokePage() {
  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Tiptap smoke test</h1>
        <p className="mt-2 text-sm text-gray-600">
          Use this page to verify rich-text editing, keyboard shortcuts, pasted content, and any CSP-related console warnings.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <TiptapSmokeTest />
      </div>
    </div>
  );
}
