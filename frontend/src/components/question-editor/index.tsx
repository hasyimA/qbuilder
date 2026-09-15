'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DocContent,
  Question,
  QuestionPayload,
  QuestionType,
} from '@/lib/types';
import { QUESTION_TYPE_LABELS } from '@/lib/types';
import { docToPlainText, emptyDoc, textToDoc } from '@/lib/content';
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
import QuestionPreview, { type PreviewMode } from './question-preview';
import SaveStatus from './save-status';
import { DialogSurface, useFocusTrap } from '@/components/ui/dialog';
import type { Editor } from '@tiptap/react';

interface OptionDraft {
  key: string;
  id?: number;
  text: string;
  is_correct: boolean;
  feedback: string;
}

export interface QuestionFormState {
  type: QuestionType;
  questionContent: DocContent;
  defaultMark: string;
  options: OptionDraft[];
}

const TYPE_ORDER: QuestionType[] = ['multiple_choice', 'true_false', 'short_answer', 'essay'];

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

function defaultOptionsForType(type: QuestionType): OptionDraft[] {
  switch (type) {
    case 'true_false':
      return [
        { key: nextKey(), text: 'True', is_correct: true, feedback: '' },
        { key: nextKey(), text: 'False', is_correct: false, feedback: '' },
      ];
    case 'short_answer':
      return [{ key: nextKey(), text: '', is_correct: true, feedback: '' }];
    case 'multiple_choice':
      return [
        { key: nextKey(), text: '', is_correct: false, feedback: '' },
        { key: nextKey(), text: '', is_correct: false, feedback: '' },
        { key: nextKey(), text: '', is_correct: false, feedback: '' },
        { key: nextKey(), text: '', is_correct: false, feedback: '' },
      ];
    case 'essay':
      return [];
  }
}

function formFromQuestion(question: Question | null, defaultType: QuestionType | null): QuestionFormState {
  if (question) {
    const options: OptionDraft[] = (question.options || []).map((opt) => ({
      key: opt.id ? `srv-${opt.id}` : nextKey(),
      id: opt.id,
      text: docToPlainText(opt.content),
      is_correct: Boolean(opt.is_correct),
      feedback: docToPlainText(opt.feedback ?? null),
    }));

    if (question.type === 'true_false' && options.length === 0) {
      options.push({ key: nextKey(), text: 'True', is_correct: true, feedback: '' });
      options.push({ key: nextKey(), text: 'False', is_correct: false, feedback: '' });
    }

    return {
      type: question.type,
      questionContent: canonicalizeDoc(question.content) ?? emptyDoc(),
      defaultMark: String(question.default_mark ?? 1),
      options,
    };
  }

  return {
    type: defaultType ?? 'multiple_choice',
    questionContent: emptyDoc(),
    defaultMark: '1',
    options: defaultOptionsForType(defaultType ?? 'multiple_choice'),
  };
}

function formToDraft(form: QuestionFormState): QuestionDraftData {
  return {
    type: form.type,
    questionContent: form.questionContent,
    defaultMark: form.defaultMark,
    options: form.options.map((opt) => ({
      key: opt.key,
      id: opt.id,
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
    options: draft.options.map((opt) => ({
      key: opt.key,
      id: opt.id,
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
    const options =
      form.type === 'multiple_choice' ||
      form.type === 'true_false' ||
      form.type === 'short_answer'
        ? form.options.map((opt) => ({
            ...(opt.id ? { id: opt.id } : {}),
            content: textToDoc(opt.text),
            is_correct: opt.is_correct,
            fraction: opt.is_correct ? 100 : 0,
            feedback: opt.feedback.trim() ? textToDoc(opt.feedback) : null,
          }))
        : undefined;

    return {
      type: form.type,
      content: canonicalizeDoc(form.questionContent) ?? emptyDoc(),
      default_mark: Number(parseFloat(form.defaultMark) || 0),
      status: 'complete',
      options,
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

  function setType(type: QuestionType) {
    setForm((prev) => {
      const base = {
        ...prev,
        type,
        options:
          prev.options.length > 0 && (type === prev.type || type === 'true_false')
            ? prev.options
            : defaultOptionsForType(type),
      };
      if (type === 'essay') base.options = [];
      if (type === 'short_answer' && prev.options.length === 0) {
        base.options = [{ key: nextKey(), text: '', is_correct: true, feedback: '' }];
      }
      return base;
    });
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
      options: [...prev.options, { key: nextKey(), text: '', is_correct: false, feedback: '' }],
    }));
  }

  function applyBulkOptions(texts: string[]) {
    setForm((prev) => ({
      ...prev,
      options: texts.map((text, index) => ({
        key: nextKey(),
        text,
        is_correct: prev.type === 'short_answer' && index === 0,
        feedback: '',
      })),
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
      } else if (form.options.some((opt) => !opt.text.trim())) {
        nextErrors.options = 'Setiap pilihan jawaban harus memiliki teks.';
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
      className="fixed inset-0 z-50 flex justify-end"
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
        className="relative flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">
              {isEdit ? 'Edit Soal' : 'Soal Baru'}
            </h2>
            <p className="text-sm text-gray-500">
              {isEdit ? `Soal #${question?.sort_order !== undefined ? question.sort_order + 1 : question?.id}` : 'Buat soal baru'}
            </p>
          </div>

          <div
            role="group"
            aria-label="Tampilan"
            className="flex flex-none items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5"
          >
            {(['edit', 'teacher', 'student'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                aria-pressed={view === mode}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
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
            className="rounded p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label="Tutup editor"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
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
          <div role="group" aria-label="Jenis soal">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Jenis Soal
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TYPE_ORDER.map((type) => {
                const active = form.type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setType(type)}
                    aria-pressed={active}
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
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label
                htmlFor="question-text"
                className="block text-sm font-medium text-gray-700"
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
                <h3 className="text-sm font-medium text-gray-700">
                  {form.type === 'multiple_choice'
                    ? 'Pilihan Jawaban'
                    : form.type === 'true_false'
                      ? 'Pilihan Benar / Salah'
                      : 'Jawaban Diterima'}
                </h3>
              </div>

              {errors.options && (
                <p className="mb-2 text-sm text-red-600">{errors.options}</p>
              )}

              <ul className="space-y-2">
                {form.options.map((opt, index) => (
                  <li
                    key={opt.key}
                    className={`flex items-center gap-2 rounded-md border px-2 py-2 ${
                      opt.is_correct ? 'border-green-400 bg-green-50' : 'border-gray-300'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => markCorrect(opt.key)}
                      className="flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 border-gray-400 hover:border-green-500 aria-pressed:bg-green-500"
                      aria-pressed={opt.is_correct}
                      aria-label={opt.is_correct ? 'Ditandai benar (klik untuk membatalkan)' : 'Tandai pilihan ini sebagai benar'}
                      style={opt.is_correct ? { background: '#22c55e', borderColor: '#22c55e' } : undefined}
                    >
                      {opt.is_correct && (
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    <span className="w-6 flex-none text-right text-sm text-gray-400">
                      {String.fromCharCode(65 + index)}
                    </span>

                    <input
                      type="text"
                      value={opt.text}
                      onChange={(e) => setOption(opt.key, { text: e.target.value })}
                      className="min-w-0 flex-1 rounded border px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
                      placeholder={
                        form.type === 'short_answer'
                          ? 'Teks jawaban yang diterima'
                          : `Pilihan ${String.fromCharCode(65 + index)}`
                      }
                      aria-label={`Pilihan ${String.fromCharCode(65 + index)}`}
                    />

                    {form.options.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeOption(opt.key)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Hapus pilihan ${String.fromCharCode(65 + index)}`}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => moveOption(opt.key, 1)}
                      disabled={index === form.options.length - 1}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                      aria-label={`Pindahkan pilihan ${String.fromCharCode(65 + index)} ke bawah`}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => moveOption(opt.key, -1)}
                      disabled={index === 0}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                      aria-label={`Pindahkan pilihan ${String.fromCharCode(65 + index)} ke atas`}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>

              {(form.type === 'multiple_choice' || form.type === 'short_answer') && (
                <OptionBulkPaste
                  onApply={applyBulkOptions}
                  allowPlainLines={form.type === 'short_answer'}
                />
              )}

              {form.type === 'multiple_choice' && (
                <button
                  type="button"
                  onClick={addOption}
                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Tambah Pilihan
                </button>
              )}
            </div>
          )}

          <div>
            <label
              htmlFor="default-mark"
              className="block text-sm font-medium text-gray-700 mb-1"
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
                text: option.text,
                is_correct: option.is_correct,
              }))}
              mode={view}
            />
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t bg-white px-6 py-4">
          <SaveStatus status={autosaveStatus} showHint={isDirty} />
          {autosaveStatus === 'failed' && (
            <button
              onClick={saveNow}
              title={failureMessage ?? 'Gagal menyimpan'}
              className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4.5 9a8 8 0 0113.9-2.4M19.5 15a8 8 0 01-13.9 2.4" />
              </svg>
              Coba Lagi
            </button>
          )}
          <button
            ref={cancelRef}
            onClick={() => (saving ? null : requestClose())}
            disabled={saving}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={() => void doSave(false)}
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
          <button
            onClick={() => void doSave(true)}
            disabled={saving}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Menyimpan…' : 'Simpan & Soal Lain'}
          </button>
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
    </div>
  );
}