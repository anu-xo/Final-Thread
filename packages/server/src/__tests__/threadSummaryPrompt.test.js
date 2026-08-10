process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key';

const { buildThreadSummaryPrompt, THREAD_SUMMARY_SYSTEM_PROMPT } = await import(
  '../services/aiService.js'
);

describe('buildThreadSummaryPrompt', () => {
  const post = { title: 'Pizza toppings', body: 'What is the best topping?' };
  const comments = [
    { body: 'Pineapple forever', score: 42 },
    { body: 'Pineapple is a crime', score: 21 },
  ];

  it('renders the versioned summary system prompt with the community substituted', () => {
    const prompt = buildThreadSummaryPrompt({
      communityName: 'pizza',
      post,
      topComments: comments,
    });

    expect(prompt).toContain(
      "You are ThreadVerse's thread-summarization assistant for r/pizza."
    );
    expect(prompt).toContain('Do NOT take a side');
    expect(prompt).toContain('Target 3–5 sentences');
    expect(prompt).not.toContain('{community}');
    expect(prompt).toContain(THREAD_SUMMARY_SYSTEM_PROMPT.replace('{community}', 'pizza'));
  });

  it('defaults the community to "thread" when none is provided', () => {
    const prompt = buildThreadSummaryPrompt({ post, topComments: comments });

    expect(prompt).toContain('for r/thread.');
  });

  it('renders post + scored comments after the system prompt', () => {
    const prompt = buildThreadSummaryPrompt({
      communityName: 'pizza',
      post,
      topComments: comments,
    });

    expect(prompt).toContain('Title: Pizza toppings');
    expect(prompt).toContain('Post body: What is the best topping?');
    expect(prompt).toContain('(score 42): Pineapple forever');
    expect(prompt).toContain('(score 21): Pineapple is a crime');
  });

  it('truncates long comment bodies to protect the token budget', () => {
    const longBody = 'x'.repeat(500);
    const prompt = buildThreadSummaryPrompt({
      communityName: 'pizza',
      post,
      topComments: [{ body: longBody, score: 10 }],
    });

    expect(prompt).not.toContain(longBody);
    expect(prompt).toContain(`${'x'.repeat(180)}…`);
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
