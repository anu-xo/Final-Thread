// @AskAI detection for the autonomous Neo layer.
//
// Deliberately separate from the Day 12 mention-notification regex
// (models/Comment.js, /@(\w+)/g). @AskAI is NOT a user mention — there is no
// real "AskAI" user to notify — so we never touch that lookup path.
//
// The trigger must be a whole word: a standalone `@AskAI` token at the start of
// the body or after whitespace, followed by a word boundary. `emails@AskAIcorp.com`
// and `hi@AskAI` do NOT trigger — only ` @AskAI ` does.
export const ASKAI_TRIGGER = /(?:^|\s)@AskAI\b/i;

export const detectNeoMention = (body) =>
  typeof body === 'string' && ASKAI_TRIGGER.test(body);

/** Strips the trigger token so the remaining text becomes the "question". */
export const stripNeoMention = (body) =>
  typeof body === 'string' ? body.replace(ASKAI_TRIGGER, '').trim() : '';
