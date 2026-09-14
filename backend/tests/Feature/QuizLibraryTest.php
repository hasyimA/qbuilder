<?php

namespace Tests\Feature;

use App\Models\Question;
use App\Models\Quiz;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuizLibraryTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
    }

    private function attachQuestion(Quiz $quiz, Question $question): void
    {
        $maxSort = $quiz->questions()->max('sort_order');
        $quiz->questions()->attach($question->id, [
            'sort_order' => ($maxSort ?? -1) + 1,
        ]);
    }

    private function createQuestionWithOptions(User $owner, string $type = 'multipleChoice'): Question
    {
        $question = Question::factory()->{$type}()->create(['user_id' => $owner->id]);
        $question->options()->createMany([
            ['content' => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'A']]]]], 'is_correct' => true, 'fraction' => 100.00, 'sort_order' => 0],
            ['content' => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'B']]]]], 'is_correct' => false, 'fraction' => 0.00, 'sort_order' => 1],
            ['content' => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'C']]]]], 'is_correct' => false, 'fraction' => 0.00, 'sort_order' => 2],
        ]);

        return $question->load('options');
    }

    public function test_list_honors_per_page_and_pagination_meta(): void
    {
        Quiz::factory()->count(3)->create(['user_id' => $this->user->id]);

        $response = $this->actingAs($this->user)
            ->getJson('/api/quizzes?per_page=2');

        $response->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.last_page', 2)
            ->assertJsonPath('meta.total', 3);
    }

    public function test_list_defaults_to_twenty_per_page(): void
    {
        Quiz::factory()->count(25)->create(['user_id' => $this->user->id]);

        $response = $this->actingAs($this->user)
            ->getJson('/api/quizzes');

        $response->assertOk()
            ->assertJsonCount(20, 'data');
    }

    public function test_list_search_filters_by_title_and_description(): void
    {
        Quiz::factory()->create([
            'user_id' => $this->user->id,
            'title' => 'Jaringan Komputer Dasar',
            'description' => 'Tidak mengandung kata kunci',
        ]);
        Quiz::factory()->create([
            'user_id' => $this->user->id,
            'title' => 'Rahasia Komputer',
            'description' => 'Deskripsi acak',
        ]);
        Quiz::factory()->create([
            'user_id' => $this->user->id,
            'title' => 'Unrelated',
            'description' => 'Tidak relevan',
        ]);

        $response = $this->actingAs($this->user)
            ->getJson('/api/quizzes?search=Komputer');

        $response->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonFragment(['title' => 'Jaringan Komputer Dasar'])
            ->assertJsonFragment(['title' => 'Rahasia Komputer']);
    }

    public function test_list_filters_by_status_and_category(): void
    {
        Quiz::factory()->create([
            'user_id' => $this->user->id,
            'title' => 'Published one',
            'status' => 'published',
            'category' => 'UTS',
        ]);
        Quiz::factory()->create([
            'user_id' => $this->user->id,
            'title' => 'Draft one',
            'category' => 'UAS',
        ]);

        $response = $this->actingAs($this->user)
            ->getJson('/api/quizzes?status=published&category=UTS');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Published one');
    }

    public function test_list_filters_by_tag(): void
    {
        $tag = Tag::factory()->create(['name' => 'Keamanan', 'slug' => 'keamanan']);
        Quiz::factory()->create(['user_id' => $this->user->id, 'title' => 'Tagged quiz'])
            ->tags()->attach($tag->id);
        Quiz::factory()->create(['user_id' => $this->user->id, 'title' => 'Untagged quiz']);

        $response = $this->actingAs($this->user)
            ->getJson('/api/quizzes?tag=keamanan');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Tagged quiz');
    }

    public function test_list_filters_by_question_type(): void
    {
        $quiz = Quiz::factory()->create(['user_id' => $this->user->id]);
        $this->attachQuestion($quiz, Question::factory()->multipleChoice()->create());
        $other = Quiz::factory()->create(['user_id' => $this->user->id]);
        $this->attachQuestion($other, Question::factory()->essay()->create());

        $response = $this->actingAs($this->user)
            ->getJson('/api/quizzes?type=essay');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $other->id);
    }

    public function test_list_filters_by_minimum_question_count(): void
    {
        Quiz::factory()->create(['user_id' => $this->user->id, 'title' => 'Empty quiz']);

        $quiz = Quiz::factory()->create(['user_id' => $this->user->id, 'title' => 'Full quiz']);
        $this->attachQuestion($quiz, Question::factory()->multipleChoice()->create());
        $this->attachQuestion($quiz, Question::factory()->trueFalse()->create());

        $response = $this->actingAs($this->user)
            ->getJson('/api/quizzes?min_questions=2');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Full quiz')
            ->assertJsonPath('data.0.questions_count', 2);
    }

    public function test_list_filters_by_updated_date(): void
    {
        Quiz::factory()->create(['user_id' => $this->user->id, 'title' => 'Fresh quiz']);
        $old = Quiz::factory()->create(['user_id' => $this->user->id, 'title' => 'Old quiz']);
        Quiz::where('id', $old->id)->update(['updated_at' => now()->subDays(10)]);

        $response = $this->actingAs($this->user)
            ->getJson('/api/quizzes?updated_from='.now()->subDays(2)->format('Y-m-d'));

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Fresh quiz');
    }

    public function test_list_sorts_by_title_ascending(): void
    {
        Quiz::factory()->create(['user_id' => $this->user->id, 'title' => 'Beta']);
        Quiz::factory()->create(['user_id' => $this->user->id, 'title' => 'Alpha']);

        $response = $this->actingAs($this->user)
            ->getJson('/api/quizzes?sort=title&sort_dir=asc');

        $response->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.title', 'Alpha')
            ->assertJsonPath('data.1.title', 'Beta');
    }

    public function test_list_includes_owner_tags_and_question_types(): void
    {
        $tag = Tag::factory()->create(['name' => 'Ujian', 'slug' => 'ujian']);
        $quiz = Quiz::factory()->create([
            'user_id' => $this->user->id,
            'title' => 'Rich quiz',
        ]);
        $quiz->tags()->attach($tag->id);
        $this->attachQuestion($quiz, Question::factory()->multipleChoice()->create());
        $this->attachQuestion($quiz, Question::factory()->trueFalse()->create());

        $response = $this->actingAs($this->user)
            ->getJson('/api/quizzes');

        $response->assertOk()
            ->assertJsonPath('data.0.owner.name', $this->user->name)
            ->assertJsonPath('data.0.tags.0.name', 'Ujian')
            ->assertJsonPath('data.0.question_types', ['multiple_choice', 'true_false'])
            ->assertJsonPath('data.0.questions_count', 2);
    }

    public function test_list_shared_returns_public_and_school_quizzes_of_others(): void
    {
        $other = User::factory()->create();

        Quiz::factory()->create(['user_id' => $other->id, 'visibility' => 'public', 'title' => 'Public of other']);
        Quiz::factory()->create(['user_id' => $other->id, 'visibility' => 'school', 'title' => 'School of other']);
        Quiz::factory()->create(['user_id' => $other->id, 'visibility' => 'private', 'title' => 'Private of other']);
        Quiz::factory()->create(['user_id' => $this->user->id, 'visibility' => 'public', 'title' => 'My own public']);

        $response = $this->actingAs($this->user)
            ->getJson('/api/quizzes?tab=shared');

        $response->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonFragment(['title' => 'Public of other'])
            ->assertJsonFragment(['title' => 'School of other'])
            ->assertJsonPath('data.0.owner.id', $other->id);
    }

    public function test_duplicate_clones_quiz_questions_options_and_tags(): void
    {
        $other = User::factory()->create();
        $quiz = Quiz::factory()->published()->create([
            'user_id' => $other->id,
            'visibility' => 'public',
            'title' => 'Original Quiz',
            'category' => 'UTS',
        ]);
        $tag = Tag::factory()->create(['name' => 'PTS', 'slug' => 'pts']);
        $quiz->tags()->attach($tag->id);
        $question = $this->createQuestionWithOptions($other);
        $this->attachQuestion($quiz, $question);

        $response = $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$quiz->id}/duplicate");

        $response->assertCreated()
            ->assertJsonPath('data.title', 'Original Quiz (Salinan)')
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.visibility', 'private')
            ->assertJsonPath('data.questions_count', 1)
            ->assertJsonPath('data.owner.id', $this->user->id)
            ->assertJsonPath('data.question_types', ['multiple_choice']);

        $this->assertDatabaseHas('quizzes', [
            'user_id' => $this->user->id,
            'title' => 'Original Quiz (Salinan)',
            'status' => 'draft',
            'visibility' => 'private',
        ]);

        $copy = Quiz::where('title', 'Original Quiz (Salinan)')->firstOrFail();
        $this->assertSame(1, $copy->tags()->count());

        $copyQuestion = $copy->questions()->with('options')->firstOrFail();
        $this->assertSame($question->content, $copyQuestion->content);
        $this->assertSame($this->user->id, $copyQuestion->user_id);
        $this->assertSame('draft', $copyQuestion->status->value);
        $this->assertSame(3, $copyQuestion->options()->count());
        $this->assertSame(1, $copyQuestion->options()->where('is_correct', true)->count());
    }

    public function test_duplicate_preserves_marked_correct_option(): void
    {
        $other = User::factory()->create();
        $quiz = Quiz::factory()->create([
            'user_id' => $other->id,
            'visibility' => 'public',
            'title' => 'With correct answer',
        ]);
        $question = $this->createQuestionWithOptions($other);
        $this->attachQuestion($quiz, $question);

        $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$quiz->id}/duplicate")
            ->assertCreated();

        $copy = Quiz::where('title', 'With correct answer (Salinan)')->firstOrFail();
        $copyQuestion = $copy->questions()->with('options')->firstOrFail();

        $this->assertSame(1, $copyQuestion->options()->where('is_correct', true)->count());
    }

    public function test_cannot_duplicate_private_quiz_of_other_user(): void
    {
        $other = User::factory()->create();
        $quiz = Quiz::factory()->create([
            'user_id' => $other->id,
            'visibility' => 'private',
        ]);

        $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$quiz->id}/duplicate")
            ->assertForbidden();
    }

    public function test_owner_can_duplicate_own_quiz(): void
    {
        $quiz = Quiz::factory()->create(['user_id' => $this->user->id, 'title' => 'My own']);

        $this->actingAs($this->user)
            ->postJson("/api/quizzes/{$quiz->id}/duplicate")
            ->assertCreated();

        $this->assertDatabaseHas('quizzes', [
            'user_id' => $this->user->id,
            'title' => 'My own (Salinan)',
        ]);
    }

    public function test_filters_meta_returns_categories_tags_and_types(): void
    {
        $tag = Tag::factory()->create(['name' => 'Latihan', 'slug' => 'latihan']);
        Quiz::factory()->create([
            'user_id' => $this->user->id,
            'category' => 'UTS',
        ])->tags()->attach($tag->id);

        $other = User::factory()->create();
        Quiz::factory()->create([
            'user_id' => $other->id,
            'visibility' => 'public',
            'category' => 'UAS',
        ]);

        $response = $this->actingAs($this->user)
            ->getJson('/api/quizzes/filters/meta');

        $response->assertOk()
            ->assertJsonFragment(['UTS'])
            ->assertJsonFragment(['UAS'])
            ->assertJsonFragment(['name' => 'Latihan', 'slug' => 'latihan'])
            ->assertJsonFragment(['multiple_choice'])
            ->assertJsonFragment(['essay']);
    }

    public function test_visibility_can_be_set_to_school_on_update(): void
    {
        $quiz = Quiz::factory()->create(['user_id' => $this->user->id]);

        $response = $this->actingAs($this->user)
            ->patchJson("/api/quizzes/{$quiz->id}", [
                'visibility' => 'school',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.visibility', 'school');

        $this->assertDatabaseHas('quizzes', [
            'id' => $quiz->id,
            'visibility' => 'school',
        ]);
    }

    public function test_question_types_are_sorted_in_resource(): void
    {
        $quiz = Quiz::factory()->create(['user_id' => $this->user->id]);
        $this->attachQuestion($quiz, Question::factory()->essay()->create());
        $this->attachQuestion($quiz, Question::factory()->multipleChoice()->create());

        $response = $this->actingAs($this->user)
            ->getJson("/api/quizzes/{$quiz->id}");

        $response->assertOk()
            ->assertJsonPath('data.question_types', ['essay', 'multiple_choice'])
            ->assertJsonPath('data.questions_count', 2);
    }
}
