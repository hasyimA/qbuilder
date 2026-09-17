<?php

namespace Tests\Feature;

use App\Models\Question;
use App\Models\QuestionOption;
use App\Models\Quiz;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuestionCrudTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Quiz $quiz;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->quiz = Quiz::factory()->create(['user_id' => $this->user->id]);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'type' => 'multiple_choice',
            'content' => [
                'type' => 'doc',
                'content' => [
                    ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Sample question?']]],
                ],
            ],
            'default_mark' => 1.50,
            'options' => [
                ['content' => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Correct answer']]]]], 'is_correct' => true, 'fraction' => 100],
                ['content' => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Wrong answer']]]]], 'is_correct' => false, 'fraction' => 0],
            ],
        ], $overrides);
    }

    public function test_user_can_list_quiz_questions(): void
    {
        $q1 = Question::factory()->create(['user_id' => $this->user->id]);
        $q2 = Question::factory()->create(['user_id' => $this->user->id]);
        $this->quiz->questions()->attach($q1->id, ['sort_order' => 0]);
        $this->quiz->questions()->attach($q2->id, ['sort_order' => 1]);

        $response = $this->actingAs($this->user)
            ->getJson("/api/quizzes/{$this->quiz->id}/questions");

        $response->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_user_can_create_question_in_quiz(): void
    {
        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions", $this->payload());

        $response->assertCreated()
            ->assertJsonPath('data.type', 'multiple_choice')
            ->assertJsonCount(2, 'data.options')
            ->assertJsonPath('data.sort_order', 0);

        $this->assertDatabaseHas('questions', [
            'user_id' => $this->user->id,
            'type' => 'multiple_choice',
        ]);
    }

    public function test_user_can_view_question(): void
    {
        $question = Question::factory()->create(['user_id' => $this->user->id]);
        QuestionOption::factory()->count(2)->create(['question_id' => $question->id]);

        $response = $this->actingAs($this->user)
            ->getJson("/api/questions/{$question->id}");

        $response->assertOk()
            ->assertJsonPath('data.id', $question->id)
            ->assertJsonCount(2, 'data.options');
    }

    public function test_user_can_update_question(): void
    {
        $question = Question::factory()->multipleChoice()->create(['user_id' => $this->user->id]);

        $response = $this->actingAs($this->user)
            ->patchJson("/api/questions/{$question->id}", [
                'default_mark' => 2.00,
                'content' => [
                    'type' => 'doc',
                    'content' => [
                        ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Updated?']]],
                    ],
                ],
            ]);

        $response->assertOk()
            ->assertJsonPath('data.default_mark', '2.00');

        $this->assertDatabaseHas('questions', ['id' => $question->id, 'default_mark' => 2.00]);
    }

    public function test_update_with_matching_base_updated_at_succeeds(): void
    {
        $question = Question::factory()->multipleChoice()->create(['user_id' => $this->user->id]);
        $base = $question->refresh()->updated_at->toISOString();

        $response = $this->actingAs($this->user)
            ->patchJson("/api/questions/{$question->id}", [
                'default_mark' => 2.50,
                'base_updated_at' => $base,
            ]);

        $response->assertOk()
            ->assertJsonPath('data.default_mark', '2.50');
    }

    public function test_update_with_stale_base_updated_at_conflicts(): void
    {
        $question = Question::factory()->multipleChoice()->create(['user_id' => $this->user->id]);
        $staleBase = $question->refresh()->updated_at->subHour()->toISOString();

        $response = $this->actingAs($this->user)
            ->patchJson("/api/questions/{$question->id}", [
                'default_mark' => 3.00,
                'base_updated_at' => $staleBase,
            ]);

        $response->assertStatus(409)
            ->assertJsonPath('data.id', $question->id)
            ->assertJsonPath('message', 'This question has been modified by another session. Refresh to see the latest version.');

        $this->assertDatabaseHas('questions', ['id' => $question->id, 'default_mark' => 1]);
    }

    public function test_force_update_without_base_updated_at_overrides_conflict(): void
    {
        $question = Question::factory()->multipleChoice()->create(['user_id' => $this->user->id]);

        $response = $this->actingAs($this->user)
            ->patchJson("/api/questions/{$question->id}", [
                'default_mark' => 4.00,
            ]);

        $response->assertOk()
            ->assertJsonPath('data.default_mark', '4.00');
    }

    public function test_user_can_delete_question_not_used_in_any_quiz(): void
    {
        $question = Question::factory()->create(['user_id' => $this->user->id]);

        $response = $this->actingAs($this->user)
            ->deleteJson("/api/questions/{$question->id}");

        $response->assertOk();

        $this->assertDatabaseMissing('questions', ['id' => $question->id]);
    }

    public function test_user_cannot_delete_question_that_is_referenced_by_a_quiz(): void
    {
        $question = Question::factory()->create(['user_id' => $this->user->id]);
        $this->quiz->questions()->attach($question->id, ['sort_order' => 0]);

        $response = $this->actingAs($this->user)
            ->deleteJson("/api/questions/{$question->id}");

        $response->assertStatus(409)
            ->assertJsonPath('message', 'Cannot delete: this question is used in 1 quiz(es). Remove it from those quizzes first.');

        $this->assertDatabaseHas('questions', ['id' => $question->id]);
        $this->assertDatabaseHas('quiz_questions', ['quiz_id' => $this->quiz->id, 'question_id' => $question->id]);
    }

    public function test_user_can_duplicate_question(): void
    {
        $question = Question::factory()->multipleChoice()->create(['user_id' => $this->user->id]);
        QuestionOption::factory()->count(3)->create(['question_id' => $question->id]);
        $this->quiz->questions()->attach($question->id, ['sort_order' => 0]);

        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions/{$question->id}/duplicate");

        $response->assertCreated()
            ->assertJsonCount(3, 'data.options')
            ->assertJsonPath('data.sort_order', 1);

        $this->assertDatabaseHas('questions', ['user_id' => $this->user->id]);
        $this->assertCount(2, $this->quiz->fresh()->questions);
    }

    public function test_user_can_reorder_questions(): void
    {
        $q1 = Question::factory()->create(['user_id' => $this->user->id]);
        $q2 = Question::factory()->create(['user_id' => $this->user->id]);
        $q3 = Question::factory()->create(['user_id' => $this->user->id]);
        $this->quiz->questions()->attach($q1->id, ['sort_order' => 0]);
        $this->quiz->questions()->attach($q2->id, ['sort_order' => 1]);
        $this->quiz->questions()->attach($q3->id, ['sort_order' => 2]);

        $response = $this->actingAs($this->user)
            ->patchJson("/api/quizzes/{$this->quiz->id}/questions/order", [
                'order' => [$q3->id, $q1->id, $q2->id],
            ]);

        $response->assertOk();

        $order = $this->quiz->fresh()->questions()->orderByPivot('sort_order')->pluck('questions.id')->all();
        $this->assertEquals([$q3->id, $q1->id, $q2->id], $order);
    }

    public function test_user_cannot_create_question_in_other_users_quiz(): void
    {
        $other = User::factory()->create();
        $quiz = Quiz::factory()->create(['user_id' => $other->id]);

        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$quiz->id}/questions", $this->payload());

        $response->assertForbidden();
    }

    public function test_user_cannot_update_other_users_question(): void
    {
        $other = User::factory()->create();
        $question = Question::factory()->create(['user_id' => $other->id]);

        $response = $this->actingAs($this->user)
            ->patchJson("/api/questions/{$question->id}", [
                'default_mark' => 5.00,
            ]);

        $response->assertForbidden();
    }

    public function test_unauthenticated_user_cannot_access_questions(): void
    {
        $response = $this->getJson("/api/quizzes/{$this->quiz->id}/questions");

        $response->assertUnauthorized();
    }

    public function test_question_type_is_required(): void
    {
        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions", [
                'content' => ['type' => 'doc', 'content' => []],
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['type']);
    }

    public function test_multiple_choice_requires_minimum_two_options(): void
    {
        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions", $this->payload([
                'options' => [[
                    'content' => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Only option']]]]],
                    'is_correct' => true,
                ]],
            ]));

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['options']);
    }

    public function test_multiple_choice_requires_at_least_one_correct_option(): void
    {
        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions", $this->payload([
                'options' => [
                    ['content' => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Option A']]]]], 'is_correct' => false, 'fraction' => 0],
                    ['content' => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Option B']]]]], 'is_correct' => false, 'fraction' => 0],
                ],
            ]));

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['options']);
    }

    public function test_multiple_choice_requires_option_content(): void
    {
        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions", $this->payload([
                'options' => [
                    ['content' => ['type' => 'doc', 'content' => []], 'is_correct' => true],
                    ['content' => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Option B']]]]], 'is_correct' => false],
                ],
            ]));

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['options.0.content']);
    }

    public function test_true_false_requires_exactly_two_options(): void
    {
        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions", $this->payload([
                'type' => 'true_false',
                'options' => [
                    ['content' => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'True']]]]], 'is_correct' => true],
                    ['content' => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'False']]]]], 'is_correct' => false],
                    ['content' => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Extra']]]]], 'is_correct' => false],
                ],
            ]));

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['options']);
    }

    public function test_short_answer_requires_accepted_answer(): void
    {
        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions", $this->payload([
                'type' => 'short_answer',
                'options' => [],
            ]));

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['options']);
    }

    public function test_essay_does_not_require_options(): void
    {
        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions", $this->payload([
                'type' => 'essay',
                'options' => [],
            ]));

        $response->assertCreated()
            ->assertJsonPath('data.type', 'essay');
    }

    public function test_user_can_duplicate_question_standalone(): void
    {
        $question = Question::factory()->multipleChoice()->create(['user_id' => $this->user->id]);
        QuestionOption::factory()->count(3)->create(['question_id' => $question->id]);

        $response = $this->actingAs($this->user)
            ->postJson("/api/questions/{$question->id}/duplicate");

        $response->assertCreated()
            ->assertJsonCount(3, 'data.options')
            ->assertJsonPath('data.id', $question->id + 1);

        $this->assertDatabaseCount('questions', 2);
        $this->assertDatabaseCount('question_options', 6);
    }

    public function test_create_question_sanitizes_malicious_content(): void
    {
        $payload = $this->payload([
            'content' => [
                'type' => 'doc',
                'content' => [
                    ['type' => 'paragraph', 'content' => [
                        ['type' => 'text', 'text' => 'Safe text '],
                        ['type' => 'text', 'text' => 'linky', 'marks' => [['type' => 'link', 'attrs' => ['href' => 'javascript:alert(1)']]]],
                        ['type' => 'text', 'text' => ' struck', 'marks' => [['type' => 'strike']]],
                    ]],
                    ['type' => 'script', 'content' => [['type' => 'text', 'text' => 'alert(1)']]],
                    ['type' => 'unknownNode', 'content' => [['type' => 'text', 'text' => 'garbage']]],
                ],
            ],
        ]);

        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions", $payload);

        $response->assertCreated();
        $content = $response->json('data.content');

        $this->assertSame('Safe text linky struck', $this->plainText($content));
        $this->assertNull($this->findScriptNode($content));

        $this->assertDatabaseCount('questions', 1);
    }

    public function test_create_question_rejects_invalid_content_document(): void
    {
        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions", $this->payload([
                'content' => ['type' => 'totally_unknown'],
            ]));

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['content']);

        $this->assertDatabaseCount('questions', 0);
    }

    public function test_update_question_sanitizes_malicious_content(): void
    {
        $question = Question::factory()->multipleChoice()->create(['user_id' => $this->user->id]);

        $response = $this->actingAs($this->user)
            ->patchJson("/api/questions/{$question->id}", [
                'content' => [
                    'type' => 'doc',
                    'content' => [
                        ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Updated ', 'marks' => [['type' => 'link', 'attrs' => ['href' => 'data:text/html,x']]]]]],
                        ['type' => 'iframe', 'content' => [['type' => 'text', 'text' => 'frame']]],
                    ],
                ],
            ]);

        $response->assertOk();

        $content = $response->json('data.content');
        $this->assertSame('Updated ', $this->plainText($content));
        $this->assertNull($this->findScriptNode($content));
    }

    public function test_strikethrough_mark_round_trips_through_api(): void
    {
        $payload = $this->payload([
            'content' => [
                'type' => 'doc',
                'content' => [
                    ['type' => 'paragraph', 'content' => [
                        ['type' => 'text', 'text' => 'No'],
                        ['type' => 'text', 'text' => ' chance', 'marks' => [['type' => 'strikethrough']]],
                    ]],
                ],
            ],
        ]);

        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions", $payload);

        $response->assertCreated();
        $content = $response->json('data.content');

        $textNodes = $this->collectText($content);
        $this->assertSame(
            ['type' => 'strikethrough'],
            $textNodes[1]['marks'][0]
        );
    }

    public function test_option_content_is_sanitized_on_create(): void
    {
        $options = $this->payload()['options'];
        $options[0]['content'] = [
            'type' => 'doc',
            'content' => [
                ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Correct']]],
                ['type' => 'script', 'content' => [['type' => 'text', 'text' => 'evil()']]],
            ],
        ];

        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions", $this->payload(['options' => $options]));

        $response->assertCreated();

        $stored = Question::first()->options->first();
        $this->assertNotNull($stored);
        $this->assertNotContains('script', $stored->content['content'] ?? [], 'script node should be stripped');
    }

    public function test_create_with_feedback_fields(): void
    {
        $doc = fn (string $text) => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => $text]]]]];

        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions", $this->payload([
                'feedback_general' => $doc('Umpan balik umum.'),
                'feedback_correct' => $doc('Benar.'),
                'feedback_incorrect' => $doc('Salah.'),
            ]));

        $response->assertCreated()
            ->assertJsonPath('data.feedback_general.content.0.content.0.text', 'Umpan balik umum.')
            ->assertJsonPath('data.feedback_correct.content.0.content.0.text', 'Benar.')
            ->assertJsonPath('data.feedback_incorrect.content.0.content.0.text', 'Salah.');

        $id = $response->json('data.id');
        $this->assertDatabaseHas('questions', [
            'id' => $id,
            'feedback_general' => '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Umpan balik umum."}]}]}',
        ]);
    }

    public function test_create_essay_with_grader_info(): void
    {
        $doc = fn (string $text) => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => $text]]]]];

        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions", $this->payload([
                'type' => 'essay',
                'options' => [],
                'grader_info' => $doc('Kunci: meneruskan paket.'),
                'feedback_general' => $doc('Pembahasan singkat.'),
            ]));

        $response->assertCreated()
            ->assertJsonPath('data.type', 'essay')
            ->assertJsonPath('data.grader_info.content.0.content.0.text', 'Kunci: meneruskan paket.');
    }

    public function test_update_feedback_and_grader_info(): void
    {
        $doc = fn (string $text) => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => $text]]]]];

        $question = Question::factory()->multipleChoice()->create(['user_id' => $this->user->id]);

        $response = $this->actingAs($this->user)
            ->patchJson("/api/questions/{$question->id}", [
                'feedback_general' => $doc('Feedback baru.'),
                'feedback_correct' => $doc('OK.'),
                'feedback_incorrect' => $doc('X.'),
                'grader_info' => null,
            ]);

        $response->assertOk()
            ->assertJsonPath('data.feedback_general.content.0.content.0.text', 'Feedback baru.')
            ->assertJsonPath('data.feedback_correct.content.0.content.0.text', 'OK.')
            ->assertJsonPath('data.feedback_incorrect.content.0.content.0.text', 'X.');
    }

    public function test_update_nullifies_feedback_fields(): void
    {
        $doc = fn (string $text) => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => $text]]]]];

        $question = Question::factory()->multipleChoice()->create([
            'user_id' => $this->user->id,
            'feedback_general' => $doc('Ada isi.'),
        ]);

        $this->assertNotNull($question->feedback_general);

        $response = $this->actingAs($this->user)
            ->patchJson("/api/questions/{$question->id}", [
                'feedback_general' => null,
            ]);

        $response->assertOk()->assertJsonPath('data.feedback_general', null);
    }

    public function test_user_can_create_matching_question(): void
    {
        $doc = fn (string $text) => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => $text]]]]];

        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions", $this->payload([
                'type' => 'matching',
                'options' => [
                    ['content' => $doc('HTTP'), 'match_answer' => 'Port 80', 'is_correct' => true, 'fraction' => 100],
                    ['content' => $doc('HTTPS'), 'match_answer' => 'Port 443', 'is_correct' => true, 'fraction' => 100],
                    ['content' => $doc('SSH'), 'match_answer' => 'Port 22', 'is_correct' => true, 'fraction' => 100],
                ],
            ]));

        $response->assertCreated()
            ->assertJsonPath('data.type', 'matching')
            ->assertJsonCount(3, 'data.options')
            ->assertJsonPath('data.options.0.match_answer', 'Port 80');

        $this->assertDatabaseHas('question_options', [
            'question_id' => $response->json('data.id'),
            'match_answer' => 'Port 443',
        ]);
    }

    public function test_matching_requires_at_least_two_pairs(): void
    {
        $doc = fn (string $text) => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => $text]]]]];

        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions", $this->payload([
                'type' => 'matching',
                'options' => [
                    ['content' => $doc('HTTP'), 'match_answer' => 'Port 80', 'is_correct' => true, 'fraction' => 100],
                ],
            ]));

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['options']);
    }

    public function test_matching_requires_answer_for_each_pair(): void
    {
        $doc = fn (string $text) => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => $text]]]]];

        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions", $this->payload([
                'type' => 'matching',
                'options' => [
                    ['content' => $doc('HTTP'), 'match_answer' => '  ', 'is_correct' => true, 'fraction' => 100],
                    ['content' => $doc('HTTPS'), 'match_answer' => 'Port 443', 'is_correct' => true, 'fraction' => 100],
                ],
            ]));

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['options.0.match_answer']);
    }

    public function test_matching_requires_prompt_for_each_pair(): void
    {
        $doc = fn (string $text) => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => $text]]]]];

        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions", $this->payload([
                'type' => 'matching',
                'options' => [
                    ['content' => ['type' => 'doc', 'content' => []], 'match_answer' => 'Port 80', 'is_correct' => true, 'fraction' => 100],
                    ['content' => $doc('HTTPS'), 'match_answer' => 'Port 443', 'is_correct' => true, 'fraction' => 100],
                ],
            ]));

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['options.0.content']);
    }

    public function test_matching_answer_round_trips_through_update(): void
    {
        $doc = fn (string $text) => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => $text]]]]];

        $question = Question::factory()->create(['user_id' => $this->user->id, 'type' => 'matching']);

        $response = $this->actingAs($this->user)
            ->patchJson("/api/questions/{$question->id}", [
                'options' => [
                    ['content' => $doc('DNS'), 'match_answer' => 'Port 53', 'is_correct' => true, 'fraction' => 100],
                    ['content' => $doc('SMTP'), 'match_answer' => 'Port 25', 'is_correct' => true, 'fraction' => 100],
                ],
            ]);

        $response->assertOk()
            ->assertJsonPath('data.options.1.match_answer', 'Port 25');

        $this->assertDatabaseHas('question_options', [
            'question_id' => $question->id,
            'match_answer' => 'Port 53',
        ]);
    }

    public function test_multiple_choice_allows_image_only_option(): void
    {
        $options = $this->payload()['options'];
        $options[0]['content'] = [
            'type' => 'doc',
            'content' => [['type' => 'image', 'attrs' => ['mediaId' => 5, 'alt' => 'Router diagram']]],
        ];

        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$this->quiz->id}/questions", $this->payload(['options' => $options]));

        $response->assertCreated();

        $stored = Question::first()->options->first();
        $this->assertNotNull($stored);
        $this->assertSame('image', $stored->content['content'][0]['type'] ?? null);
    }

    private function plainText(array $doc): string
    {
        if (($doc['type'] ?? null) === 'text') {
            return $doc['text'];
        }

        $parts = [];
        foreach ($doc['content'] ?? [] as $child) {
            $parts[] = $this->plainText($child);
        }

        return implode('', $parts);
    }

    private function collectText(array $doc, array &$out = []): array
    {
        if (($doc['type'] ?? null) === 'text') {
            $out[] = $doc;
        }
        foreach ($doc['content'] ?? [] as $child) {
            $this->collectText($child, $out);
        }

        return $out;
    }

    private function findScriptNode(array $doc): ?array
    {
        if (($doc['type'] ?? null) === 'script') {
            return $doc;
        }
        foreach ($doc['content'] ?? [] as $child) {
            $found = $this->findScriptNode($child);
            if ($found !== null) {
                return $found;
            }
        }

        return null;
    }
}
