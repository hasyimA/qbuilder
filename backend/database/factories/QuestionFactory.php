<?php

namespace Database\Factories;

use App\Enums\QuestionStatus;
use App\Enums\QuestionType;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class QuestionFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'type' => QuestionType::MultipleChoice,
            'content' => [
                'type' => 'doc',
                'content' => [
                    [
                        'type' => 'paragraph',
                        'content' => [
                            ['type' => 'text', 'text' => fake()->sentence()],
                        ],
                    ],
                ],
            ],
            'default_mark' => 1.00,
            'status' => QuestionStatus::Complete,
        ];
    }

    public function multipleChoice(): static
    {
        return $this->state(fn () => ['type' => QuestionType::MultipleChoice]);
    }

    public function trueFalse(): static
    {
        return $this->state(fn () => ['type' => QuestionType::TrueFalse]);
    }

    public function shortAnswer(): static
    {
        return $this->state(fn () => ['type' => QuestionType::ShortAnswer]);
    }

    public function essay(): static
    {
        return $this->state(fn () => ['type' => QuestionType::Essay]);
    }

    public function draft(): static
    {
        return $this->state(fn () => ['status' => QuestionStatus::Draft]);
    }
}
