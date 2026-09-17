'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DocContent,
  Question,
  QuestionPayload,
  QuestionType,
} from '@/lib/types';
import { QUESTION_TYPE_LABELS } from '@/lib/types';
import { docHasContent, docToPlainText, emptyDoc, textToDoc } from '@/lib/content';
import { canonicalizeDoc } from '@/lib/document';
import { questions } from '@/lib/api';
import {
  clearStoredDraft,
  draftKey,
  hasMeaningfulContent,
  readStoredDraft,
  writeStoredDraft,
  type QuestionDraftData,
  type StoredQuestionDraft,
} from '@/lib/draft-store';
import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_RETRY_MS,
  useAutosave,
} from '@/hooks/use-autosave';
import RichTextEditor from '@/components/rich-text/rich-text-editor';
import OptionBulkPaste from './option-bulk-paste';
import QuestionFeedbackSection from './question-feedback-section';
import QuestionPreview, { type PreviewMode } from './question-preview';
import SaveStatus from './save-status';
import { DialogSurface, useFocusTrap } from '@/components/ui/dialog';
import { buttonClassNames } from '@/components/ui';
import type { Editor } from '@tiptap/react';
import { ArrowLeftRight, Check, ChevronDown, ChevronUp, MessageSquare, Plus, RotateCcw, X } from 'lucide-react';

const sectionHeadingLabel =
  'block text-[11px] font-semibold uppercase tracking-wide text-gray-500';

interface OptionDraft {
  key: string;
  id?: number;
  content: DocContent;
  match_answer: string;
  text: string;
  is_correct: boolean;
  feedback: string;
}

export interface QuestionFormState {
  type: QuestionType;
  questionContent: DocContent;
  defaultMark: string;
  feedbackGeneral: DocContent;
  feedbackCorrect: DocContent;
  feedbackIncorrect: DocContent;
  graderInfo: DocContent;
  options: OptionDraft[];
}

const TYPE_ORDER: QuestionType[] = ['multiple_choice', 'true_false', 'short_answer', 'essay', 'matching'];

function readRecoverableDraft(key: string): StoredQuestionDraft | null {
  const stored = readStoredDraft(key);
  if (stored && !hasMeaningfulContent(stored)) {
    clearStoredDraft(key);
    return null;
  }
  return stored;
}

function nextKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function blankOption(patch: Partial<OptionDraft> = {}): OptionDraft {
  return {
    key: nextKey(),
    content: emptyDoc(),
    match_answer: '',
    text: '',
    is_correct: false,
    feedback: '',
    ...patch,
  };
}

function defaultOptionsForType(type: QuestionType): OptionDraft[] {
  switch (type) {
    case 'true_false':
      return [
        blankOption({ text: 'True', is_correct: true }),
        blankOption({ text: 'False', is_correct: false }),
      ];
    case 'short_answer':
      return [blankOption({ is_correct: true })];
    case 'multiple_choice':
      return [blankOption(), blankOption(), blankOption(), blankOption()];
    case 'matching':
      return [
        blankOption({ is_correct: true }),
        blankOption({ is_correct: true }),
        blankOption({ is_correct: true }),
      ];
    case 'essay':
      return [];
  }
}

function docOrNull(doc: DocContent): DocContent | null {
  return docToPlainText(doc).trim().length > 0 ? doc : null;
}

function optionContent(type: QuestionType, opt: OptionDraft): DocContent {
  if (type === 'multiple_choice' || type === 'matching') {
    return docHasContent(opt.content) ? canonicalizeDoc(opt.content) ?? emptyDoc() : textToDoc(opt.text);
  }
  return textToDoc(opt.text);
}

function buildOptionsPayload(
  type: QuestionType,
  options: OptionDraft[]
): QuestionPayload['options'] {
  if (type === 'essay') {
    return undefined;
  }

  return options.map((opt) => {
    const base = { ...(opt.id ? { id: opt.id } : {}), content: optionContent(type, opt) };

    if (type === 'matching') {
      return {
        ...base,
        match_answer: opt.match_answer.trim(),
        is_correct: true,
        fraction: 100,
        feedback: null,
      };
    }

    return {
      ...base,
      is_correct: opt.is_correct,
      fraction: opt.is_correct ? 100 : 0,
      feedback: opt.feedback.trim() ? textToDoc(opt.feedback) : null,
    };
  });
}

function formFromQuestion(question: Question | null, defaultType: QuestionType | null): QuestionFormState {
  if (question) {
    const options: OptionDraft[] = (question.options || []).map((opt) => ({
      key: opt.id ? `srv-${opt.id}` : nextKey(),
      id: opt.id,
      content: canonicalizeDoc(opt.content) ?? emptyDoc(),
      match_answer: opt.match_answer ?? '',
      text: docToPlainText(opt.content),
      is_correct: Boolean(opt.is_correct),
      feedback: docToPlainText(opt.feedback ?? null),
    }));

    if (question.type === 'true_false' && options.length === 0) {
      options.push(blankOption({ text: 'True', is_correct: true }));
      options.push(blankOption({ text: 'False', is_correct: false }));
    }

    return {
      type: question.type,
      questionContent: canonicalizeDoc(question.content) ?? emptyDoc(),
      defaultMark: String(question.default_mark ?? 1),
      feedbackGeneral: canonicalizeDoc(question.feedback_general ?? null) ?? emptyDoc(),
      feedbackCorrect: canonicalizeDoc(question.feedback_correct ?? null) ?? emptyDoc(),
      feedbackIncorrect: canonicalizeDoc(question.feedback_incorrect ?? null) ?? emptyDoc(),
      graderInfo: canonicalizeDoc(question.grader_info ?? null) ?? emptyDoc(),
      options,
    };
  }

  return {
    type: defaultType ?? 'multiple_choice',
    questionContent: emptyDoc(),
    defaultMark: '1',
    feedbackGeneral: emptyDoc(),
    feedbackCorrect: emptyDoc(),
    feedbackIncorrect: emptyDoc(),
    graderInfo: emptyDoc(),
    options: defaultOptionsForType(defaultType ?? 'multiple_choice'),
  };
}

function formToDraft(form: QuestionFormState): QuestionDraftData {
  return {
    type: form.type,
    questionContent: form.questionContent,
    defaultMark: form.defaultMark,
    feedbackGeneral: form.feedbackGeneral,
    feedbackCorrect: form.feedbackCorrect,
    feedbackIncorrect: form.feedbackIncorrect,
    graderInfo: form.graderInfo,
    options: form.options.map((opt) => ({
      key: opt.key,
      id: opt.id,
      content: opt.content,
      match_answer: opt.match_answer,
      text: opt.text,
      is_correct: opt.is_correct,
      feedback: opt.feedback,
    })),
  };
}

function draftToForm(draft: QuestionDraftData): QuestionFormState {
  return {
    type: draft.type,
    questionContent: draft.questionContent,
    defaultMark: draft.defaultMark,
    feedbackGeneral: draft.feedbackGeneral ?? emptyDoc(),
    feedbackCorrect: draft.feedbackCorrect ?? emptyDoc(),
    feedbackIncorrect: draft.feedbackIncorrect ?? emptyDoc(),
    graderInfo: draft.graderInfo ?? emptyDoc(),
    options: draft.options.map((opt) => ({
      key: opt.key,
      id: opt.id,
      content: opt.content ?? textToDoc(opt.text),
      match_answer: opt.match_answer ?? '',
      text: opt.text,
      is_correct: opt.is_correct,
      feedback: opt.feedback,
    })),
  };
}

interface QuestionEditorProps {
  quizId: number;
  question: Question | null;
  defaultType: QuestionType | null;
  onClose: () => void;
  onSave: (data: QuestionPayload, addAnother: boolean) => Promise<Question | undefined>;
  onAutoSaved?: (question: Question) => void;
  autosaveDebounceMs?: number;
  autosaveRetryMs?: number;
}

interface FormErrors {
  questionText?: string;
  options?: string;
}

export default function QuestionEditor({
  quizId,
  question,
  defaultType,
  onClose,
  onSave,
  onAutoSaved,
  autosaveDebounceMs = AUTOSAVE_DEBOUNCE_MS,
  autosaveRetryMs = AUTOSAVE_RETRY_MS,
}: QuestionEditorProps) {
  const isEdit = Boolean(question);
  const draftKeyValue = useMemo(
    () => draftKey(isEdit ? 'edit' : 'new', quizId, question?.id ?? null),
    [isEdit, quizId, question?.id]
  );

  const [form, setForm] = useState<QuestionFormState>(() =>
    formFromQuestion(question, defaultType)
  );
  const initialSnapshot = useRef<string | null>(null);
  if (initialSnapshot.current === null) {
    initialSnapshot.current = JSON.stringify(form);
  }
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [view, setView] = useState<PreviewMode | 'edit'>('edit');
  const [recoveredDraft, setRecoveredDraft] = useState<StoredQuestionDraft | null>(() =>
    readRecoverableDraft(draftKeyValue)
  );

  const questionTextRef = useRef<Editor | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openTrigger = useRef<HTMLElement | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [pendingType, setPendingType] = useState<QuestionType | null>(null);
  const [confirmingTypeChange, setConfirmingTypeChange] = useState(false);
  const [optionFeedbackOpen, setOptionFeedbackOpen] = useState<Record<string, boolean>>({});

  const isDirty = JSON.stringify(form) !== initialSnapshot.current;

  const formRef = useRef(form);
  const isDirtyRef = useRef(isDirty);
  const baseUpdatedAtRef = useRef(question?.updated_at ?? null);
  const originalStatusRef = useRef(question?.status ?? null);
  const forceOverwriteRef = useRef(false);

  const persistDraft = useCallback(() => {
    const draftForm = formRef.current;
    const draft: StoredQuestionDraft = {
      version: 1,
      mode: isEdit ? 'edit' : 'new',
      quizId,
      questionId: question?.id ?? null,
      savedAt: new Date().toISOString(),
      ...formToDraft(draftForm),
    };
    writeStoredDraft(draftKeyValue, draft);
  }, [draftKeyValue, isEdit, quizId, question?.id]);

  const persistDraftRef = useRef(persistDraft);

  useEffect(() => {
    formRef.current = form;
    isDirtyRef.current = isDirty;
    persistDraftRef.current = persistDraft;
  });

  const restoreDraft = useCallback(() => {
    if (!recoveredDraft) return;
    const draftForm = draftToForm(recoveredDraft);
    setForm(draftForm);
    if (isEdit) {
      initialSnapshot.current = JSON.stringify(formFromQuestion(question, defaultType));
    } else {
      initialSnapshot.current = JSON.stringify(draftForm);
    }
    clearStoredDraft(draftKeyValue);
    setRecoveredDraft(null);
  }, [recoveredDraft, isEdit, question, defaultType, draftKeyValue]);

  const discardDraft = useCallback(() => {
    clearStoredDraft(draftKeyValue);
    setRecoveredDraft(null);
  }, [draftKeyValue]);

  const buildPayload = useCallback((): QuestionPayload => {
    return {
      type: form.type,
      content: canonicalizeDoc(form.questionContent) ?? emptyDoc(),
      default_mark: Number(parseFloat(form.defaultMark) || 0),
      status: 'complete',
      feedback_general: docOrNull(form.feedbackGeneral),
      feedback_correct:
        form.type === 'multiple_choice' ? docOrNull(form.feedbackCorrect) : null,
      feedback_incorrect:
        form.type === 'multiple_choice' ? docOrNull(form.feedbackIncorrect) : null,
      grader_info: form.type === 'essay' ? docOrNull(form.graderInfo) : null,
      options: buildOptionsPayload(form.type, form.options),
    };
  }, [form]);

  const { status: autosaveStatus, failureMessage, conflict, saveNow, clearConflict, reset } =
    useAutosave<Question>({
      enabled: !recoveredDraft,
      isDirty,
      debounceMs: autosaveDebounceMs,
      retryDelayMs: autosaveRetryMs,
      save: useCallback(async () => {
        const payload = buildPayload();
        persistDraftRef.current();

        if (!isEdit || !question) {
          return {} as Question;
        }

        const snapshot = JSON.stringify(formRef.current);
        const res = await questions.update(question.id, {
          ...payload,
          ...(forceOverwriteRef.current
            ? {}
            : { base_updated_at: baseUpdatedAtRef.current ?? undefined }),
          status: originalStatusRef.current ?? payload.status,
        });
        forceOverwriteRef.current = false;
        baseUpdatedAtRef.current = res.data.updated_at;
        if (JSON.stringify(formRef.current) === snapshot) {
          initialSnapshot.current = snapshot;
        }
        clearStoredDraft(draftKeyValue);
        onAutoSaved?.(res.data);
        return res.data;
      }, [isEdit, question, buildPayload, draftKeyValue, onAutoSaved]),
      classifyError: (err: unknown) => {
        const status = (err as { status?: number })?.status;
        if (status === 409) return 'conflict';
        if (status === 422) return 'soft';
        return 'hard';
      },
    });

  const conflictQuestion = (conflict as { data?: Question } | null)?.data ?? null;

  const reloadFromServer = useCallback(() => {
    if (!conflictQuestion) return;
    forceOverwriteRef.current = false;
    setForm(formFromQuestion(conflictQuestion, defaultType));
    initialSnapshot.current = JSON.stringify(formFromQuestion(conflictQuestion, defaultType));
    baseUpdatedAtRef.current = conflictQuestion.updated_at;
    clearStoredDraft(draftKeyValue);
    reset();
    onAutoSaved?.(conflictQuestion);
  }, [conflictQuestion, defaultType, draftKeyValue, reset, onAutoSaved]);

  const keepMyVersion = useCallback(() => {
    forceOverwriteRef.current = true;
    clearConflict();
    saveNow();
  }, [clearConflict, saveNow]);

  useEffect(() => {
    if (!isDirty) return;
    const onUnload = () => persistDraftRef.current();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [isDirty]);

  useEffect(() => {
    return () => {
      if (isDirtyRef.current) persistDraftRef.current();
    };
  }, []);

  useEffect(() => {
    openTrigger.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      openTrigger.current?.focus?.();
    };
  }, []);

  useFocusTrap(sheetRef, { autofocus: false, restore: false });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (saving) return;
        requestClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void doSave(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        void doSave(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, saving]);

  function optionsDifferFromDefaults(options: OptionDraft[], type: QuestionType): boolean {
    const defaults = defaultOptionsForType(type);
    if (options.length !== defaults.length) return true;
    return options.some((opt, index) => {
      const def = defaults[index];
      return (
        docToPlainText(opt.content).trim() !== docToPlainText(def.content).trim() ||
        opt.text.trim() !== def.text.trim() ||
        opt.match_answer.trim() !== def.match_answer.trim() ||
        opt.is_correct !== def.is_correct
      );
    });
  }

  function applyTypeChange(type: QuestionType) {
    setForm((prev) => {
      if (type === prev.type) return prev;
      return {
        ...prev,
        type,
        options: defaultOptionsForType(type),
      };
    });
    setShowTypePicker(false);
    setPendingType(null);
  }

  function requestTypeChange(type: QuestionType) {
    if (type === form.type) {
      setShowTypePicker(false);
      return;
    }
    if (optionsDifferFromDefaults(form.options, form.type)) {
      setPendingType(type);
      setConfirmingTypeChange(true);
      return;
    }
    applyTypeChange(type);
  }

  function cancelTypeChange() {
    setConfirmingTypeChange(false);
    setPendingType(null);
  }

  function setOption(key: string, patch: Partial<OptionDraft>) {
    setForm((prev) => ({
      ...prev,
      options: prev.options.map((opt) =>
        opt.key === key ? { ...opt, ...patch } : opt
      ),
    }));
  }

  function markCorrect(key: string) {
    setForm((prev) => {
      if (prev.type === 'true_false') {
        return {
          ...prev,
          options: prev.options.map((opt) => ({
            ...opt,
            is_correct: opt.key === key,
          })),
        };
      }
      return {
        ...prev,
        options: prev.options.map((opt) =>
          opt.key === key ? { ...opt, is_correct: true } : opt
        ),
      };
    });
  }

  function addOption() {
    setForm((prev) => ({
      ...prev,
      options: [
        ...prev.options,
        blankOption(prev.type === 'matching' ? { is_correct: true } : {}),
      ],
    }));
  }

  function applyBulkOptions(texts: string[]) {
    setForm((prev) => ({
      ...prev,
      options: texts.map((text, index) =>
        blankOption({
          text,
          content:
            prev.type === 'multiple_choice' || prev.type === 'matching'
              ? textToDoc(text)
              : emptyDoc(),
          is_correct: prev.type === 'short_answer' && index === 0,
        })
      ),
    }));
  }

  function removeOption(key: string) {
    setForm((prev) => ({
      ...prev,
      options: prev.options.filter((opt) => opt.key !== key),
    }));
  }

  function moveOption(key: string, direction: -1 | 1) {
    setForm((prev) => {
      const index = prev.options.findIndex((opt) => opt.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.options.length) return prev;
      const next = [...prev.options];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, options: next };
    });
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    if (docToPlainText(form.questionContent).length === 0) {
      nextErrors.questionText = 'Teks pertanyaan wajib diisi.';
    }

    if (form.type === 'multiple_choice' || form.type === 'true_false') {
      if (form.options.length < 2) {
        nextErrors.options = 'Minimal dua pilihan jawaban wajib diisi.';
      } else if (form.options.some((opt) => !docHasContent(opt.content) && !opt.text.trim())) {
        nextErrors.options = 'Setiap pilihan jawaban harus memiliki teks atau gambar.';
      }
    }

    if (form.type === 'matching') {
      if (form.options.length < 2) {
        nextErrors.options = 'Minimal dua pasangan wajib diisi.';
      } else if (form.options.some((opt) => !docHasContent(opt.content))) {
        nextErrors.options = 'Setiap pasangan harus memiliki pernyataan.';
      } else if (form.options.some((opt) => !opt.match_answer.trim())) {
        nextErrors.options = 'Setiap pasangan harus memiliki jawaban.';
      }
    }

    if (form.type === 'short_answer') {
      if (form.options.length === 0 || form.options.every((opt) => !opt.text.trim())) {
        nextErrors.options = 'Minimal satu jawaban yang diterima wajib diisi.';
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function doSave(addAnother: boolean) {
    if (saving) return;
    if (!validate()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = buildPayload();
      const saved = await onSave(payload, addAnother);
      if (saved) {
        clearStoredDraft(draftKeyValue);
        forceOverwriteRef.current = false;
        if (isEdit) {
          baseUpdatedAtRef.current = saved.updated_at;
        }
      }
      if (addAnother && saved) {
        const nextType = saved.type;
        initialSnapshot.current = JSON.stringify(
          formFromQuestion(null, defaultType ?? nextType)
        );
        setForm(formFromQuestion(null, defaultType ?? nextType));
        setErrors({});
        setSaving(false);
        setEditorKey((k) => k + 1);
      }
    } catch (err: unknown) {
      setSaveError(
        err instanceof Error ? err.message : 'Gagal menyimpan soal.'
      );
      setSaving(false);
    }
  }

  function requestClose() {
    if (isDirty) {
      setConfirmingClose(true);
      return;
    }
    onClose();
  }

  const showOptions = form.type !== 'essay';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Edit soal' : 'Soal baru'}
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => (saving ? null : requestClose())}
        aria-hidden="true"
      />

      <div
        ref={sheetRef}
        className="relative flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl animate-slide-in-right"
      >
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:flex-none">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold leading-6">
                {isEdit ? 'Edit Soal' : 'Soal Baru'}
              </h2>
              <p className="truncate text-sm text-gray-500">
                {isEdit ? `Soal #${question?.sort_order !== undefined ? question.sort_order + 1 : question?.id}` : 'Buat soal baru'}
              </p>
            </div>
            <span
              aria-hidden="true"
              className="hidden flex-none items-center rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-700 sm:inline-flex"
            >
              {QUESTION_TYPE_LABELS[form.type]}
            </span>
          </div>

          <div
            role="group"
            aria-label="Tampilan"
            className="order-last flex w-full flex-none items-center rounded-lg border border-gray-200 bg-gray-100 p-0.5 sm:order-none sm:ml-auto sm:w-auto"
          >
            {(['edit', 'teacher', 'student'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                aria-pressed={view === mode}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 sm:flex-none ${
                  view === mode
                    ? 'bg-white font-medium text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {mode === 'edit' ? 'Edit' : mode === 'teacher' ? 'Guru' : 'Siswa'}
              </button>
            ))}
          </div>

          <button
            onClick={() => (saving ? null : requestClose())}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Tutup editor"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {recoveredDraft && (
            <div
              role="alert"
              className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            >
              <p className="font-medium">Draft lokal ditemukan. Pulihkan?</p>
              <p className="mt-1 text-xs text-amber-700">
                Draft tersimpan pada {new Date(recoveredDraft.savedAt).toLocaleString()}.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={restoreDraft}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                >
                  Pulihkan
                </button>
                <button
                  onClick={discardDraft}
                  className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                  Abaikan
                </button>
              </div>
            </div>
          )}

          {isEdit && conflictQuestion && (
            <div
              role="alert"
              className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800"
            >
              <p className="font-medium">
                Soal ini telah diubah di sisi server saat Anda mengedit.
              </p>
              <p className="mt-1 text-xs text-orange-700">
                Perubahan Anda belum hilang — pilih versi yang ingin dipertahankan.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={keepMyVersion}
                  className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700"
                >
                  Pertahankan versi saya
                </button>
                <button
                  onClick={reloadFromServer}
                  className="rounded-md border border-orange-300 px-3 py-1.5 text-xs font-medium text-orange-800 hover:bg-orange-100"
                >
                  Muat versi server
                </button>
              </div>
            </div>
          )}

          {view === 'edit' ? (
            <>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label className={sectionHeadingLabel}>Jenis Soal</label>
              <button
                type="button"
                onClick={() => setShowTypePicker((v) => !v)}
                aria-expanded={showTypePicker}
                data-testid="question-type-switch"
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
                Ganti Jenis
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                data-testid="current-question-type"
              >
                {QUESTION_TYPE_LABELS[form.type]}
              </span>
              <span className="text-xs text-gray-500">
                {form.type === 'true_false'
                  ? 'Pilihan Benar/Salah dibuat otomatis'
                  : 'Editor menyesuaikan dengan jenis soal'}
              </span>
            </div>
            {showTypePicker && (
              <div
                role="group"
                aria-label="Pilih jenis soal"
                className="animate-fade-in-up mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2"
                data-testid="question-type-picker"
              >
                {TYPE_ORDER.map((type) => {
                  const active = form.type === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => requestTypeChange(type)}
                      aria-pressed={active}
                      data-testid={`question-type-option-${type}`}
                      className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                        active
                          ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium'
                          : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      {QUESTION_TYPE_LABELS[type]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label
                htmlFor="question-text"
                className={sectionHeadingLabel}
              >
                Teks Pertanyaan
              </label>
              {docToPlainText(form.questionContent).length === 0 && (
                <span className="text-xs text-gray-400">Mendukung teks kaya</span>
              )}
            </div>
            <RichTextEditor
              key={editorKey}
              value={form.questionContent}
              onChange={(doc) => {
                setForm((prev) => ({ ...prev, questionContent: doc }));
                if (errors.questionText) {
                  setErrors((prev) => ({ ...prev, questionText: undefined }));
                }
              }}
              onEditorReady={(editor) => {
                questionTextRef.current = editor;
                requestAnimationFrame(() => {
                  if (!editor.isDestroyed) editor.commands.focus('end');
                });
              }}
              placeholder="Ketik atau tempel pertanyaan Anda di sini…"
              ariaLabel="Teks pertanyaan"
            />
            {errors.questionText && (
              <p id="question-text-error" className="mt-1 text-sm text-red-600">
                {errors.questionText}
              </p>
            )}
          </div>

          {showOptions && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className={sectionHeadingLabel}>
                  {form.type === 'multiple_choice'
                    ? 'Pilihan Jawaban'
                    : form.type === 'true_false'
                      ? 'Pilihan Benar / Salah'
                      : form.type === 'matching'
                        ? 'Pasangan Menjodohkan'
                        : 'Jawaban Diterima'}
                </h3>
              </div>

              {errors.options && (
                <p className="mb-2 text-sm text-red-600">{errors.options}</p>
              )}

              <ul className="space-y-2">
                {form.options.map((opt, index) => {
                  const isMatching = form.type === 'matching';
                  const letter = String.fromCharCode(65 + index);
                  const unit = isMatching ? `pasangan ${index + 1}` : `pilihan ${letter}`;
                  const canRemove = isMatching
                    ? form.options.length > 2
                    : form.options.length > 1;

                  return (
                    <li
                      key={opt.key}
                      className={`rounded-md border px-2 py-2 ${
                        !isMatching && opt.is_correct
                          ? 'border-green-400 bg-green-50'
                          : 'border-gray-300'
                      }`}
                    >
                      {isMatching ? (
                        <div className="flex items-start gap-2">
                          <span className="mt-2 w-6 flex-none text-right text-sm text-gray-400">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <RichTextEditor
                              value={opt.content}
                              onChange={(doc) => setOption(opt.key, { content: doc })}
                              placeholder={`Pernyataan ${index + 1} (boleh gambar)`}
                              ariaLabel={`Pernyataan ${index + 1}`}
                              contentTestId={`match-statement-${index}`}
                            />
                            <input
                              type="text"
                              value={opt.match_answer}
                              onChange={(e) =>
                                setOption(opt.key, { match_answer: e.target.value })
                              }
                              className="w-full min-w-0 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                              placeholder="Pasangan jawaban"
                              aria-label={`Jawaban pasangan ${index + 1}`}
                            />
                          </div>
                          <div className="flex items-center gap-1 pt-1">
                            {canRemove && (
                              <button
                                type="button"
                                onClick={() => removeOption(opt.key)}
                                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                aria-label={`Hapus ${unit}`}
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => moveOption(opt.key, 1)}
                              disabled={index === form.options.length - 1}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                              aria-label={`Pindahkan ${unit} ke bawah`}
                            >
                              <ChevronDown className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveOption(opt.key, -1)}
                              disabled={index === 0}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                              aria-label={`Pindahkan ${unit} ke atas`}
                            >
                              <ChevronUp className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      ) : form.type === 'multiple_choice' ? (
                        <>
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              onClick={() => markCorrect(opt.key)}
                              className="mt-2 flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 border-gray-400 hover:border-green-500 aria-pressed:bg-green-500"
                              aria-pressed={opt.is_correct}
                              aria-label={opt.is_correct ? 'Ditandai benar (klik untuk membatalkan)' : 'Tandai pilihan ini sebagai benar'}
                              style={opt.is_correct ? { background: '#22c55e', borderColor: '#22c55e' } : undefined}
                            >
                              {opt.is_correct && (
                                <Check className="h-3 w-3 text-white" aria-hidden="true" />
                              )}
                            </button>

                            <span className="mt-2 w-6 flex-none text-right text-sm text-gray-400">
                              {letter}
                            </span>

                            <div className="min-w-0 flex-1">
                              <RichTextEditor
                                value={opt.content}
                                onChange={(doc) => setOption(opt.key, { content: doc })}
                                placeholder={`Pilihan ${letter} (boleh gambar)`}
                                ariaLabel={`Pilihan ${letter}`}
                                contentTestId={`option-content-${letter}`}
                              />
                            </div>

                            <div className="flex items-center gap-1 pt-1">
                              {canRemove && (
                                <button
                                  type="button"
                                  onClick={() => removeOption(opt.key)}
                                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                  aria-label={`Hapus pilihan ${letter}`}
                                >
                                  <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => moveOption(opt.key, 1)}
                                disabled={index === form.options.length - 1}
                                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                                aria-label={`Pindahkan pilihan ${letter} ke bawah`}
                              >
                                <ChevronDown className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveOption(opt.key, -1)}
                                disabled={index === 0}
                                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                                aria-label={`Pindahkan pilihan ${letter} ke atas`}
                              >
                                <ChevronUp className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setOptionFeedbackOpen((prev) => ({
                                    ...prev,
                                    [opt.key]: !prev[opt.key],
                                  }))
                                }
                                aria-expanded={Boolean(optionFeedbackOpen[opt.key])}
                                data-testid={`option-feedback-toggle-${index}`}
                                className={`rounded p-1 hover:bg-gray-100 ${
                                  opt.feedback.trim() ? 'text-blue-600' : 'text-gray-400 hover:text-gray-700'
                                }`}
                                aria-label={`Umpan balik pilihan ${letter}`}
                                title="Umpan balik pilihan"
                              >
                                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                          {optionFeedbackOpen[opt.key] && (
                            <div className="animate-fade-in-up mt-2 pl-9">
                              <textarea
                                value={opt.feedback}
                                onChange={(e) => setOption(opt.key, { feedback: e.target.value })}
                                rows={2}
                                placeholder="Umpan balik untuk pilihan ini (opsional)"
                                aria-label={`Umpan balik pilihan ${letter}`}
                                className="w-full min-w-0 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                              />
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => markCorrect(opt.key)}
                              className="flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 border-gray-400 hover:border-green-500 aria-pressed:bg-green-500"
                              aria-pressed={opt.is_correct}
                              aria-label={opt.is_correct ? 'Ditandai benar (klik untuk membatalkan)' : 'Tandai pilihan ini sebagai benar'}
                              style={opt.is_correct ? { background: '#22c55e', borderColor: '#22c55e' } : undefined}
                            >
                              {opt.is_correct && (
                                <Check className="h-3 w-3 text-white" aria-hidden="true" />
                              )}
                            </button>

                            <span className="w-6 flex-none text-right text-sm text-gray-400">
                              {letter}
                            </span>

                            <input
                              type="text"
                              value={opt.text}
                              onChange={(e) => setOption(opt.key, { text: e.target.value })}
                              className="min-w-0 flex-1 rounded border px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
                              placeholder={
                                form.type === 'short_answer'
                                  ? 'Teks jawaban yang diterima'
                                  : `Pilihan ${letter}`
                              }
                              aria-label={`Pilihan ${letter}`}
                            />

                            {canRemove && (
                              <button
                                type="button"
                                onClick={() => removeOption(opt.key)}
                                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                aria-label={`Hapus pilihan ${letter}`}
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => moveOption(opt.key, 1)}
                              disabled={index === form.options.length - 1}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                              aria-label={`Pindahkan pilihan ${letter} ke bawah`}
                            >
                              <ChevronDown className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveOption(opt.key, -1)}
                              disabled={index === 0}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                              aria-label={`Pindahkan pilihan ${letter} ke atas`}
                            >
                              <ChevronUp className="h-4 w-4" aria-hidden="true" />
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setOptionFeedbackOpen((prev) => ({
                                  ...prev,
                                  [opt.key]: !prev[opt.key],
                                }))
                              }
                              aria-expanded={Boolean(optionFeedbackOpen[opt.key])}
                              data-testid={`option-feedback-toggle-${index}`}
                              className={`rounded p-1 hover:bg-gray-100 ${
                                opt.feedback.trim() ? 'text-blue-600' : 'text-gray-400 hover:text-gray-700'
                              }`}
                              aria-label={`Umpan balik pilihan ${letter}`}
                              title="Umpan balik pilihan"
                            >
                              <MessageSquare className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                          {optionFeedbackOpen[opt.key] && (
                            <div className="animate-fade-in-up mt-2 pl-9">
                              <textarea
                                value={opt.feedback}
                                onChange={(e) => setOption(opt.key, { feedback: e.target.value })}
                                rows={2}
                                placeholder="Umpan balik untuk pilihan ini (opsional)"
                                aria-label={`Umpan balik pilihan ${letter}`}
                                className="w-full min-w-0 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                              />
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>

              {(form.type === 'multiple_choice' || form.type === 'short_answer') && (
                <OptionBulkPaste
                  onApply={applyBulkOptions}
                  allowPlainLines={form.type === 'short_answer'}
                />
              )}

              {(form.type === 'multiple_choice' || form.type === 'matching') && (
                <button
                  type="button"
                  onClick={addOption}
                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {form.type === 'matching' ? 'Tambah Pasangan' : 'Tambah Pilihan'}
                </button>
              )}
            </div>
          )}

          <QuestionFeedbackSection
            type={form.type}
            general={form.feedbackGeneral}
            correct={form.feedbackCorrect}
            incorrect={form.feedbackIncorrect}
            graderInfo={form.graderInfo}
            onGeneralChange={(doc) => setForm((prev) => ({ ...prev, feedbackGeneral: doc }))}
            onCorrectChange={(doc) => setForm((prev) => ({ ...prev, feedbackCorrect: doc }))}
            onIncorrectChange={(doc) => setForm((prev) => ({ ...prev, feedbackIncorrect: doc }))}
            onGraderInfoChange={(doc) => setForm((prev) => ({ ...prev, graderInfo: doc }))}
          />

          <div>
            <label
              htmlFor="default-mark"
              className={sectionHeadingLabel}
            >
              Bobot Skor
            </label>
            <input
              id="default-mark"
              type="number"
              min="0"
              step="0.5"
              value={form.defaultMark}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, defaultMark: e.target.value }))
              }
              className="w-32 rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {saveError && (
            <div
              role="alert"
              className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
            >
              {saveError}
            </div>
          )}
            </>
          ) : (
            <QuestionPreview
              type={form.type}
              questionContent={form.questionContent}
              defaultMark={form.defaultMark}
              options={form.options.map((option) => ({
                key: option.key,
                content: option.content,
                match_answer: option.match_answer,
                text: option.text,
                is_correct: option.is_correct,
                feedback: option.feedback,
              }))}
              feedbackGeneral={form.feedbackGeneral}
              feedbackCorrect={form.feedbackCorrect}
              feedbackIncorrect={form.feedbackIncorrect}
              graderInfo={form.graderInfo}
              mode={view}
            />
          )}
        </div>

        <footer className="border-t border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <SaveStatus status={autosaveStatus} showHint={isDirty} />
              {autosaveStatus === 'failed' && (
                <button
                  onClick={saveNow}
                  title={failureMessage ?? 'Gagal menyimpan'}
                  className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Coba Lagi
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
              <button
                ref={cancelRef}
                onClick={() => (saving ? null : requestClose())}
                disabled={saving}
                className={`${buttonClassNames('secondary')} flex-1 sm:flex-none`}
              >
                Batal
              </button>
              <button
                onClick={() => void doSave(false)}
                disabled={saving}
                className={`${buttonClassNames('primary')} flex-1 sm:flex-none`}
              >
                {saving ? 'Menyimpan…' : 'Simpan'}
              </button>
              <button
                onClick={() => void doSave(true)}
                disabled={saving}
                className="flex-1 rounded-md border border-emerald-300 bg-white px-3.5 py-2 text-sm font-medium whitespace-nowrap text-emerald-700 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 active:scale-[0.98] disabled:active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed sm:flex-none"
              >
                {saving ? 'Menyimpan…' : 'Simpan & Soal Lain'}
              </button>
            </div>
          </div>
        </footer>
      </div>

      {confirmingClose && (
        <DialogSurface
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          panelClassName="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
          role="alertdialog"
          ariaLabel="Buang perubahan?"
          dataTestid="discard-confirm-dialog"
        >
          <h3 className="text-lg font-semibold mb-2">Buang perubahan?</h3>
          <p className="text-sm text-gray-600 mb-6">
            Soal ini memiliki perubahan yang belum disimpan. Perubahan Anda akan hilang.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setConfirmingClose(false)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Lanjutkan mengedit
            </button>
            <button
              onClick={() => {
                clearStoredDraft(draftKeyValue);
                onClose();
              }}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Buang
            </button>
          </div>
        </DialogSurface>
      )}

      {confirmingTypeChange && pendingType && (
        <DialogSurface
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
          panelClassName="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
          role="alertdialog"
          ariaLabel="Ganti jenis soal?"
          dataTestid="question-type-confirm"
          onClose={cancelTypeChange}
        >
          <h3 className="text-lg font-semibold mb-2">Ganti jenis soal?</h3>
          <p className="text-sm text-gray-600 mb-6">
            Mengganti ke {QUESTION_TYPE_LABELS[pendingType]} akan membangun ulang pilihan
            jawaban{` `}
            {pendingType === 'true_false'
              ? 'menjadi Benar / Salah otomatis'
              : pendingType === 'short_answer'
                ? 'menjadi satu jawaban kosong'
                : pendingType === 'essay'
                  ? 'dan menghapus daftar pilihan'
                  : pendingType === 'matching'
                    ? 'menjadi tiga pasangan kosong'
                    : 'menjadi pilihan kosong'}
            . Opsi yang sudah diketik akan hilang.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={cancelTypeChange}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              onClick={() => applyTypeChange(pendingType)}
              data-testid="question-type-confirm-accept"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Ganti Jenis
            </button>
          </div>
        </DialogSurface>
      )}
    </div>
  );
}