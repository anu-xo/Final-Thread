// packages/web/src/components/CommentThread.jsx
import { useState } from 'react';
import VoteButton from './VoteButton';
import CommentBox from './CommentBox';

const DEPTH_COLORS = [
  'border-gray-300', 'border-blue-300', 'border-green-300',
  'border-yellow-300', 'border-purple-300', 'border-red-300',
];

export default function CommentThread({ comment, postId, currentUserVote = 0 }) {
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);

  const hasChildren = comment.children && comment.children.length > 0;
  const borderColor = DEPTH_COLORS[Math.min(comment.depth, DEPTH_COLORS.length - 1)];

  return (
    <div
      className={`pl-3 border-l-2 ${borderColor} ${comment.depth > 0 ? 'mt-2' : 'mt-4'}`}
    >
      <div className="flex gap-2">
        <VoteButton
          targetId={comment._id}
          targetType="comment"
          initialScore={comment.score}
          initialUserVote={currentUserVote}
        />

        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="font-medium text-gray-700">{comment.author.username}</span>
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

          {!collapsed && (
            <>
              <p className="text-sm mt-1">{comment.body}</p>

              <div className="flex gap-3 mt-1 text-xs text-gray-500">
                {comment.depth < 5 && (
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

              {hasChildren &&
                comment.children.map((child) => (
                  <CommentThread
                    key={child._id}
                    comment={child}
                    postId={postId}
                    currentUserVote={0}
                  />
                ))}
            </>
          )}
        </div>
      </div>
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