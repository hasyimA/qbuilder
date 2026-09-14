<?php

namespace Tests\Unit\Models;

use App\Models\Tag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TagModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_tag_slug_is_auto_generated(): void
    {
        $tag = Tag::create(['name' => 'Network System']);

        $this->assertEquals('network-system', $tag->slug);
    }

    public function test_tag_slug_is_unique(): void
    {
        $tag1 = Tag::create(['name' => 'Jaringan']);
        $tag2 = Tag::create(['name' => 'Jaringan 2']);

        $this->assertNotEquals($tag1->slug, $tag2->slug);
    }
}
