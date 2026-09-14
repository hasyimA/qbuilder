<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class QuizResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
            'subject' => $this->subject,
            'grade_level' => $this->grade_level,
            'category' => $this->category,
            'status' => $this->status->value,
            'visibility' => $this->visibility->value,
            'questions_count' => $this->whenCounted('questions'),
            'question_types' => $this->questionTypes(),
            'owner' => $this->whenLoaded('user', fn () => [
                'id' => $this->user->id,
                'name' => $this->user->name,
            ]),
            'tags' => $this->whenLoaded('tags', fn () => $this->tags->map(
                fn ($tag) => ['id' => $tag->id, 'name' => $tag->name, 'slug' => $tag->slug]
            )->values()),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }

    /**
     * Distinct question types attached to this quiz. Index/shared listings carry
     * `question_types_raw` from the `withQuestionTypes` scope; single-quiz paths
     * fall back to the loaded `questions` relation when present.
     */
    private function questionTypes(): array
    {
        $attributes = $this->resource->getAttributes();

        if (array_key_exists('question_types_raw', $attributes)) {
            $raw = $attributes['question_types_raw'];

            return $raw === null || $raw === ''
                ? []
                : collect(explode(',', $raw))
                    ->map(fn ($type) => trim((string) $type))
                    ->filter()
                    ->values()
                    ->all();
        }

        if ($this->resource->relationLoaded('questions')) {
            return $this->resource->questions
                ->pluck('type')
                ->map(fn ($type) => $type->value ?? $type)
                ->unique()
                ->values()
                ->sort()
                ->values()
                ->all();
        }

        return [];
    }
}
