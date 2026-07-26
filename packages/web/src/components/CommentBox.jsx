// packages/web/src/components/CommentBox.jsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

export default function CommentBox({ postId, parentId = null, onSubmitted }) {
  const queryClient = useQueryClient();

  const editor = useEditor({
    extensions: [StarterKit],
    editorProps: {
      attributes: { class: 'prose prose-sm max-w-none focus:outline-none min-h-[60px]' },
      handleKeyDown: (view, event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          submit();
          return true;
        }
        return false;
      },
    },
  });

  const submitMutation = useMutation({
    mutationFn: (body) => api.post(`/posts/${postId}/comments`, { body, parentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      editor.commands.clearContent();
      onSubmitted?.();
    },
  });

  const submit = () => {
    const body = editor.getHTML();
    if (editor.isEmpty) return;
    submitMutation.mutate(body);
  };

  return (
    <div className="border border-gray-200 dark:border-neutral-700 rounded-md p-2 mt-2 bg-white dark:bg-neutral-900">
      <EditorContent editor={editor} />
      {submitMutation.isError && (
        <p className="text-xs text-red-500 dark:text-red-400 mt-2">
          Failed to post comment: {submitMutation.error?.response?.data?.error || 'Unknown error'}
        </p>
      )}
      <div className="flex justify-end mt-2">
        <button
          onClick={submit}
          disabled={submitMutation.isPending}
          className="text-sm bg-orange-500 text-white px-3 py-1 rounded disabled:opacity-50"
        >
          {submitMutation.isPending ? 'Posting…' : 'Comment'}
        </button>
      </div>
    </div>
  );
}