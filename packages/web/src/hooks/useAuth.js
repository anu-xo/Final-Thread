// In your existing useAuth hook, add after successful auth:
import { useCommunityStore } from '../store/communityStore.js';

// Add inside the useAuth hook, after user is confirmed logged in:
const setSubscribed = useCommunityStore((s) => s.setSubscribed);

// After auth/me succeeds, load subscribed communities:
// (add this to your existing useEffect or React Query onSuccess)
useEffect(() => {
  if (user) {
    api.get('/users/me/communities').then((res) => {
      setSubscribed(res.data.data || []);
    }).catch(() => {}); // silently fail — not critical
  }
}, [user]);