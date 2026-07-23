import { useNavigate } from 'react-router-dom';
import CreatePostForm from '../components/CreatePostForm.jsx';

export default function SubmitPostPage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Create a post</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400">Use Ctrl/Cmd+N to get here from anywhere in the app.</p>
      </div>

      <div className="bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl p-4 shadow-sm">
        <CreatePostForm onSuccess={(post) => {
          const postId = post?.data?.data?._id || post?._id;
          if (postId) {
            navigate(`/posts/${postId}`);
          }
        }} />
      </div>
    </div>
  );
}