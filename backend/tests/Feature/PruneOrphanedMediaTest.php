<?php

namespace Tests\Feature;

use App\Models\Media;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PruneOrphanedMediaTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    public function test_lists_orphaned_files_and_keeps_tracked_files(): void
    {
        Storage::disk('public')->put('media/tracked.png', 'data');
        Storage::disk('public')->put('media/orphan-1.png', 'data');
        Storage::disk('public')->put('media/orphan-2.png', 'data');
        Media::factory()->create(['storage_path' => 'media/tracked.png']);

        $this->artisan('media:prune')
            ->expectsOutputToContain('media/orphan-1.png')
            ->expectsOutputToContain('media/orphan-2.png')
            ->expectsOutputToContain('2 orphaned file(s) found.')
            ->assertExitCode(0);

        Storage::disk('public')->assertExists('media/tracked.png');
        Storage::disk('public')->assertExists('media/orphan-1.png');
    }

    public function test_delete_flag_removes_only_orphaned_files(): void
    {
        Storage::disk('public')->put('media/tracked.png', 'data');
        Storage::disk('public')->put('media/orphan.png', 'data');
        Media::factory()->create(['storage_path' => 'media/tracked.png']);

        $this->artisan('media:prune', ['--delete' => true])
            ->expectsOutputToContain('Deleted orphan: media/orphan.png')
            ->assertExitCode(0);

        Storage::disk('public')->assertExists('media/tracked.png');
        Storage::disk('public')->assertMissing('media/orphan.png');
    }

    public function test_reports_nothing_when_no_orphans(): void
    {
        Storage::disk('public')->put('media/tracked.png', 'data');
        Media::factory()->create(['storage_path' => 'media/tracked.png']);

        $this->artisan('media:prune')
            ->expectsOutputToContain('No orphaned media files found.')
            ->assertExitCode(0);
    }
}
