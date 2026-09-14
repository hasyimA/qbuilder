<?php

namespace Tests\Unit\Models;

use App\Enums\QuizStatus;
use App\Enums\QuizVisibility;
use App\Models\Question;
use App\Models\Quiz;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuizModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_quiz_belongs_to_user(): void
    {
        $user = User::factory()->create();
        $quiz = Quiz::factory()->create(['user_id' => $user->id]);

        $this->assertInstanceOf(User::class, $quiz->user);
        $this->assertEquals($user->id, $quiz->user_id);
    }

    public function test_quiz_has_many_questions(): void
    {
        $quiz = Quiz::factory()->create();
        $question = Question::factory()->create();
        $quiz->questions()->attach($question->id, ['sort_order' => 0]);

        $this->assertCount(1, $quiz->questions);
        $this->assertEquals($question->id, $quiz->questions->first()->id);
    }

    public function test_quiz_questions_are_ordered_by_sort_order(): void
    {
        $quiz = Quiz::factory()->create();
        $q1 = Question::factory()->create();
        $q2 = Question::factory()->create();
        $q3 = Question::factory()->create();

        $quiz->questions()->attach($q3->id, ['sort_order' => 2]);
        $quiz->questions()->attach($q1->id, ['sort_order' => 0]);
        $quiz->questions()->attach($q2->id, ['sort_order' => 1]);

        $this->assertEquals($q1->id, $quiz->questions[0]->id);
        $this->assertEquals($q2->id, $quiz->questions[1]->id);
        $this->assertEquals($q3->id, $quiz->questions[2]->id);
    }

    public function test_quiz_has_many_tags(): void
    {
        $quiz = Quiz::factory()->create();
        $tags = Tag::factory()->count(3)->create();
        $quiz->tags()->attach($tags->pluck('id'));

        $this->assertCount(3, $quiz->tags);
    }

    public function test_quiz_status_is_enum(): void
    {
        $quiz = Quiz::factory()->create(['status' => QuizStatus::Draft]);

        $this->assertInstanceOf(QuizStatus::class, $quiz->status);
        $this->assertEquals(QuizStatus::Draft, $quiz->status);
    }

    public function test_quiz_visibility_is_enum(): void
    {
        $quiz = Quiz::factory()->create(['visibility' => QuizVisibility::Private]);

        $this->assertInstanceOf(QuizVisibility::class, $quiz->visibility);
        $this->assertEquals(QuizVisibility::Private, $quiz->visibility);
    }

    public function test_quiz_content_is_json(): void
    {
        $quiz = Quiz::factory()->create([
            'description' => 'This is a test description',
        ]);

        $this->assertIsString($quiz->description);
        $this->assertEquals('This is a test description', $quiz->description);
    }
}
