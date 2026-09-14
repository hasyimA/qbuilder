<?php

namespace App\Models;

use App\Enums\QuizStatus;
use App\Enums\QuizVisibility;
use Database\Factories\QuizFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

#[Fillable(['user_id', 'title', 'description', 'subject', 'grade_level', 'category', 'status', 'visibility'])]
#[Hidden([])]
class Quiz extends Model
{
    /** @use HasFactory<QuizFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return [
            'status' => QuizStatus::class,
            'visibility' => QuizVisibility::class,
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function questions(): BelongsToMany
    {
        return $this->belongsToMany(Question::class, 'quiz_questions')
            ->withPivot('sort_order')
            ->orderByPivot('sort_order');
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class, 'quiz_tag');
    }

    /**
     * Adds `question_types_raw` — a comma-separated list of the DISTINCT question
     * types attached to each quiz, via a single correlated subquery (no N+1
     * even for a page full of big quizzes).
     */
    public function scopeWithQuestionTypes(Builder $query): Builder
    {
        return $query->addSelect([
            'question_types_raw' => Question::query()
                ->selectRaw('GROUP_CONCAT(DISTINCT questions.type)')
                ->join('quiz_questions', 'questions.id', '=', 'quiz_questions.question_id')
                ->whereColumn('quiz_questions.quiz_id', 'quizzes.id'),
        ]);
    }
}
