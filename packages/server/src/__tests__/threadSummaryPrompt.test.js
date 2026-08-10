import { describe, expect, it } from '@jest/globals';
import {
  buildThreadSummaryPrompt,
  THREAD_SUMMARY_SYSTEM_PROMPT,
} from '../services/prompts/threadSummary.js';

describe('buildThreadSummaryPrompt', () => {
  const post = { title: 'Pizza toppings', body: 'What is the best topping?' };
  const comments = [
    { body: 'Pineapple forever', score: 42 },
    { body: 'Pineapple is a crime', score: 21 },
  ];

  it('leads with the summary system prompt and renders post + comments', () => {
    const prompt = buildThreadSummaryPrompt({ post, topComments: comments });

    expect(prompt).toContain(THREAD_SUMMARY_SYSTEM_PROMPT);
    expect(prompt).toContain('Title: Pizza toppings');
    expect(prompt).toContain('Post body: What is the best topping?');
    expect(prompt).toContain('(score 42): Pineapple forever');
    expect(prompt).toContain('(score 21): Pineapple is a crime');
  });

  it('truncates long comment bodies to protect the token budget', () => {
    const longBody = 'x'.repeat(500);
    const prompt = buildThreadSummaryPrompt({
      post,
      topComments: [{ body: longBody, score: 10 }],
    });

    expect(prompt).not.toContain(longBody);
    expect(prompt).toContain(`${'x'.repeat(200)}…`);
  });

  it('handles a thread with no comments', () => {
    const prompt = buildThreadSummaryPrompt({ post, topComments: [] });

    expect(prompt).toContain('(no comments yet)');
  });

  it('omits the post body line when the post has no body', () => {
    const prompt = buildThreadSummaryPrompt({
      post: { title: 'Titled only' },
      topComments: comments,
    });

    expect(prompt).toContain('Title: Titled only');
    expect(prompt).not.toContain('Post body:');
  });
});
