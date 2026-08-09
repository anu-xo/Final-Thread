// @AskAI detection for the autonomous Neo layer.
//
// Deliberately separate from the Day 12 mention-notification regex
// (models/Comment.js, /@(\w+)/g). @AskAI is NOT a user mention — there is no
// real "AskAI" user to notify — so we never touch that lookup path. This helper
// only answers "did the comment invoke the autonomous reply?".
export const NEO_MENTION = '@AskAI';

export const detectNeoMention = (body) =>
  typeof body === 'string' && /@askai\b/i.test(body);
