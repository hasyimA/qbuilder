<?php

namespace Tests\Unit\Models;

use App\Models\Question;
use App\Models\QuestionOption;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuestionOptionModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_option_belongs_to_question(): void
    {
        $question = Question::factory()->create();
        $option = QuestionOption::factory()->create(['question_id' => $question->id]);

        $this->assertInstanceOf(Question::class, $option->question);
        $this->assertEquals($question->id, $option->question_id);
    }

    public function test_option_content_is_array(): void
    {
        $option = QuestionOption::factory()->create();

        $this->assertIsArray($option->content);
        $this->assertEquals('doc', $option->content['type']);
    }

    public function test_option_fraction_is_decimal(): void
    {
        $option = QuestionOption::factory()->create(['fraction' => 75.50]);

        $this->assertEquals('75.50', $option->fraction);
    }

    public function test_option_is_correct_is_boolean(): void
    {
        $option = QuestionOption::factory()->correct()->create();

        $this->assertTrue($option->is_correct);
        $this->assertEquals(100.00, $option->fraction);
    }
}
