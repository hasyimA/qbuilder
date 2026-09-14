<?php

namespace Tests\Feature;

use App\Models\Quiz;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuizCrudTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
    }

    public function test_user_can_list_quizzes(): void
    {
        Quiz::factory()->count(3)->create(['user_id' => $this->user->id]);

        $response = $this->actingAs($this->user)
            ->getJson('/api/quizzes');

        $response->assertOk()
            ->assertJsonCount(3, 'data');
    }

    public function test_user_can_create_quiz(): void
    {
        $response = $this->actingAs($this->user)
            ->postJson('/api/quizzes', [
                'title' => 'Midterm Exam',
                'description' => 'Network basics',
                'subject' => 'Network System',
                'grade_level' => 'X',
                'category' => 'UTS',
            ]);

        $response->assertCreated()
            ->assertJsonFragment(['title' => 'Midterm Exam']);

        $this->assertDatabaseHas('quizzes', [
            'user_id' => $this->user->id,
            'title' => 'Midterm Exam',
        ]);
    }

    public function test_user_can_view_quiz(): void
    {
        $quiz = Quiz::factory()->create(['user_id' => $this->user->id]);

        $response = $this->actingAs($this->user)
            ->getJson("/api/quizzes/{$quiz->id}");

        $response->assertOk()
            ->assertJsonFragment(['id' => $quiz->id]);
    }

    public function test_user_can_update_quiz(): void
    {
        $quiz = Quiz::factory()->create(['user_id' => $this->user->id]);

        $response = $this->actingAs($this->user)
            ->patchJson("/api/quizzes/{$quiz->id}", [
                'title' => 'Updated Title',
            ]);

        $response->assertOk()
            ->assertJsonFragment(['title' => 'Updated Title']);

        $this->assertDatabaseHas('quizzes', [
            'id' => $quiz->id,
            'title' => 'Updated Title',
        ]);
    }

    public function test_user_can_delete_quiz(): void
    {
        $quiz = Quiz::factory()->create(['user_id' => $this->user->id]);

        $response = $this->actingAs($this->user)
            ->deleteJson("/api/quizzes/{$quiz->id}");

        $response->assertOk();

        $this->assertDatabaseMissing('quizzes', ['id' => $quiz->id]);
    }

    public function test_unauthenticated_user_cannot_access_quizzes(): void
    {
        $response = $this->getJson('/api/quizzes');

        $response->assertUnauthorized();
    }

    public function test_user_cannot_view_other_users_quiz(): void
    {
        $other = User::factory()->create();
        $quiz = Quiz::factory()->create(['user_id' => $other->id]);

        $response = $this->actingAs($this->user)
            ->getJson("/api/quizzes/{$quiz->id}");

        $response->assertForbidden();
    }

    public function test_user_cannot_update_other_users_quiz(): void
    {
        $other = User::factory()->create();
        $quiz = Quiz::factory()->create(['user_id' => $other->id]);

        $response = $this->actingAs($this->user)
            ->patchJson("/api/quizzes/{$quiz->id}", [
                'title' => 'Hacked',
            ]);

        $response->assertForbidden();
    }

    public function test_user_cannot_delete_other_users_quiz(): void
    {
        $other = User::factory()->create();
        $quiz = Quiz::factory()->create(['user_id' => $other->id]);

        $response = $this->actingAs($this->user)
            ->deleteJson("/api/quizzes/{$quiz->id}");

        $response->assertForbidden();
    }

    public function test_title_is_required(): void
    {
        $response = $this->actingAs($this->user)
            ->postJson('/api/quizzes', []);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['title']);
    }

    public function test_quiz_is_created_with_draft_status(): void
    {
        $response = $this->actingAs($this->user)
            ->postJson('/api/quizzes', [
                'title' => 'New Quiz',
            ]);

        $response->assertCreated();

        $this->assertDatabaseHas('quizzes', [
            'user_id' => $this->user->id,
            'status' => 'draft',
            'visibility' => 'private',
        ]);
    }
}
