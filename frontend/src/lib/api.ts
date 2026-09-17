const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function resolveApiUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

interface ApiResponse<T> {
  data: T;
  message?: string;
}

export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'suspended';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

interface AuthResponse {
  user: User;
  token: string;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw { status: response.status, ...data };
  }

  return data;
}

export const auth = {
  register: (name: string, email: string, password: string, password_confirmation: string) =>
    request<ApiResponse<AuthResponse>>('/api/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, password_confirmation }),
    }),

  login: (email: string, password: string) =>
    request<ApiResponse<AuthResponse>>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    request<ApiResponse<{ message: string }>>('/api/logout', { method: 'POST' }),

  user: () => request<ApiResponse<User>>('/api/user'),
};

export interface QuizTag {
  id: number;
  name: string;
  slug: string;
}

export type QuestionStatus = 'draft' | 'complete';
export type QuestionFilterType = 'multiple_choice' | 'true_false' | 'short_answer' | 'essay';

export interface QuestionListParams {
  page?: number;
  perPage?: number;
  search?: string;
  status?: QuestionStatus | '';
  type?: QuestionFilterType | '';
  category?: string;
  difficulty?: string;
  tag?: string;
  updatedWithin?: '7' | '30' | null;
  sort?: 'updated_at' | 'created_at' | 'status' | 'type' | 'default_mark';
  sortDir?: 'asc' | 'desc';
}

export interface QuestionFiltersMeta {
  categories: string[];
  difficulties: string[];
  tags: QuizTag[];
  statuses: Array<{ value: QuestionStatus; label: string }>;
  types: Array<{ value: QuestionFilterType; label: string }>;
}

export function buildQuestionQuery(params: QuestionListParams = {}): string {
  const query = new URLSearchParams();

  if (params.page && params.page > 1) query.set('page', String(params.page));
  if (params.perPage && params.perPage !== 20) query.set('per_page', String(params.perPage));
  if (params.search && params.search.trim() !== '') query.set('search', params.search.trim());
  if (params.status) query.set('status', params.status);
  if (params.type) query.set('type', params.type);
  if (params.category && params.category !== '') query.set('category', params.category);
  if (params.difficulty && params.difficulty !== '') query.set('difficulty', params.difficulty);
  if (params.tag && params.tag !== '') query.set('tag', params.tag);
  if (params.updatedWithin) {
    query.set('updated_from', new Date(Date.now() - Number(params.updatedWithin) * 86400000).toISOString().slice(0, 10));
  }
  if (params.sort && params.sort !== 'updated_at') query.set('sort', params.sort);
  if (params.sortDir === 'asc') query.set('sort_dir', 'asc');

  return query.toString();
}

export interface QuizOwner {
  id: number;
  name: string;
}

export interface Quiz {
  id: number;
  title: string;
  description: string | null;
  subject: string | null;
  grade_level: string | null;
  category: string | null;
  status: 'draft' | 'published' | 'archived';
  visibility: 'private' | 'school' | 'public';
  questions_count: number;
  question_types: string[];
  owner: QuizOwner | null;
  tags: QuizTag[];
  created_at: string;
  updated_at: string;
}

export type QuizTab = 'mine' | 'shared';
export type QuizQuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'essay';

export interface QuizListParams {
  page?: number;
  perPage?: number;
  tab?: QuizTab;
  search?: string;
  status?: string;
  category?: string;
  tag?: string;
  type?: string;
  minQuestions?: number;
  updatedWithin?: '7' | '30' | null;
  sort?: 'title' | 'created_at' | 'updated_at';
  sortDir?: 'asc' | 'desc';
}

export interface QuizFiltersMeta {
  categories: string[];
  tags: QuizTag[];
  types: QuizQuestionType[];
}

export function buildQuizQuery(params: QuizListParams = {}): string {
  const query = new URLSearchParams();

  if (params.page && params.page > 1) query.set('page', String(params.page));
  if (params.perPage && params.perPage !== 20) query.set('per_page', String(params.perPage));
  if (params.tab && params.tab !== 'mine') query.set('tab', params.tab);
  if (params.search && params.search.trim() !== '') query.set('search', params.search.trim());
  if (params.status && params.status !== '') query.set('status', params.status);
  if (params.category && params.category !== '') query.set('category', params.category);
  if (params.tag && params.tag !== '') query.set('tag', params.tag);
  if (params.type && params.type !== '') query.set('type', params.type);
  if (params.minQuestions && params.minQuestions > 0) query.set('min_questions', String(params.minQuestions));
  if (params.updatedWithin) {
    query.set('updated_from', new Date(Date.now() - Number(params.updatedWithin) * 86400000).toISOString().slice(0, 10));
  }
  if (params.sort && params.sort !== 'updated_at') query.set('sort', params.sort);
  if (params.sortDir === 'asc') query.set('sort_dir', 'asc');

  return query.toString();
}

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export const quizzes = {
  list: (params: QuizListParams = {}) => {
    const query = buildQuizQuery(params);

    return request<PaginatedResponse<Quiz>>(`/api/quizzes${query ? `?${query}` : ''}`);
  },

  get: (id: number) =>
    request<ApiResponse<Quiz>>(`/api/quizzes/${id}`),

  create: (data: { title: string; description?: string; subject?: string; grade_level?: string; category?: string }) =>
    request<ApiResponse<Quiz>>('/api/quizzes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: Partial<{ title: string; description: string; subject: string; grade_level: string; category: string; status: string; visibility: string }>) =>
    request<ApiResponse<Quiz>>(`/api/quizzes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    request<ApiResponse<{ message: string }>>(`/api/quizzes/${id}`, { method: 'DELETE' }),

  duplicate: (id: number) =>
    request<ApiResponse<Quiz>>(`/api/quizzes/${id}/duplicate`, {
      method: 'POST',
    }),

  filtersMeta: () =>
    request<ApiResponse<QuizFiltersMeta>>('/api/quizzes/filters/meta'),
};

import type { Question, QuestionPayload } from './types';

export const questions = {
  list: (quizId: number) =>
    request<ApiResponse<Question[]>>(`/api/quizzes/${quizId}/questions`),

  create: (quizId: number, data: QuestionPayload) =>
    request<ApiResponse<Question>>(`/api/quizzes/${quizId}/questions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: QuestionPayload) =>
    request<ApiResponse<Question>>(`/api/questions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  get: (id: number) =>
    request<ApiResponse<Question>>(`/api/questions/${id}`),

  delete: (id: number) =>
    request<ApiResponse<{ message: string }>>(`/api/questions/${id}`, { method: 'DELETE' }),

  duplicate: (quizId: number, questionId: number) =>
    request<ApiResponse<Question>>(`/api/quizzes/${quizId}/questions/${questionId}/duplicate`, {
      method: 'POST',
    }),

  attach: (quizId: number, questionId: number) =>
    request<ApiResponse<Question>>(`/api/quizzes/${quizId}/questions/${questionId}/attach`, {
      method: 'POST',
    }),

  detach: (quizId: number, questionId: number) =>
    request<ApiResponse<{ message: string }>>(`/api/quizzes/${quizId}/questions/${questionId}`, {
      method: 'DELETE',
    }),

  reorder: (quizId: number, order: number[]) =>
    request<ApiResponse<{ message: string }>>(`/api/quizzes/${quizId}/questions/order`, {
      method: 'PATCH',
      body: JSON.stringify({ order }),
    }),

  bank: {
    list: (params: QuestionListParams = {}) => {
      const query = buildQuestionQuery(params);

      return request<PaginatedResponse<Question>>(`/api/questions${query ? `?${query}` : ''}`);
    },

    create: (data: QuestionPayload) =>
      request<ApiResponse<Question>>('/api/questions', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    duplicate: (questionId: number) =>
      request<ApiResponse<Question>>(`/api/questions/${questionId}/duplicate`, {
        method: 'POST',
      }),

    filtersMeta: () =>
      request<ApiResponse<QuestionFiltersMeta>>('/api/questions/filters/meta'),
  },
};

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  quizzes_count: number;
  questions_count: number;
  media_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdminUserRecentQuiz {
  id: number;
  title: string;
  status: 'draft' | 'published' | 'archived';
  updated_at: string;
}

export interface AdminUserRecentQuestion {
  id: number;
  type: QuizQuestionType;
  status: 'draft' | 'complete';
  excerpt: string;
  updated_at: string;
}

export interface AdminUserDetail extends AdminUser {
  recent_quizzes: AdminUserRecentQuiz[];
  recent_questions: AdminUserRecentQuestion[];
}

export interface AdminUserListParams {
  page?: number;
  perPage?: number;
  search?: string;
  role?: UserRole | '';
  status?: UserStatus | '';
  sort?: 'name' | 'email' | 'created_at' | 'updated_at';
  sortDir?: 'asc' | 'desc';
}

export function buildAdminUserQuery(params: AdminUserListParams = {}): string {
  const query = new URLSearchParams();

  if (params.page && params.page > 1) query.set('page', String(params.page));
  if (params.perPage && params.perPage !== 20) query.set('per_page', String(params.perPage));
  if (params.search && params.search.trim() !== '') query.set('search', params.search.trim());
  if (params.role) query.set('role', params.role);
  if (params.status) query.set('status', params.status);
  if (params.sort && params.sort !== 'created_at') query.set('sort', params.sort);
  if (params.sortDir === 'asc') query.set('sort_dir', 'asc');

  return query.toString();
}

export const adminUsers = {
  list: (params: AdminUserListParams = {}) => {
    const query = buildAdminUserQuery(params);

    return request<PaginatedResponse<AdminUser>>(`/api/admin/users${query ? `?${query}` : ''}`);
  },

  get: (id: number) =>
    request<ApiResponse<AdminUserDetail>>(`/api/admin/users/${id}`),

  update: (
    id: number,
    data: Partial<{ name: string; email: string; role: UserRole; status: UserStatus }>
  ) =>
    request<ApiResponse<AdminUser>>(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  resetPassword: (id: number, password: string, passwordConfirmation: string) =>
    request<ApiResponse<AdminUser>>(`/api/admin/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password, password_confirmation: passwordConfirmation }),
    }),

  revokeTokens: (id: number) =>
    request<ApiResponse<{ revoked_count: number }>>(`/api/admin/users/${id}/revoke-tokens`, {
      method: 'POST',
    }),
};

async function requestFormData<T>(
  endpoint: string,
  formData: FormData,
  method: 'POST' | 'PATCH' | 'DELETE' = 'POST'
): Promise<ApiResponse<T>> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    body: formData,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw { status: response.status, ...data };
  }

  return data;
}

interface Media {
  id: number;
  filename: string;
  mime_type: string;
  size: number;
  url: string | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  created_at: string;
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const media = {
  upload: (file: File, altText?: string) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      return Promise.reject(new Error('Gambar melebihi 5 MB. Pilih gambar yang lebih kecil.'));
    }

    const formData = new FormData();
    formData.append('file', file);
    if (altText) {
      formData.append('alt_text', altText);
    }

    return requestFormData<Media>('/api/media', formData);
  },

  get: (id: number) => request<ApiResponse<Media>>(`/api/media/${id}`),

  download: (id: number) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    return fetch(`${API_URL}/api/media/${id}/file`, {
      headers: {
        Accept: 'application/octet-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }).then(async (response) => {
      if (!response.ok) {
        let message = 'Gagal mengunduh berkas media.';
        try {
          const data = await response.json();
          message = data.message ?? message;
        } catch {
          // Non-JSON error body; keep the default message.
        }
        throw { status: response.status, message };
      }
      return response.blob();
    });
  },

  delete: (id: number) =>
    request<ApiResponse<{ message: string }>>(`/api/media/${id}`, { method: 'DELETE' }),
};
