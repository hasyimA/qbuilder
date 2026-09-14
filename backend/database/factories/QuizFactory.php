<?php

namespace Database\Factories;

use App\Enums\QuizStatus;
use App\Enums\QuizVisibility;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class QuizFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'title' => fake()->sentence(),
            'description' => fake()->paragraph(),
            'subject' => fake()->randomElement(['Network System', 'Database', 'Programming', 'Hardware']),
            'grade_level' => fake()->randomElement(['X', 'XI', 'XII']),
            'category' => fake()->randomElement(['UTS', 'UAS', 'Quiz', 'Tugas']),
            'status' => QuizStatus::Draft,
            'visibility' => QuizVisibility::Private,
        ];
    }

    public function published(): static
    {
        return $this->state(fn () => ['status' => QuizStatus::Published]);
    }

    public function archived(): static
    {
        return $this->state(fn () => ['status' => QuizStatus::Archived]);
    }
}
