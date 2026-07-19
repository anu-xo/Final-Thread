import api from './api.js';

export const userApi = {
  getMe: () => api.get('/users/me'),
  updateMe: (prefs) => api.put('/users/me', prefs),
  getProfile: (username) => api.get(`/users/${username}`),
  getPosts: (username, cursor, limit = 10) =>
    api.get(`/users/${username}/posts`, { params: { cursor, limit } }),
  getComments: (username, cursor, limit = 10) =>
    api.get(`/users/${username}/comments`, { params: { cursor, limit } }),
};