<?php

namespace Database\Seeders;

use App\Enums\QuestionStatus;
use App\Enums\QuestionType;
use App\Models\Question;
use App\Models\QuestionOption;
use App\Models\Quiz;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $this->call(AdminUserSeeder::class);

        // Create test user
        $user = User::factory()->create([
            'name' => 'Test User',
            'email' => 'test@example.com',
        ]);

        // Create tags
        $tags = collect(['jaringan', 'database', 'hardware', 'programming', 'networking'])
            ->map(fn ($name) => Tag::create(['name' => $name, 'slug' => Str::slug($name)]));

        // Create quiz
        $quiz = Quiz::create([
            'user_id' => $user->id,
            'title' => 'UTS Network System XI',
            'description' => 'Ujian Tengah Semester - Network System',
            'subject' => 'Network System',
            'grade_level' => 'XI',
            'category' => 'UTS',
            'status' => 'draft',
            'visibility' => 'private',
        ]);

        $quiz->tags()->attach($tags->take(2)->pluck('id'));

        // Question 1: Multiple Choice
        $q1 = Question::create([
            'user_id' => $user->id,
            'type' => QuestionType::MultipleChoice,
            'content' => [
                'type' => 'doc',
                'content' => [
                    ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Perangkat yang digunakan untuk menghubungkan jaringan lokal ke internet adalah...']]],
                ],
            ],
            'default_mark' => 1.00,
            'status' => QuestionStatus::Complete,
        ]);

        QuestionOption::insert([
            ['question_id' => $q1->id, 'content' => json_encode(['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Router']]]]]), 'is_correct' => true, 'fraction' => 100.00, 'sort_order' => 0],
            ['question_id' => $q1->id, 'content' => json_encode(['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Switch']]]]]), 'is_correct' => false, 'fraction' => 0.00, 'sort_order' => 1],
            ['question_id' => $q1->id, 'content' => json_encode(['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Hub']]]]]), 'is_correct' => false, 'fraction' => 0.00, 'sort_order' => 2],
            ['question_id' => $q1->id, 'content' => json_encode(['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Access Point']]]]]), 'is_correct' => false, 'fraction' => 0.00, 'sort_order' => 3],
        ]);

        $quiz->questions()->attach($q1->id, ['sort_order' => 0]);

        // Question 2: True/False
        $q2 = Question::create([
            'user_id' => $user->id,
            'type' => QuestionType::TrueFalse,
            'content' => [
                'type' => 'doc',
                'content' => [
                    ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'HTTP menggunakan port 80 untuk komunikasi.']]],
                ],
            ],
            'default_mark' => 1.00,
            'status' => QuestionStatus::Complete,
        ]);

        QuestionOption::insert([
            ['question_id' => $q2->id, 'content' => json_encode(['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'True']]]]]), 'is_correct' => true, 'fraction' => 100.00, 'sort_order' => 0],
            ['question_id' => $q2->id, 'content' => json_encode(['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'False']]]]]), 'is_correct' => false, 'fraction' => 0.00, 'sort_order' => 1],
        ]);

        $quiz->questions()->attach($q2->id, ['sort_order' => 1]);

        // Question 3: Short Answer
        $q3 = Question::create([
            'user_id' => $user->id,
            'type' => QuestionType::ShortAnswer,
            'content' => [
                'type' => 'doc',
                'content' => [
                    ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Sebutkan 3 jenis topologi jaringan!']]],
                ],
            ],
            'default_mark' => 2.00,
            'status' => QuestionStatus::Complete,
        ]);

        $quiz->questions()->attach($q3->id, ['sort_order' => 2]);

        // Question 4: Essay
        $q4 = Question::create([
            'user_id' => $user->id,
            'type' => QuestionType::Essay,
            'content' => [
                'type' => 'doc',
                'content' => [
                    ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Jelaskan perbedaan antara TCP dan UDP!']]],
                ],
            ],
            'default_mark' => 5.00,
            'status' => QuestionStatus::Complete,
        ]);

        $quiz->questions()->attach($q4->id, ['sort_order' => 3]);
    }
}
