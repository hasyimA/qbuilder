<?php

namespace App\Services;

use App\Enums\QuizStatus;
use App\Enums\QuizVisibility;
use App\Models\Question;
use App\Models\Quiz;
use App\Models\QuizQuestion;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class QuizService
{
    public function __construct(
        private QuestionService $questionService
    ) {}

    public function create(array $data, User $user): Quiz
    {
        return Quiz::create([
            ...$data,
            'user_id' => $user->id,
            'status' => QuizStatus::Draft,
            'visibility' => QuizVisibility::Private,
        ]);
    }

    public function update(Quiz $quiz, array $data): Quiz
    {
        $quiz->update($data);

        return $quiz->fresh();
    }

    public function delete(Quiz $quiz): bool
    {
        return $quiz->delete();
    }

    /**
     * Paginated library listing with search, filters and sorting.
     *
     * `$tab` selects the scope: `mine` (owned by the user) or `shared`
     * (public/school quizzes owned by someone else — read-only, clone to edit).
     *
     * @param  array<string, mixed>  $filters
     */
    public function listQuizzes(User $user, array $filters = [], int $perPage = 20, string $tab = 'mine'): LengthAwarePaginator
    {
        $query = Quiz::query()
            ->with(['user:id,name', 'tags:id,name,slug', 'questions:id,type'])
            ->withCount('questions');

        if ($tab === 'shared') {
            $query->where('user_id', '!=', $user->id)
                ->whereIn('visibility', [QuizVisibility::Public, QuizVisibility::School]);
        } else {
            $query->where('user_id', $user->id);
        }

        $search = trim((string) ($filters['search'] ?? ''));
        if ($search !== '') {
            $query->where(function ($builder) use ($search) {
                $builder->where('title', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $this->applyEnumeratedFilter($query, 'status', $filters['status'] ?? null);

        $category = trim((string) ($filters['category'] ?? ''));
        if ($category !== '') {
            $query->where('category', 'like', "%{$category}%");
        }

        $tag = trim((string) ($filters['tag'] ?? ''));
        if ($tag !== '') {
            $query->whereHas('tags', fn ($builder) => $builder->where('name', $tag)
                ->orWhere('slug', $tag));
        }

        $type = (string) ($filters['type'] ?? '');
        if ($type !== '') {
            $query->whereHas('questions', fn ($builder) => $builder->where('type', $type));
        }

        $min = filter_var($filters['min_questions'] ?? null, FILTER_VALIDATE_INT);
        $max = filter_var($filters['max_questions'] ?? null, FILTER_VALIDATE_INT);
        if ($min !== false && $min !== null && $min >= 0) {
            $query->has('questions', '>=', (int) $min);
        }
        if ($max !== false && $max !== null && $max >= 0) {
            $query->has('questions', '<=', (int) $max);
        }

        $this->applyDateFilter($query, 'updated_from', '>=', $filters['updated_from'] ?? null);
        $this->applyDateFilter($query, 'updated_to', '<=', $filters['updated_to'] ?? null);

        $sort = in_array($filters['sort'] ?? '', ['title', 'created_at', 'updated_at'], true)
            ? (string) $filters['sort']
            : 'updated_at';
        $direction = ($filters['sort_dir'] ?? '') === 'asc' ? 'asc' : 'desc';

        return $query->orderBy($sort, $direction)->paginate($perPage);
    }

    /**
     * Clone a quiz (and its questions/options/tags) for a given user.
     * The copy always starts private + draft and belongs to $user — this is how
     * a user works with a quiz they don't own.
     */
    public function duplicate(Quiz $quiz, User $user): Quiz
    {
        $copy = $quiz->replicate();
        $copy->user_id = $user->id;
        $copy->title = $this->buildDuplicateTitle($quiz->title);
        $copy->status = QuizStatus::Draft;
        $copy->visibility = QuizVisibility::Private;
        unset($copy->created_at, $copy->updated_at);

        $copy->save();

        foreach ($quiz->tags as $tag) {
            $copy->tags()->attach($tag->id);
        }

        foreach ($quiz->questions as $question) {
            $this->questionService->duplicateIntoQuiz($question, $copy, $user->id);
        }

        return $copy->loadCount('questions')
            ->load(['user:id,name', 'tags:id,name,slug'])
            ->setAttribute('question_types_raw', $this->questionTypesRaw($copy));
    }

    /** Lightweight option lists for the dashboard filter controls. */
    public function filtersMeta(User $user): array
    {
        $visible = fn ($query) => $query->where(fn ($where) => $where
            ->where('user_id', $user->id)
            ->orWhere(fn ($shared) => $shared
                ->where('user_id', '!=', $user->id)
                ->whereIn('visibility', [QuizVisibility::Public, QuizVisibility::School])));

        $categories = Quiz::query()
            ->where($visible)
            ->whereNotNull('category')
            ->where('category', '!=', '')
            ->distinct()
            ->orderBy('category')
            ->pluck('category')
            ->values();

        $visibleIds = Quiz::query()->where($visible)->pluck('id');
        $tags = Tag::query()
            ->whereHas('quizzes', fn ($query) => $query->whereIn('quizzes.id', $visibleIds->all()))
            ->orderBy('name')
            ->get(['id', 'name', 'slug']);

        return [
            'categories' => $categories->all(),
            'tags' => $tags->map(
                fn (Tag $tag) => ['id' => $tag->id, 'name' => $tag->name, 'slug' => $tag->slug]
            )->values()->all(),
            'types' => ['multiple_choice', 'true_false', 'short_answer', 'essay'],
        ];
    }

    public function reorderQuestions(Quiz $quiz, array $questionIds): void
    {
        foreach ($questionIds as $index => $questionId) {
            QuizQuestion::where('quiz_id', $quiz->id)
                ->where('question_id', $questionId)
                ->update(['sort_order' => $index]);
        }
    }

    private function applyEnumeratedFilter($query, string $column, mixed $value): void
    {
        $value = trim((string) $value);
        if ($value !== '') {
            $query->where($column, $value);
        }
    }

    private function applyDateFilter($query, string $field, string $operator, mixed $value): void
    {
        $value = trim((string) $value);
        if ($value !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) === 1) {
            $query->whereDate('updated_at', $operator, $value);
        }
    }

    private function buildDuplicateTitle(string $title): string
    {
        $suffix = ' (Salinan)';
        $title = trim($title);

        return mb_substr($title, 0, 255 - mb_strlen($suffix)).$suffix;
    }

    private function questionTypesRaw(Quiz $quiz): string
    {
        return Question::query()
            ->whereHas('quizzes', fn ($query) => $query->whereKey($quiz->getKey()))
            ->distinct()
            ->pluck('type')
            ->map(fn ($type) => $type->value ?? $type)
            ->implode(',');
    }
}
