<?php

namespace Tests\Unit\Models;

use App\Models\Question;
use App\Models\Quiz;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuizQuestionPivotTest extends TestCase
{
    use RefreshDatabase;

    public function test_quiz_can_have_multiple_questions(): void
    {
        $quiz = Quiz::factory()->create();
        $questions = Question::factory()->count(3)->create();

        foreach ($questions as $index => $question) {
            $quiz->questions()->attach($question->id, ['sort_order' => $index]);
        }

        $this->assertCount(3, $quiz->questions);
    }

    public function test_question_can_belong_to_multiple_quizzes(): void
    {
        $user = User::factory()->create();
        $question = Question::factory()->create(['user_id' => $user->id]);
        $quiz1 = Quiz::factory()->create(['user_id' => $user->id]);
        $quiz2 = Quiz::factory()->create(['user_id' => $user->id]);

        $quiz1->questions()->attach($question->id, ['sort_order' => 0]);
        $quiz2->questions()->attach($question->id, ['sort_order' => 0]);

        $this->assertCount(2, $question->quizzes);
    }

    public function test_sort_order_is_preserved_per_quiz(): void
    {
        $quiz = Quiz::factory()->create();
        $q1 = Question::factory()->create();
        $q2 = Question::factory()->create();

        $quiz->questions()->attach($q1->id, ['sort_order' => 5]);
        $quiz->questions()->attach($q2->id, ['sort_order' => 2]);

        $this->assertEquals(5, $quiz->questions->firstWhere('id', $q1->id)->pivot->sort_order);
        $this->assertEquals(2, $quiz->questions->firstWhere('id', $q2->id)->pivot->sort_order);
    }

    public function test_detaching_question_removes_pivot_but_not_question(): void
    {
        $quiz = Quiz::factory()->create();
        $question = Question::factory()->create();
        $quiz->questions()->attach($question->id, ['sort_order' => 0]);

        $quiz->questions()->detach($question->id);

        $this->assertCount(0, $quiz->questions);
        $this->assertDatabaseHas('questions', ['id' => $question->id]);
    }
}
