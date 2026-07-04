// components/CreatePostForm.jsx
import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { postSchema } from '../schemas/postSchema';
import { api } from '../lib/api'; // your axios/fetch wrapper

function CommunityPicker({ value, onChange, error }) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);

    const { data: communities = [] } = useQuery({
        queryKey: ['communities', 'search', query],
        queryFn: () => api.get(`/communities/search`, { params: { q: query } }).then(r => r.data),
        enabled: open,
        staleTime: 30_000,
    });

    const selected = communities.find(c => c._id === value);

    return (
        <div className="relative">
            <label className="block text-sm font-medium mb-1">Community</label>
            <input
                className="w-full border rounded-md px-3 py-2"
                placeholder="Search communities..."
                value={open ? query : (selected ? `r/${selected.name}` : '')}
                onFocus={() => setOpen(true)}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
            />
            {open && communities.length > 0 && (
                <ul className="absolute z-10 w-full bg-white border rounded-md mt-1 max-h-56 overflow-auto shadow-lg">
                    {communities.map((c) => (
                        <li
                            key={c._id}
                            className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                            onMouseDown={() => { onChange(c._id); setOpen(false); }}
                        >
                            r/{c.name}
                        </li>
                    ))}
                </ul>
            )}
            {error && <p className="text-red-500 text-xs mt-1">{error.message}</p>}
        </div>
    );
}

function FlairSelector({ communityId, value, onChange }) {
    const { data: flairs = [] } = useQuery({
        queryKey: ['flairs', communityId],
        queryFn: () => api.get(`/communities/${communityId}/flairs`).then(r => r.data),
        enabled: !!communityId,
    });

    if (!communityId || flairs.length === 0) return null;

    return (
        <div>
            <label className="block text-sm font-medium mb-1">Flair (optional)</label>
            <select
                className="w-full border rounded-md px-3 py-2"
                value={value || ''}
                onChange={(e) => onChange(e.target.value || undefined)}
            >
                <option value="">No flair</option>
                {flairs.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
            </select>
        </div>
    );
}

function TiptapField({ value, onChange }) {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Link.configure({ openOnClick: false }),
            Placeholder.configure({ placeholder: 'Text (optional)' }),
        ],
        content: value || '',
        onUpdate: ({ editor }) => onChange(editor.getHTML()),
    });

    return (
        <div className="border rounded-md">
            <div className="flex gap-1 border-b p-2 text-sm">
                <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className="px-2 py-1 font-bold hover:bg-gray-100 rounded">B</button>
                <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className="px-2 py-1 italic hover:bg-gray-100 rounded">I</button>
                <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className="px-2 py-1 hover:bg-gray-100 rounded">• List</button>
                <button
                    type="button"
                    onClick={() => {
                        const url = window.prompt('URL');
                        if (url) editor?.chain().focus().setLink({ href: url }).run();
                    }}
                    className="px-2 py-1 hover:bg-gray-100 rounded"
                >
                    Link
                </button>
            </div>
            <EditorContent editor={editor} className="prose prose-sm max-w-none p-3 min-h-[120px]" />
        </div>
    );
}

export default function CreatePostForm({ defaultCommunityId, onSuccess }) {
    const queryClient = useQueryClient();
    const { register, handleSubmit, control, watch, formState: { errors } } = useForm({
        resolver: zodResolver(postSchema),
        defaultValues: {
            postType: 'text',
            communityId: defaultCommunityId || '',
        },
    });

    const postType = watch('postType');
    const communityId = watch('communityId');

    const { mutate, isPending, error: submitError } = useMutation({
        mutationFn: (data) => api.post('/posts', data).then(r => r.data),
        onSuccess: (post) => {
            queryClient.invalidateQueries({ queryKey: ['posts', 'feed'] });
            onSuccess?.(post);
        },
    });

    return (
        <form onSubmit={handleSubmit((data) => mutate(data))} className="space-y-4 max-w-xl">
            <div>
                <input
                    {...register('title')}
                    placeholder="Title"
                    className="w-full border rounded-md px-3 py-2 text-lg"
                />
                {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
            </div>

            <Controller
                name="postType"
                control={control}
                render={({ field }) => (
                    <div className="flex gap-2">
                        {['text', 'link'].map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => field.onChange(t)}
                                className={`px-3 py-1 rounded-md text-sm border transition-colors ${field.value === t
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-white hover:bg-gray-50'
                                    }`}
                            >
                                {t === 'text' ? 'Text post' : 'Link post'}
                            </button>
                        ))}
                    </div>
                )}
            />

            {postType === 'link' ? (
                <div>
                    <input
                        {...register('linkUrl')}
                        placeholder="https://..."
                        className="w-full border rounded-md px-3 py-2"
                    />
                    {errors.linkUrl && <p className="text-red-500 text-xs mt-1">{errors.linkUrl.message}</p>}
                </div>
            ) : (
                <Controller
                    name="body"
                    control={control}
                    render={({ field }) => <TiptapField value={field.value} onChange={field.onChange} />}
                />
            )}

            <Controller
                name="communityId"
                control={control}
                render={({ field }) => (
                    <CommunityPicker value={field.value} onChange={field.onChange} error={errors.communityId} />
                )}
            />

            <Controller
                name="flairId"
                control={control}
                render={({ field }) => (
                    <FlairSelector communityId={communityId} value={field.value} onChange={field.onChange} />
                )}
            />

            {submitError && <p className="text-red-500 text-sm">{submitError.message}</p>}

            <button
                type="submit"
                disabled={isPending}
                className="bg-blue-600 text-white px-4 py-2 rounded-md disabled:opacity-50"
            >
                {isPending ? 'Posting...' : 'Post'}
            </button>
        </form>
    );
}