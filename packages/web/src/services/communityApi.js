import api from './api.js'; // Your existing Axios instance from Day 2

export const communityApi = {
  create: (data) => api.post('/communities', data),
  
  browse: (cursor) =>
    api.get('/communities', { params: { cursor, limit: 20 } }),
  
  getBySlug: (slug) => api.get(`/communities/${slug}`),
  
  join: (slug) => api.post(`/communities/${slug}/join`),
  
  leave: (slug) => api.post(`/communities/${slug}/leave`),
};