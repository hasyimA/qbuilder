<?php

namespace Tests\Unit\Models;

use App\Models\Media;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MediaModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_media_belongs_to_user(): void
    {
        $user = User::factory()->create();
        $media = Media::factory()->create(['user_id' => $user->id]);

        $this->assertInstanceOf(User::class, $media->user);
        $this->assertEquals($user->id, $media->user_id);
    }

    public function test_media_dimensions_are_integers(): void
    {
        $media = Media::factory()->create(['width' => 1920, 'height' => 1080]);

        $this->assertIsInt($media->width);
        $this->assertIsInt($media->height);
        $this->assertEquals(1920, $media->width);
        $this->assertEquals(1080, $media->height);
    }
}
