<?php

namespace Tests\Unit\Policies;

use App\Models\Quiz;
use App\Models\User;
use App\Policies\QuizPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuizPolicyTest extends TestCase
{
    use RefreshDatabase;

    private QuizPolicy $policy;

    protected function setUp(): void
    {
        parent::setUp();
        $this->policy = new QuizPolicy;
    }

    public function test_owner_can_view_own_quiz(): void
    {
        $user = User::factory()->create();
        $quiz = Quiz::factory()->create(['user_id' => $user->id]);

        $this->assertTrue($this->policy->view($user, $quiz));
    }

    public function test_owner_can_update_own_quiz(): void
    {
        $user = User::factory()->create();
        $quiz = Quiz::factory()->create(['user_id' => $user->id]);

        $this->assertTrue($this->policy->update($user, $quiz));
    }

    public function test_owner_can_delete_own_quiz(): void
    {
        $user = User::factory()->create();
        $quiz = Quiz::factory()->create(['user_id' => $user->id]);

        $this->assertTrue($this->policy->delete($user, $quiz));
    }

    public function test_non_owner_cannot_update_quiz(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $quiz = Quiz::factory()->create(['user_id' => $owner->id]);

        $this->assertFalse($this->policy->update($other, $quiz));
    }

    public function test_non_owner_cannot_delete_quiz(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $quiz = Quiz::factory()->create(['user_id' => $owner->id]);

        $this->assertFalse($this->policy->delete($other, $quiz));
    }

    public function test_non_owner_cannot_view_private_quiz(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $quiz = Quiz::factory()->create(['user_id' => $owner->id, 'visibility' => 'private']);

        $this->assertFalse($this->policy->view($other, $quiz));
    }

    public function test_non_owner_can_view_public_quiz(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $quiz = Quiz::factory()->create(['user_id' => $owner->id, 'visibility' => 'public']);

        $this->assertTrue($this->policy->view($other, $quiz));
    }

    public function test_non_owner_can_view_school_quiz(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $quiz = Quiz::factory()->create(['user_id' => $owner->id, 'visibility' => 'school']);

        $this->assertTrue($this->policy->view($other, $quiz));
    }
}
