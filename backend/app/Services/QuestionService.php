<?php

namespace App\Services;

use App\Enums\QuestionStatus;
use App\Models\Question;
use App\Models\Quiz;
use App\Models\QuizQuestion;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class QuestionService
{
    public function create(array $data, User $user, ?Quiz $quiz = null): Question
    {
        $options = $data['options'] ?? [];
        $tags = $data['tags'] ?? null;
        unset($data['options'], $data['tags']);

        $question = Question::create([
            ...$data,
            'user_id' => $user->id,
            'status' => $data['status'] ?? QuestionStatus::Draft,
        ]);

        if ($quiz) {
            $maxSortOrder = QuizQuestion::where('quiz_id', $quiz->id)->max('sort_order');
            $quiz->questions()->attach($question->id, [
                'sort_order' => ($maxSortOrder ?? -1) + 1,
            ]);
        }

        $this->syncOptions($question, $options);
        if (is_array($tags)) {
            $this->syncTags($question, $tags);
        }
        $this->refreshSearchText($question);

        return $question->load('options', 'tags');
    }

    public function update(Question $question, array $data): Question
    {
        if (isset($data['options'])) {
            $options = $data['options'];
            unset($data['options']);
            $this->syncOptions($question, $options);
        }

        if (array_key_exists('tags', $data)) {
            $tags = $data['tags'];
            unset($data['tags']);
            if (is_array($tags)) {
                $this->syncTags($question, $tags);
            }
        }

        $question->update($data);
        $this->refreshSearchText($question);

        return $question->fresh()->load('options', 'tags');
    }

    public function delete(Question $question): bool
    {
        return $question->delete();
    }

    public function duplicate(Question $question, ?int $ownerId = null): Question
    {
        $copy = $question->replicate();
        if ($ownerId !== null) {
            $copy->user_id = $ownerId;
        }
        $copy->status = QuestionStatus::Draft;
        $copy->save();

        foreach ($question->options as $option) {
            $copyOption = $option->replicate();
            $copyOption->question_id = $copy->id;
            $copyOption->save();
        }

        if ($question->relationLoaded('tags') || $question->tags()->exists()) {
            $this->syncTags($copy, $question->tags->pluck('name')->all());
        }
        $this->refreshSearchText($copy);

        return $copy->load('options', 'tags');
    }

    public function duplicateIntoQuiz(Question $question, Quiz $quiz, ?int $ownerId = null): Question
    {
        $copy = $this->duplicate($question, $ownerId);

        $maxSortOrder = QuizQuestion::where('quiz_id', $quiz->id)->max('sort_order');
        $quiz->questions()->attach($copy->id, [
            'sort_order' => ($maxSortOrder ?? -1) + 1,
        ]);

        return $copy;
    }

    public function attachToQuiz(Quiz $quiz, Question $question): QuizQuestion
    {
        if (QuizQuestion::where('quiz_id', $quiz->id)->where('question_id', $question->id)->exists()) {
            throw new \DomainException('Question already in this quiz.');
        }

        $maxSortOrder = QuizQuestion::where('quiz_id', $quiz->id)->max('sort_order');

        return QuizQuestion::create([
            'quiz_id' => $quiz->id,
            'question_id' => $question->id,
            'sort_order' => ($maxSortOrder ?? -1) + 1,
        ]);
    }

    public function detachFromQuiz(Quiz $quiz, Question $question): int
    {
        return QuizQuestion::where('quiz_id', $quiz->id)
            ->where('question_id', $question->id)
            ->delete();
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    public function listQuestions(User $user, array $filters, int $perPage, string $sort, string $sortDir)
    {
        $query = Question::query()
            ->with('tags')
            ->withCount('quizzes')
            ->where('user_id', $user->id);

        if ($search = $filters['search'] ?? null) {
            $query->where(function (Builder $builder) use ($search) {
                $builder->where('search_text', 'like', '%'.Str::lower($search).'%')
                    ->orWhere('category', 'like', "%{$search}%");
            });
        }

        if ($status = $filters['status'] ?? null) {
            $query->where('status', $status);
        }

        if ($type = $filters['type'] ?? null) {
            $query->where('type', $type);
        }

        if ($category = $filters['category'] ?? null) {
            $query->where('category', 'like', "%{$category}%");
        }

        if ($difficulty = $filters['difficulty'] ?? null) {
            $query->where('difficulty', $difficulty);
        }

        if ($tag = $filters['tag'] ?? null) {
            $query->whereHas('tags', fn (Builder $builder) => $builder
                ->where('name', $tag)
                ->orWhere('slug', $tag));
        }

        if (($updatedFrom = $filters['updated_from'] ?? null) && $updatedFrom instanceof Carbon) {
            $query->whereDate('updated_at', '>=', $updatedFrom);
        }

        if (($updatedTo = $filters['updated_to'] ?? null) && $updatedTo instanceof Carbon) {
            $query->whereDate('updated_at', '<=', $updatedTo);
        }

        $sortColumn = in_array($sort, ['created_at', 'updated_at', 'status', 'type', 'default_mark'], true)
            ? $sort
            : 'updated_at';

        return $query
            ->orderBy($sortColumn, $sortDir === 'asc' ? 'asc' : 'desc')
            ->paginate($perPage);
    }

    public function filtersMeta(User $user): array
    {
        $questions = Question::query()->where('user_id', $user->id);

        $categories = (clone $questions)
            ->whereNotNull('category')
            ->where('category', '!=', '')
            ->distinct()
            ->orderBy('category')
            ->pluck('category')
            ->all();

        $difficulties = (clone $questions)
            ->whereNotNull('difficulty')
            ->where('difficulty', '!=', '')
            ->distinct()
            ->orderBy('difficulty')
            ->pluck('difficulty')
            ->all();

        $tagIds = (clone $questions)->pluck('id');
        $tags = Tag::query()
            ->whereHas('questions', fn (Builder $builder) => $builder->whereIn('questions.id', $tagIds))
            ->orderBy('name')
            ->get(['id', 'name', 'slug']);

        return [
            'categories' => $categories,
            'difficulties' => $difficulties,
            'tags' => $tags,
            'statuses' => [
                ['value' => 'draft', 'label' => 'Draft'],
                ['value' => 'complete', 'label' => 'Complete'],
            ],
            'types' => [
                ['value' => 'multiple_choice', 'label' => 'Multiple Choice'],
                ['value' => 'true_false', 'label' => 'True / False'],
                ['value' => 'short_answer', 'label' => 'Short Answer'],
                ['value' => 'essay', 'label' => 'Essay'],
                ['value' => 'matching', 'label' => 'Matching'],
            ],
        ];
    }

    public function syncOptions(Question $question, array $options): void
    {
        $existingIds = $question->options()->pluck('id')->toArray();
        $incomingIds = [];

        foreach ($options as $index => $optionData) {
            $optionId = $optionData['id'] ?? null;

            $matchAnswer = isset($optionData['match_answer']) && is_string($optionData['match_answer'])
                ? trim($optionData['match_answer'])
                : null;

            if ($optionId && in_array($optionId, $existingIds)) {
                $question->options()->where('id', $optionId)->update([
                    'content' => $optionData['content'],
                    'match_answer' => $matchAnswer === '' ? null : $matchAnswer,
                    'is_correct' => $optionData['is_correct'] ?? false,
                    'fraction' => $optionData['fraction'] ?? ($optionData['is_correct'] ?? false ? 100.00 : 0.00),
                    'feedback' => $optionData['feedback'] ?? null,
                    'sort_order' => $index,
                ]);
                $incomingIds[] = $optionId;
            } else {
                $question->options()->create([
                    'content' => $optionData['content'],
                    'match_answer' => $matchAnswer === '' ? null : $matchAnswer,
                    'is_correct' => $optionData['is_correct'] ?? false,
                    'fraction' => $optionData['fraction'] ?? ($optionData['is_correct'] ?? false ? 100.00 : 0.00),
                    'feedback' => $optionData['feedback'] ?? null,
                    'sort_order' => $index,
                ]);
                $incomingIds[] = $optionData['id'] ?? 0;
            }
        }

        $toDelete = array_diff($existingIds, $incomingIds);
        if ($toDelete) {
            $question->options()->whereIn('id', $toDelete)->delete();
        }
    }

    public function reorder(Quiz $quiz, array $questionIds): void
    {
        foreach ($questionIds as $index => $questionId) {
            QuizQuestion::where('quiz_id', $quiz->id)
                ->where('question_id', $questionId)
                ->update(['sort_order' => $index]);
        }
    }

    /**
     * Attach tags by name, creating any that don't exist.
     *
     * @param  array<int, string>  $tagNames
     */
    public function syncTags(Question $question, array $tagNames): void
    {
        $ids = [];
        foreach (array_filter(array_map('trim', $tagNames)) as $name) {
            $tag = Tag::query()->firstOrCreate(['name' => $name]);
            $ids[] = $tag->id;
        }

        $question->tags()->sync($ids);
    }

    private function refreshSearchText(Question $question): void
    {
        $validator = new DocumentValidator;
        $parts = [$validator->plainText($question->content)];

        foreach ($question->options as $option) {
            $parts[] = $validator->plainText($option->content);
            $parts[] = $validator->plainText($option->feedback);
            if (is_string($option->match_answer) && trim($option->match_answer) !== '') {
                $parts[] = $option->match_answer;
            }
        }

        foreach ([$question->category, $question->difficulty] as $field) {
            if (is_string($field) && trim($field) !== '') {
                $parts[] = $field;
            }
        }

        $question->search_text = Str::lower(implode("\n", array_filter(
            $parts,
            fn ($text) => is_string($text) && trim($text) !== ''
        )));
        $question->saveQuietly();
    }
}
