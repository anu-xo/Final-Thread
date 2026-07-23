// components/CreatePostForm.jsx
import { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { postSchema } from '../schemas/postSchema';
import api from '../services/api';
import { useIsDesktop } from '../hooks/useIsDesktop';

async function getCloudinarySignature() {
    const { data } = await api.post('/upload/sign');
    return data.data;
}

async function uploadToCloudinary(selectedFile) {
    const signatureData = await getCloudinarySignature();
    const formData = new FormData();

    formData.append('api_key', signatureData.apiKey);
    formData.append('timestamp', String(signatureData.timestamp));
    formData.append('signature', signatureData.signature);
    formData.append('folder', signatureData.folder);

    if (selectedFile.file instanceof File) {
        formData.append('file', selectedFile.file);
    } else if (selectedFile.dataUrl) {
        formData.append('file', selectedFile.dataUrl);
    } else {
        throw new Error('Unsupported file selection');
    }

    const response = await fetch(`https://api.cloudinary.com/v1_1/${signatureData.cloudName}/image/upload`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        throw new Error('Cloudinary upload failed');
    }

    const payload = await response.json();
    if (!payload.secure_url) {
        throw new Error('Cloudinary did not return a secure URL');
    }

    return payload.secure_url;
}

function base64ToBlob(base64, mimeType) {
    const byteString = atob(base64);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeType });
}

async function uploadFromPath(filePath) {
    const { base64, mimeType, fileName } = await window.electronAPI.readFileForUpload(filePath);
    const blob = base64ToBlob(base64, mimeType);
    const file = new File([blob], fileName, { type: mimeType });
    return uploadToCloudinary(file);
}

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
            <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-neutral-100">Community</label>
                <input
                    className="w-full border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100 rounded-md px-3 py-2"
                    placeholder="Search communities..."
                    value={open ? query : (selected ? `r/${selected.name}` : '')}
                    onFocus={() => setOpen(true)}
                    onChange={(e) => setQuery(e.target.value)}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                />
                {open && communities.length > 0 && (
                    <ul className="absolute z-10 w-full bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-600 rounded-md mt-1 max-h-56 overflow-auto shadow-lg">
                        {communities.map((c) => (
                            <li
                                key={c._id}
                                className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-neutral-700 cursor-pointer"
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
            <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-neutral-100">Flair (optional)</label>
            <select
                className="w-full border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100 rounded-md px-3 py-2"
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
        <div className="border border-gray-300 dark:border-neutral-600 rounded-md">
            <div className="flex gap-1 border-b border-gray-300 dark:border-neutral-600 p-2 text-sm">
                <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className="px-2 py-1 font-bold hover:bg-gray-100 dark:hover:bg-neutral-700 rounded">B</button>
                <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className="px-2 py-1 italic hover:bg-gray-100 dark:hover:bg-neutral-700 rounded">I</button>
                <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className="px-2 py-1 hover:bg-gray-100 dark:hover:bg-neutral-700 rounded">• List</button>
                <button
                    type="button"
                    onClick={() => {
                        const url = window.prompt('URL');
                        if (url) editor?.chain().focus().setLink({ href: url }).run();
                    }}
                    className="px-2 py-1 hover:bg-gray-100 dark:hover:bg-neutral-700 rounded"
                >
                    Link
                </button>
            </div>
            <EditorContent editor={editor} className="prose prose-sm dark:prose-invert max-w-none p-3 min-h-[120px]" />
        </div>
    );
}

export default function CreatePostForm({ defaultCommunityId, onSuccess }) {
    const queryClient = useQueryClient();
    const isDesktop = useIsDesktop();
    const fileInputRef = useRef(null);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm({
        resolver: zodResolver(postSchema),
        defaultValues: {
            postType: 'text',
            communityId: defaultCommunityId || '',
            media: [],
        },
    });

    const postType = watch('postType');
    const communityId = watch('communityId');

    useEffect(() => {
        if (postType !== 'image') {
            setSelectedFiles([]);
            setValue('media', []);
        }
    }, [postType, setValue]);

    useEffect(() => {
        return () => {
            selectedFiles.forEach((file) => {
                if (file.previewUrl?.startsWith('blob:')) {
                    URL.revokeObjectURL(file.previewUrl);
                }
            });
        };
    }, [selectedFiles]);

    const { mutate, isPending, error: submitError } = useMutation({
        mutationFn: (data) => api.post('/posts', data).then(r => r.data),
        onSuccess: (post) => {
            queryClient.invalidateQueries({ queryKey: ['posts', 'feed'] });
            onSuccess?.(post);
        },
    });

    const handleFileSelection = async () => {
        if (postType !== 'image') return;
        setUploadError(null);

        if (isDesktop) {
            const selection = await window.electronAPI?.selectFile({
                readAs: 'dataUrl',
                filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
            });

            const files = selection?.files?.map((item) => ({
                filePath: item.path,
                name: item.name,
                previewUrl: item.dataUrl,
            })) || [];

            if (files.length > 0) {
                setSelectedFiles((current) => [...current, ...files]);
            }
            return;
        }

        fileInputRef.current?.click();
    };

    const handleBrowserFileChange = (event) => {
        const files = Array.from(event.target.files || []).map((file) => ({
            file,
            name: file.name,
            previewUrl: URL.createObjectURL(file),
        }));

        if (files.length > 0) {
            setSelectedFiles((current) => [...current, ...files]);
        }

        event.target.value = '';
    };

    const removeSelectedFile = (indexToRemove) => {
        setSelectedFiles((current) => {
            const next = current.filter((_, index) => index !== indexToRemove);
            const removed = current[indexToRemove];
            if (removed?.previewUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(removed.previewUrl);
            }
            return next;
        });
    };

    return (
        <form
            onSubmit={handleSubmit(async (data) => {
                const payload = {
                    title: data.title,
                    community: data.communityId,
                    flair: data.flairId,
                    type: data.postType,
                    body: data.postType === 'text' ? (data.body || '') : '',
                    content: data.postType === 'text' ? (data.body || '') : '',
                    url: data.postType === 'link' ? (data.linkUrl || null) : null,
                    media: [],
                };

                if (data.postType === 'image') {
                    setUploading(true);
                    setUploadError(null);
                    try {
                        const mediaUrls = [];
                        for (const file of selectedFiles) {
                            if (isDesktop && file.filePath) {
                                mediaUrls.push(await uploadFromPath(file.filePath));
                            } else {
                                mediaUrls.push(await uploadToCloudinary(file));
                            }
                        }
                        payload.media = mediaUrls;
                    } catch (err) {
                        setUploadError(err.message || 'Image upload failed');
                        return;
                    } finally {
                        setUploading(false);
                    }
                }

                mutate(payload);
            })}
            className="space-y-4 max-w-xl"
        >
            <div>
                <input
                    {...register('title')}
                    placeholder="Title"
                    className="w-full border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100 rounded-md px-3 py-2 text-lg"
                />
                {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
            </div>

            <Controller
                name="postType"
                control={control}
                render={({ field }) => (
                    <div className="flex gap-2">
                        {['text', 'link', 'image'].map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => field.onChange(t)}
                                className={`px-3 py-1 rounded-md text-sm border transition-colors ${field.value === t
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-white dark:bg-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-600 text-gray-900 dark:text-neutral-100 border-gray-300 dark:border-neutral-600'
                                    }`}
                            >
                                {t === 'text' ? 'Text post' : t === 'link' ? 'Link post' : 'Image post'}
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
                        className="w-full border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100 rounded-md px-3 py-2"
                    />
                    {errors.linkUrl && <p className="text-red-500 text-xs mt-1">{errors.linkUrl.message}</p>}
                </div>
            ) : postType === 'image' ? (
                <div className="space-y-3">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleBrowserFileChange}
                    />

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleFileSelection}
                            disabled={uploading}
                            className="px-3 py-2 rounded-md border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {uploading && (
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            )}
                            {uploading ? 'Uploading...' : 'Attach image(s)'}
                        </button>
                        <span className="text-xs text-gray-500 dark:text-neutral-400">
                            Uploads go straight to Cloudinary; the server only receives CDN URLs.
                        </span>
                    </div>

                    {uploadError && <p className="text-red-500 text-xs mt-1">{uploadError}</p>}

                    {selectedFiles.length > 0 && (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {selectedFiles.map((file, index) => (
                                <div key={`${file.name}-${index}`} className="relative rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden bg-gray-50 dark:bg-neutral-800">
                                    <img src={file.previewUrl} alt={file.name} className="h-32 w-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => removeSelectedFile(index)}
                                        className="absolute top-2 right-2 bg-black/70 text-white text-xs rounded-full px-2 py-1"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {errors.media && <p className="text-red-500 text-xs mt-1">{errors.media.message}</p>}
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