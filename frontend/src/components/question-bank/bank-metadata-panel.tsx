'use client';

const DIFFICULTY_OPTIONS = [
  { value: '', label: 'Tanpa tingkat' },
  { value: 'easy', label: 'Mudah' },
  { value: 'medium', label: 'Sedang' },
  { value: 'hard', label: 'Sulit' },
];

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draf' },
  { value: 'complete', label: 'Lengkap' },
] as const;

interface Props {
  category: string;
  onCategoryChange: (value: string) => void;
  difficulty: string;
  onDifficultyChange: (value: string) => void;
  tagsText: string;
  onTagsTextChange: (value: string) => void;
  status: 'draft' | 'complete';
  onStatusChange: (value: 'draft' | 'complete') => void;
}

export default function BankMetadataPanel({
  category,
  onCategoryChange,
  difficulty,
  onDifficultyChange,
  tagsText,
  onTagsTextChange,
  status,
  onStatusChange,
}: Props) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="bank-meta-category" className="block text-sm font-medium text-gray-700 mb-1">
          Kategori
        </label>
        <input
          id="bank-meta-category"
          data-testid="bank-meta-category"
          type="text"
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          placeholder="cth: Matematika"
          className="w-full rounded border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="bank-meta-difficulty" className="block text-sm font-medium text-gray-700 mb-1">
          Tingkat Kesulitan
        </label>
        <select
          id="bank-meta-difficulty"
          data-testid="bank-meta-difficulty"
          value={difficulty}
          onChange={(e) => onDifficultyChange(e.target.value)}
          className="w-full rounded border bg-white px-3 py-2 text-sm"
        >
          {DIFFICULTY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="bank-meta-tags" className="block text-sm font-medium text-gray-700 mb-1">
          Tag
        </label>
        <input
          id="bank-meta-tags"
          data-testid="bank-meta-tags"
          type="text"
          value={tagsText}
          onChange={(e) => onTagsTextChange(e.target.value)}
          placeholder="pisahkan dengan koma, cth: ujian, semester, kimia"
          className="w-full rounded border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="bank-meta-status" className="block text-sm font-medium text-gray-700 mb-1">
          Status
        </label>
        <select
          id="bank-meta-status"
          data-testid="bank-meta-status"
          value={status}
          onChange={(e) => onStatusChange(e.target.value as 'draft' | 'complete')}
          className="w-full rounded border bg-white px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          Soal status Lengkap siap dipakai; Draf masih bisa diedit kapan pun.
        </p>
      </div>
    </div>
  );
}