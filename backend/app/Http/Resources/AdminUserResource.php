<?php

namespace App\Http\Resources;

use App\Models\Question;
use App\Models\Quiz;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Str;

/**
 * Admin-facing user representation. Never exposes password hashes, remember
 * tokens, or Sanctum tokens — those are hidden on the model and never selected
 * into this payload. Counts and the recent-activity lists only appear when the
 * controller eager-loads/counts them.
 */
class AdminUserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role->value,
            'status' => $this->status->value,
            'quizzes_count' => $this->whenCounted('quizzes'),
            'questions_count' => $this->whenCounted('questions'),
            'media_count' => $this->whenCounted('media'),
            'recent_quizzes' => $this->whenLoaded('quizzes', fn () => $this->quizzes->map(
                fn (Quiz $quiz) => [
                    'id' => $quiz->id,
                    'title' => $quiz->title,
                    'status' => $quiz->status->value,
                    'updated_at' => $quiz->updated_at,
                ]
            )->values()),
            'recent_questions' => $this->whenLoaded('questions', fn () => $this->questions->map(
                fn (Question $question) => [
                    'id' => $question->id,
                    'type' => $question->type->value,
                    'status' => $question->status->value,
                    'excerpt' => Str::limit((string) $question->search_text, 120),
                    'updated_at' => $question->updated_at,
                ]
            )->values()),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
