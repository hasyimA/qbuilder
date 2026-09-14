<?php

namespace Tests\Unit\Models;

use App\Enums\QuestionStatus;
use App\Enums\QuestionType;
use App\Models\Question;
use App\Models\QuestionOption;
use App\Models\Quiz;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuestionModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_question_belongs_to_user(): void
    {
        $user = User::factory()->create();
        $question = Question::factory()->create(['user_id' => $user->id]);

        $this->assertInstanceOf(User::class, $question->user);
        $this->assertEquals($user->id, $question->user_id);
    }

    public function test_question_has_many_options(): void
    {
        $question = Question::factory()->create();
        QuestionOption::factory()->count(4)->create(['question_id' => $question->id]);

        $this->assertCount(4, $question->options);
    }

    public function test_question_options_are_ordered_by_sort_order(): void
    {
        $question = Question::factory()->create();
        QuestionOption::factory()->create(['question_id' => $question->id, 'sort_order' => 2]);
        QuestionOption::factory()->create(['question_id' => $question->id, 'sort_order' => 0]);
        QuestionOption::factory()->create(['question_id' => $question->id, 'sort_order' => 1]);

        $this->assertEquals(0, $question->options[0]->sort_order);
        $this->assertEquals(1, $question->options[1]->sort_order);
        $this->assertEquals(2, $question->options[2]->sort_order);
    }

    public function test_question_type_is_enum(): void
    {
        $question = Question::factory()->create(['type' => QuestionType::MultipleChoice]);

        $this->assertInstanceOf(QuestionType::class, $question->type);
        $this->assertEquals(QuestionType::MultipleChoice, $question->type);
    }

    public function test_question_status_is_enum(): void
    {
        $question = Question::factory()->create(['status' => QuestionStatus::Complete]);

        $this->assertInstanceOf(QuestionStatus::class, $question->status);
        $this->assertEquals(QuestionStatus::Complete, $question->status);
    }

    public function test_question_content_is_array(): void
    {
        $question = Question::factory()->create();

        $this->assertIsArray($question->content);
        $this->assertEquals('doc', $question->content['type']);
    }

    public function test_question_belongs_to_many_quizzes(): void
    {
        $question = Question::factory()->create();
        $user = User::factory()->create();
        $quiz1 = Quiz::factory()->create(['user_id' => $user->id]);
        $quiz2 = Quiz::factory()->create(['user_id' => $user->id]);

        $question->quizzes()->attach($quiz1->id, ['sort_order' => 0]);
        $question->quizzes()->attach($quiz2->id, ['sort_order' => 0]);

        $this->assertCount(2, $question->quizzes);
    }

    public function test_question_has_many_tags(): void
    {
        $question = Question::factory()->create();
        $tags = Tag::factory()->count(2)->create();
        $question->tags()->attach($tags->pluck('id'));

        $this->assertCount(2, $question->tags);
    }
}
