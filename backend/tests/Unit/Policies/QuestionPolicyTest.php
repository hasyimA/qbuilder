<?php

namespace Tests\Unit\Policies;

use App\Models\Question;
use App\Models\User;
use App\Policies\QuestionPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuestionPolicyTest extends TestCase
{
    use RefreshDatabase;

    private QuestionPolicy $policy;

    protected function setUp(): void
    {
        parent::setUp();
        $this->policy = new QuestionPolicy;
    }

    public function test_owner_can_view_own_question(): void
    {
        $user = User::factory()->create();
        $question = Question::factory()->create(['user_id' => $user->id]);

        $this->assertTrue($this->policy->view($user, $question));
    }

    public function test_owner_can_update_own_question(): void
    {
        $user = User::factory()->create();
        $question = Question::factory()->create(['user_id' => $user->id]);

        $this->assertTrue($this->policy->update($user, $question));
    }

    public function test_owner_can_duplicate_own_question(): void
    {
        $user = User::factory()->create();
        $question = Question::factory()->create(['user_id' => $user->id]);

        $this->assertTrue($this->policy->duplicate($user, $question));
    }

    public function test_non_owner_cannot_update_question(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $question = Question::factory()->create(['user_id' => $owner->id]);

        $this->assertFalse($this->policy->update($other, $question));
    }

    public function test_non_owner_cannot_view_question(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $question = Question::factory()->create(['user_id' => $owner->id]);

        $this->assertFalse($this->policy->view($other, $question));
    }

    public function test_non_owner_cannot_duplicate_question(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $question = Question::factory()->create(['user_id' => $owner->id]);

        $this->assertFalse($this->policy->duplicate($other, $question));
    }
}
