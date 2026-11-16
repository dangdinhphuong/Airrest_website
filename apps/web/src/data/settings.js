// Cài đặt cá nhân của nhân sự (mọi loại: quản trị, khách sạn, chi trả, tài xế): /v1/auth/{me,password,profile}.
import { api } from '../lib/api';

export const getMe = () => api.get('/v1/auth/me');
export const changePassword = (currentPassword, newPassword) => api.patch('/v1/auth/password', { currentPassword, newPassword });
export const updateProfile = (body) => api.patch('/v1/auth/profile', body);
