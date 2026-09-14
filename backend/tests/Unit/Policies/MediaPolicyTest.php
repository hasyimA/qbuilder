<?php

namespace Tests\Unit\Policies;

use App\Models\Media;
use App\Models\User;
use App\Policies\MediaPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MediaPolicyTest extends TestCase
{
    use RefreshDatabase;

    private MediaPolicy $policy;

    protected function setUp(): void
    {
        parent::setUp();
        $this->policy = new MediaPolicy;
    }

    public function test_owner_can_view_own_media(): void
    {
        $user = User::factory()->create();
        $media = Media::factory()->create(['user_id' => $user->id]);

        $this->assertTrue($this->policy->view($user, $media));
    }

    public function test_owner_can_delete_own_media(): void
    {
        $user = User::factory()->create();
        $media = Media::factory()->create(['user_id' => $user->id]);

        $this->assertTrue($this->policy->delete($user, $media));
    }

    public function test_non_owner_cannot_view_media(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $media = Media::factory()->create(['user_id' => $owner->id]);

        $this->assertFalse($this->policy->view($other, $media));
    }

    public function test_non_owner_cannot_delete_media(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $media = Media::factory()->create(['user_id' => $owner->id]);

        $this->assertFalse($this->policy->delete($other, $media));
    }
}
