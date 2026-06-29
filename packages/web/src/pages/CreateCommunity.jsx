import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { communityApi } from '../services/communityApi.js';

const schema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(100),
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9_]+$/, 'Slug can only contain lowercase letters, numbers, and underscores'),
  description: z.string().max(500).optional(),
  rules: z.array(
    z.object({
      title: z.string().min(1, 'Rule title required'),
      body: z.string().optional(),
    })
  ),
});

export default function CreateCommunity() {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { rules: [] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'rules' });

  // Auto-generate slug from name
  const name = watch('name');
  const handleNameChange = (e) => {
    const val = e.target.value;
    setValue('name', val);
    setValue(
      'slug',
      val.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 50)
    );
  };

  const { mutate, isPending, error } = useMutation({
    mutationFn: communityApi.create,
    onSuccess: (res) => navigate(`/community/${res.data.data.slug}`),
  });

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Create a Community</h1>

      <form onSubmit={handleSubmit((data) => mutate(data))} className="space-y-5">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium mb-1">Community Name</label>
          <input
            {...register('name')}
            onChange={handleNameChange}
            placeholder="React Developers"
            className="w-full border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>

        {/* Slug */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Slug <span className="text-neutral-400 text-xs">(auto-generated)</span>
          </label>
          <div className="flex items-center border border-neutral-300 dark:border-neutral-700 rounded-lg overflow-hidden">
            <span className="px-3 py-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 text-sm">
              r/
            </span>
            <input
              {...register('slug')}
              className="flex-1 px-3 py-2 bg-white dark:bg-neutral-900 focus:outline-none"
            />
          </div>
          {errors.slug && <p className="text-red-500 text-xs mt-1">{errors.slug.message}</p>}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            {...register('description')}
            rows={3}
            placeholder="What is this community about?"
            className="w-full border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
          />
        </div>

        {/* Rules */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">Community Rules</label>
            <button
              type="button"
              onClick={() => append({ title: '', body: '' })}
              className="text-sm text-orange-500 hover:text-orange-600 font-medium"
            >
              + Add Rule
            </button>
          </div>

          <div className="space-y-3">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <span className="text-neutral-400 text-sm pt-2">{index + 1}.</span>
                  <div className="flex-1 space-y-2">
                    <input
                      {...register(`rules.${index}.title`)}
                      placeholder="Rule title"
                      className="w-full border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1 text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                    <input
                      {...register(`rules.${index}.body`)}
                      placeholder="Description (optional)"
                      className="w-full border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1 text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="text-red-400 hover:text-red-600 text-sm pt-1.5"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-red-500 text-sm">
            {error.response?.data?.error || 'Something went wrong.'}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
        >
          {isPending ? 'Creating...' : 'Create Community'}
        </button>
      </form>
    </div>
  );
}