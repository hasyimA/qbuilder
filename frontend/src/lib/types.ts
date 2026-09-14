export type QuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'short_answer'
  | 'essay';

export type QuestionStatus = 'draft' | 'complete';

export type QuizStatus = 'draft' | 'published' | 'archived';
export type QuizVisibility = 'private' | 'school' | 'public';

export interface DocContent {
  type: string;
  content?: DocContent[];
  text?: string;
  attrs?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface QuestionOption {
  id?: number;
  content: DocContent;
  is_correct: boolean;
  fraction: number | string;
  feedback?: DocContent | null;
  sort_order: number;
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
}

export interface Question {
  id: number;
  type: QuestionType;
  content: DocContent;
  default_mark: number | string;
  feedback_general?: DocContent | null;
  feedback_correct?: DocContent | null;
  feedback_incorrect?: DocContent | null;
  category?: string | null;
  difficulty?: string | null;
  status: QuestionStatus;
  used_in_count?: number;
  tags?: Tag[];
  sort_order?: number;
  options: QuestionOption[];
  created_at: string;
  updated_at: string;
}

export interface QuestionPayload {
  type: QuestionType;
  content: DocContent;
  default_mark?: number;
  status?: QuestionStatus;
  base_updated_at?: string;
  category?: string | null;
  difficulty?: string | null;
  tags?: string[];
  options?: Array<{
    id?: number;
    content: DocContent;
    is_correct: boolean;
    fraction: number;
    feedback?: DocContent | null;
  }>;
}

export interface Quiz {
  id: number;
  title: string;
  description: string | null;
  subject: string | null;
  grade_level: string | null;
  category: string | null;
  status: QuizStatus;
  visibility: QuizVisibility;
  questions_count: number;
  created_at: string;
  updated_at: string;
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Multiple Choice',
  true_false: 'True / False',
  short_answer: 'Short Answer',
  essay: 'Essay',
};