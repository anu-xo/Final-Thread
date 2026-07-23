// components/PostCard.jsx
import { Link } from 'react-router-dom';
import VoteButton from './VoteButton';

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  const units = [
    ['y', 31536000], ['mo', 2592000], ['d', 86400],
    ['h', 3600], ['m', 60], ['s', 1],
  ];
  for (const [label, secs] of units) {
    const val = Math.floor(seconds / secs);
    if (val >= 1) return `${val}${label} ago`;
  }
  return 'just now';
}

export default function PostCard({ post }) {
  const {
    _id, title, author, community, score, commentCount,
    createdAt, userVote, flair,
  } = post;

  return (
    <div className="flex gap-3 border rounded-lg p-3 bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 hover:border-gray-300 dark:hover:border-neutral-600 transition-colors">
      {/* Vote column — uses the shared VoteButton with optimistic updates */}
      <div className="shrink-0">
        <VoteButton
          targetId={_id}
          targetType="post"
          initialScore={score}
          initialUserVote={userVote ?? 0}
          size="sm"
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-neutral-400 mb-1">
          <span className="bg-gray-100 dark:bg-neutral-700 px-2 py-0.5 rounded-full font-medium text-gray-700 dark:text-neutral-300">
            r/{community?.name}
          </span>
          {flair && (
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              {flair.name}
            </span>
          )}
          <span>Posted by u/{author?.username}</span>
          <span>· {timeAgo(createdAt)}</span>
        </div>

        <h3 className="font-medium text-gray-900 dark:text-neutral-100 leading-snug">
          <Link to={`/posts/${_id}`} className="hover:text-orange-500 transition-colors">
            {title}
          </Link>
        </h3>

        {post?.media?.length > 0 && (
          <Link to={`/posts/${_id}`} className="mt-3 block overflow-hidden rounded-lg border bg-gray-50 dark:bg-neutral-900 border-gray-200 dark:border-neutral-700">
            <img
              src={post.media[0]}
              alt={title}
              className="h-56 w-full object-cover"
              loading="lazy"
            />
          </Link>
        )}

        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-neutral-400">
          <Link
            to={`/posts/${_id}`}
            className="hover:text-gray-700 dark:hover:text-neutral-200 transition-colors"
          >
            💬 {commentCount} comments
          </Link>
        </div>
      </div>
    </div>
  );
}