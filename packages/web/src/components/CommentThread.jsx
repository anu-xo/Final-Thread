// packages/web/src/components/CommentThread.jsx
import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import VoteButton from './VoteButton';
import CommentBox from './CommentBox';
import StitchLine from './StitchLine';

const MAX_DEPTH = 5;
const CONNECTOR_LENGTH = 48;
const STAGGER_PER_DEPTH = 120;
const STAGGER_CAP = 600;

export default function CommentThread({
  comment,
  postId,
  currentUserVote = 0,
  newCommentId = null,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const reducedMotion = useReducedMotion();

  const hasChildren = comment.children && comment.children.length > 0;
  const isNew = comment._id === newCommentId;
  const staggerDelay = isNew
    ? 0
    : Math.min(comment.depth * STAGGER_PER_DEPTH, STAGGER_CAP);

  const contentBody = (
    <>
      <p className="text-sm mt-1 text-gray-700 dark:text-mist">{comment.body}</p>

      <div className="flex gap-3 mt-1 text-xs text-gray-500 dark:text-mist/60">
        {comment.depth < MAX_DEPTH && (
          <button onClick={() => setReplying((r) => !r)} className="hover:underline">
            Reply
          </button>
        )}
      </div>

      {replying && (
        <CommentBox
          postId={postId}
          parentId={comment._id}
          onSubmitted={() => setReplying(false)}
        />
      )}

      {hasChildren && (
        <div>
          {comment.children.map((child) => {
            const isChildNew = child._id === newCommentId;
            const childDelay = Math.min(child.depth * STAGGER_PER_DEPTH, STAGGER_CAP);
            return (
              <div key={child._id} className="flex gap-2 mt-2">
                <div className="flex shrink-0 w-2 flex-col items-center">
                  {isChildNew && (
                    <span className="relative mb-0.5 flex h-2 w-2">
                      <span className="absolute inset-0 rounded-full bg-emerald" />
                      {!reducedMotion && (
                        <motion.span
                          className="absolute inset-0 rounded-full bg-emerald"
                          initial={{ scale: 1, opacity: 0.7 }}
                          animate={{ scale: [1, 2.6], opacity: [0.7, 0] }}
                          transition={{ duration: 1.1, repeat: 3, repeatDelay: 0.3, ease: 'easeOut' }}
                        />
                      )}
                    </span>
                  )}
                  <StitchLine
                    orientation="vertical"
                    length={CONNECTOR_LENGTH}
                    className="text-steel"
                    revealed={!collapsed}
                    duration={0.45}
                    delay={isChildNew ? 0 : childDelay}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <CommentThread
                    comment={child}
                    postId={postId}
                    currentUserVote={child.userVote ?? 0}
                    newCommentId={newCommentId}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  const collapseRegion = reducedMotion ? (
    !collapsed && contentBody
  ) : (
    <motion.div
      initial={false}
      animate={{ height: collapsed ? 0 : 'auto', opacity: collapsed ? 0 : 1 }}
      transition={{ duration: 0.35, ease: 'easeInOut' }}
      className="overflow-hidden"
    >
      {contentBody}
    </motion.div>
  );

  const threadCard = (
    <div className="flex gap-2">
      <VoteButton
        targetId={comment._id}
        targetType="comment"
        initialScore={comment.score}
        initialUserVote={currentUserVote}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-mist/60">
          {comment.isNeo && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amaranth/30 bg-amaranth/10 px-1.5 py-0.5 text-[10px] font-semibold text-amaranth">
              <Sparkles size={10} className="shrink-0" />
              Neo
            </span>
          )}
          <span
            className={
              comment.isNeo
                ? 'font-medium text-amaranth'
                : 'font-medium text-gray-700 dark:text-mist/80'
            }
          >
            {comment.author.username}
          </span>
          <span>{timeAgo(comment.createdAt)}</span>
          {hasChildren && (
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="hover:underline"
            >
              [{collapsed ? `+ ${countDescendants(comment)} more` : '−'}]
            </button>
          )}
        </div>

        {collapseRegion}
      </div>
    </div>
  );

  return (
    <div className={comment.depth > 0 ? '' : 'mt-4'}>
      {reducedMotion ? (
        threadCard
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: staggerDelay, ease: 'easeOut' }}
        >
          {threadCard}
        </motion.div>
      )}
    </div>
  );
}

function countDescendants(comment) {
  if (!comment.children) return 0;
  return comment.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0);
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
