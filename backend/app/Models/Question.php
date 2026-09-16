<?php

namespace App\Models;

use App\Enums\QuestionStatus;
use App\Enums\QuestionType;
use App\Services\DocumentValidator;
use Database\Factories\QuestionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['user_id', 'type', 'content', 'default_mark', 'feedback_general', 'feedback_correct', 'feedback_incorrect', 'grader_info', 'category', 'difficulty', 'status', 'search_text'])]
#[Hidden([])]
class Question extends Model
{
    /** @use HasFactory<QuestionFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return [
            'type' => QuestionType::class,
            'content' => 'array',
            'default_mark' => 'decimal:2',
            'feedback_general' => 'array',
            'feedback_correct' => 'array',
            'feedback_incorrect' => 'array',
            'grader_info' => 'array',
            'status' => QuestionStatus::class,
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function options(): HasMany
    {
        return $this->hasMany(QuestionOption::class)->orderBy('sort_order');
    }

    public function quizzes(): BelongsToMany
    {
        return $this->belongsToMany(Quiz::class, 'quiz_questions')
            ->withPivot('sort_order');
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class, 'question_tag');
    }

    /**
     * Keeps `search_text` — the plain-text index used by the question bank
     * search — in sync with the rich-text `content` document whenever content
     * is (re)written, including factory and direct-save paths.
     */
    protected static function booted(): void
    {
        static::saving(function (Question $question) {
            if (! $question->exists || $question->isDirty('content')) {
                $question->search_text = (new DocumentValidator)->plainText($question->content);
            }
        });
    }
}
