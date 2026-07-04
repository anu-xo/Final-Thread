// components/PostCard.jsx
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

export default function PostCard({ post, onVote }) {
  const {
    _id, title, author, community, score, commentCount,
    createdAt, userVote, flair,
  } = post;

  return (
    <div className="flex gap-3 border rounded-lg p-3 bg-white hover:border-gray-300 transition-colors">
      <div className="flex flex-col items-center w-8 shrink-0">
        <button
          onClick={() => onVote?.(_id, userVote === 1 ? 0 : 1)}
          className={`text-lg ${userVote === 1 ? 'text-orange-500' : 'text-gray-400 hover:text-gray-600'}`}
        >
          ▲
        </button>
        <span className="text-sm font-medium">{score}</span>
        <button
          onClick={() => onVote?.(_id, userVote === -1 ? 0 : -1)}
          className={`text-lg ${userVote === -1 ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600'}`}
        >
          ▼
        </button>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
          <span className="bg-gray-100 px-2 py-0.5 rounded-full font-medium text-gray-700">
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

        <h3 className="font-medium text-gray-900 leading-snug">{title}</h3>

        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
          <span>💬 {commentCount} comments</span>
        </div>
      </div>
    </div>
  );
}