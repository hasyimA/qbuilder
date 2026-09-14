<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class MediaFactory extends Factory
{
    public function definition(): array
    {
        $filename = fake()->uuid().'.png';

        return [
            'user_id' => User::factory(),
            'filename' => $filename,
            'mime_type' => 'image/png',
            'size' => fake()->numberBetween(1000, 5000000),
            'storage_path' => 'media/'.fake()->uuid().'/'.$filename,
            'width' => fake()->numberBetween(100, 1920),
            'height' => fake()->numberBetween(100, 1080),
            'alt_text' => fake()->sentence(3),
        ];
    }
}
