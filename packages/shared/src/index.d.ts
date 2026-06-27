export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  meta: {
    cursor?: string;
    hasMore?: boolean;
    total?: number;
  } | null;
}

export interface User {
  _id: string;
  username: string;
  email: string;
  karma: number;
  role: 'user' | 'mod' | 'admin';
  createdAt: string;
}

export interface Community {
  _id: string;
  slug: string;
  name: string;
  description: string;
  members: number;
  aiEnabled: boolean;
}

export interface Post {
  _id: string;
  title: string;
  body: string;
  type: 'text' | 'link' | 'image';
  author: User;
  community: Community;
  score: number;
  hotScore: number;
  commentCount: number;
  isRemoved: boolean;
  createdAt: string;
}

export const SOCKET_EVENTS: {
  VOTE_UPDATED: string;
  NOTIFICATION_NEW: string;
  POST_CREATED: string;
  COMMENT_CREATED: string;
  AI_STREAM_CHUNK: string;
  AI_STREAM_END: string;
  USER_JOINED_ROOM: string;
};

export function createResponse<T>(data: T, meta?: object, error?: string): ApiResponse<T>;