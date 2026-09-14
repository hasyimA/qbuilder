<?php

namespace Tests\Feature;

use App\Models\Question;
use App\Models\Quiz;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuestionBankTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'type' => 'multiple_choice',
            'content' => [
                'type' => 'doc',
                'content' => [
                    ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'What is the capital of France?']]],
                ],
            ],
            'default_mark' => 1.00,
            'category' => 'Geografi',
            'difficulty' => 'medium',
            'status' => 'complete',
            'tags' => ['ujian', 'umum'],
            'options' => [
                ['content' => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Paris']]]]], 'is_correct' => true, 'fraction' => 100],
                ['content' => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'London']]]]], 'is_correct' => false, 'fraction' => 0],
            ],
        ], $overrides);
    }

    private function createQuestionWithOptions(
        User $owner,
        string $text = 'Default bank question?',
        string $category = 'Matematika'
    ): Question {
        $question = Question::factory()->create([
            'user_id' => $owner->id,
            'category' => $category,
        ]);
        $question->search_text = $text;
        $question->saveQuietly();

        return $question;
    }

    public function test_bank_lists_only_own_questions_with_pagination_and_tags(): void
    {
        Question::factory()->count(3)->create(['user_id' => $this->user->id]);
        Question::factory()->create(['user_id' => User::factory()->create()->id]);
        $tagged = Question::factory()->create(['user_id' => $this->user->id]);
        $tagged->tags()->attach(Tag::factory()->create(['name' => 'pola'])->id);

        $response = $this->actingAs($this->user)
            ->getJson('/api/questions?per_page=2');

        $response->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.total', 4);

        $all = $this->actingAs($this->user)
            ->getJson('/api/questions?per_page=100');
        $all->assertOk();
        foreach ($all->json('data') as $question) {
            $this->assertSame($this->user->id, Question::find($question['id'])->user_id);
        }

        $this->actingAs($this->user)
            ->getJson('/api/questions')
            ->assertJsonCount(4, 'data')
            ->assertJsonFragment(['id' => $tagged->id]);

        $this->assertEquals('pola', $tagged->fresh()->tags->first()->name);
    }

    public function test_bank_search_matches_question_and_option_text(): void
    {
        $this->createQuestionWithOptions($this->user, 'Apa rumus luas lingkaran?', 'Matematika');
        Question::factory()->create(['user_id' => $this->user->id, 'category' => 'Biologi']);

        $response = $this->actingAs($this->user)
            ->getJson('/api/questions?search=lingkaran');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.category', 'Matematika');
    }

    public function test_bank_filters_by_type_status_category_difficulty_and_tag(): void
    {
        $mc = Question::factory()->create(['user_id' => $this->user->id, 'status' => 'complete', 'category' => 'Fisika', 'difficulty' => 'hard']);
        $tag = Tag::factory()->create(['name' => 'termo']);
        $mc->tags()->attach($tag->id);
        Question::factory()->trueFalse()->create(['user_id' => $this->user->id, 'status' => 'draft', 'category' => 'Kimia', 'difficulty' => 'easy']);

        $this->actingAs($this->user)
            ->getJson('/api/questions?type=true_false')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.type', 'true_false');

        $this->actingAs($this->user)
            ->getJson('/api/questions?status=complete&difficulty=hard')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->actingAs($this->user)
            ->getJson('/api/questions?category=Fisika')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->actingAs($this->user)
            ->getJson('/api/questions?tag=termo')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonFragment(['id' => $mc->id]);
    }

    public function test_create_standalone_question_in_bank(): void
    {
        $response = $this->actingAs($this->user)
            ->postJson('/api/questions', $this->payload());

        $response->assertCreated()
            ->assertJsonPath('data.category', 'Geografi')
            ->assertJsonPath('data.difficulty', 'medium')
            ->assertJsonPath('data.status', 'complete')
            ->assertJsonPath('data.used_in_count', 0)
            ->assertJsonCount(2, 'data.tags')
            ->assertJsonCount(2, 'data.options');

        $this->assertDatabaseHas('tags', ['name' => 'ujian']);
        $this->assertNotNull($response->json('data.id'));
        $this->assertDatabaseHas('questions', ['id' => $response->json('data.id')]);
    }

    public function test_bank_question_includes_used_in_count_when_referenced_by_quiz(): void
    {
        $question = Question::factory()->create(['user_id' => $this->user->id]);
        $quiz = Quiz::factory()->create(['user_id' => $this->user->id]);
        $quiz->questions()->attach($question->id, ['sort_order' => 0]);

        $this->actingAs($this->user)
            ->getJson('/api/questions')
            ->assertJsonFragment(['id' => $question->id, 'used_in_count' => 1]);
    }

    public function test_attach_existing_bank_question_to_quiz(): void
    {
        $quiz = Quiz::factory()->create(['user_id' => $this->user->id]);
        $existing = Question::factory()->create(['user_id' => $this->user->id]);
        $quiz->questions()->attach($existing->id, ['sort_order' => 4]);
        $question = Question::factory()->create(['user_id' => $this->user->id]);

        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$quiz->id}/questions/{$question->id}/attach");

        $response->assertCreated()
            ->assertJsonPath('data.id', $question->id)
            ->assertJsonPath('data.sort_order', 5);

        $this->assertDatabaseHas('quiz_questions', [
            'quiz_id' => $quiz->id,
            'question_id' => $question->id,
            'sort_order' => 5,
        ]);
    }

    public function test_attach_same_question_twice_conflicts(): void
    {
        $quiz = Quiz::factory()->create(['user_id' => $this->user->id]);
        $question = Question::factory()->create(['user_id' => $this->user->id]);
        $quiz->questions()->attach($question->id, ['sort_order' => 0]);

        $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$quiz->id}/questions/{$question->id}/attach")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Question already in this quiz.');
    }

    public function test_cannot_attach_other_users_question_to_own_quiz(): void
    {
        $quiz = Quiz::factory()->create(['user_id' => $this->user->id]);
        $foreign = Question::factory()->create(['user_id' => User::factory()->create()->id]);

        $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$quiz->id}/questions/{$foreign->id}/attach")
            ->assertForbidden();
    }

    public function test_detach_removes_pivot_but_keeps_question(): void
    {
        $quiz = Quiz::factory()->create(['user_id' => $this->user->id]);
        $question = Question::factory()->create(['user_id' => $this->user->id]);
        $quiz->questions()->attach($question->id, ['sort_order' => 0]);

        $response = $this->actingAs($this->user)
            ->deleteJson("/api/quizzes/{$quiz->id}/questions/{$question->id}");

        $response->assertOk();

        $this->assertDatabaseMissing('quiz_questions', [
            'quiz_id' => $quiz->id,
            'question_id' => $question->id,
        ]);
        $this->assertDatabaseHas('questions', ['id' => $question->id]);

        $this->assertSame(0, $quiz->questions()->count());
        $this->actingAs($this->user)
            ->getJson('/api/questions')
            ->assertJsonFragment(['id' => $question->id, 'used_in_count' => 0]);
    }

    public function test_detach_non_member_question_returns_404(): void
    {
        $quiz = Quiz::factory()->create(['user_id' => $this->user->id]);
        $question = Question::factory()->create(['user_id' => $this->user->id]);

        $this->actingAs($this->user)
            ->deleteJson("/api/quizzes/{$quiz->id}/questions/{$question->id}")
            ->assertNotFound();
    }

    public function test_duplicate_standalone_copies_tags_and_resets_status(): void
    {
        $question = Question::factory()->create(['user_id' => $this->user->id]);
        $question->tags()->attach(Tag::factory()->create(['name' => 'sumber'])->id);

        $response = $this->actingAs($this->user)
            ->postJson("/api/questions/{$question->id}/duplicate");

        $response->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonCount(1, 'data.tags');

        $this->assertNotSame($question->id, $response->json('data.id'));
        $this->assertSame(2, Question::where('user_id', $this->user->id)->count());
    }

    public function test_update_question_tags_round_trip(): void
    {
        $question = Question::factory()->create(['user_id' => $this->user->id]);

        $this->actingAs($this->user)
            ->patchJson("/api/questions/{$question->id}", ['tags' => ['baru', 'hapus-me']])
            ->assertOk()
            ->assertJsonCount(2, 'data.tags');

        $this->actingAs($this->user)
            ->patchJson("/api/questions/{$question->id}", ['tags' => ['baru']])
            ->assertOk()
            ->assertJsonCount(1, 'data.tags');

        $this->assertEquals(['baru'], $question->fresh()->tags->pluck('name')->all());
    }

    public function test_filters_meta_returns_own_distinct_values(): void
    {
        Question::factory()->create(['user_id' => $this->user->id, 'category' => 'Matematika', 'difficulty' => 'easy']);
        Question::factory()->create(['user_id' => $this->user->id, 'category' => 'Matematika', 'difficulty' => 'hard']);
        Question::factory()->create(['user_id' => User::factory()->create()->id, 'category' => 'Milik Orang', 'difficulty' => 'insane']);
        $tagged = Question::factory()->create(['user_id' => $this->user->id]);
        $tagged->tags()->attach(Tag::factory()->create(['name' => 'review'])->id);

        $response = $this->actingAs($this->user)
            ->getJson('/api/questions/filters/meta');

        $response->assertOk()
            ->assertJsonPath('data.categories', ['Matematika'])
            ->assertJsonPath('data.difficulties', ['easy', 'hard'])
            ->assertJsonFragment(['name' => 'review'])
            ->assertJsonMissing(['name' => 'Milik Orang']);
    }

    public function test_cannot_list_or_modify_other_users_bank_questions(): void
    {
        $other = User::factory()->create();
        $foreign = Question::factory()->create(['user_id' => $other->id]);

        $this->actingAs($this->user)
            ->getJson("/api/questions/{$foreign->id}")
            ->assertForbidden();

        $this->actingAs($this->user)
            ->patchJson("/api/questions/{$foreign->id}", ['category' => 'Hacked'])
            ->assertForbidden();

        $this->actingAs($this->user)
            ->deleteJson("/api/questions/{$foreign->id}")
            ->assertForbidden();
    }
}
