// TiptapSmokeTest.jsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

export default function TiptapSmokeTest() {
  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>Type here, then try <strong>Ctrl+B</strong>, paste some rich text, and check DevTools console for CSP errors.</p>',
  });
  return <EditorContent editor={editor} className="prose p-4 border" />;
}