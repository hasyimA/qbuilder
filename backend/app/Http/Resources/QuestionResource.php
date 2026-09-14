<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class QuestionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type->value,
            'content' => $this->content,
            'default_mark' => $this->default_mark,
            'feedback_general' => $this->feedback_general,
            'feedback_correct' => $this->feedback_correct,
            'feedback_incorrect' => $this->feedback_incorrect,
            'category' => $this->category,
            'difficulty' => $this->difficulty,
            'status' => $this->status->value,
            'used_in_count' => $this->whenCounted('quizzes'),
            'tags' => TagResource::collection($this->whenLoaded('tags')),
            'sort_order' => $this->whenPivotLoaded('quiz_questions', fn () => $this->pivot->sort_order),
            'options' => QuestionOptionResource::collection($this->whenLoaded('options')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
