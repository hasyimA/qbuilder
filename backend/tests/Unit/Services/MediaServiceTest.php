<?php

namespace Tests\Unit\Services;

use App\Models\User;
use App\Services\MediaService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MediaServiceTest extends TestCase
{
    use RefreshDatabase;

    private function png(int $suffix = 0): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'media').$suffix.'.png';
        file_put_contents(
            $path,
            base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=')
        );

        return new UploadedFile($path, "question-image{$suffix}.png", 'image/png', null, true);
    }

    public function test_upload_rejects_non_image_mime(): void
    {
        Storage::fake('public');
        $path = tempnam(sys_get_temp_dir(), 'media').'.txt';
        file_put_contents($path, 'not an image at all, just text');

        $file = new UploadedFile($path, 'notes.txt', 'text/plain', null, true);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Unsupported media type.');

        app(MediaService::class)->upload($file, User::factory()->create());
    }

    public function test_upload_generates_unique_filenames(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();

        $first = app(MediaService::class)->upload($this->png(1), $user);
        $second = app(MediaService::class)->upload($this->png(2), $user);

        $this->assertNotSame($first->storage_path, $second->storage_path);
        $this->assertNotSame($first->filename, $second->filename);
        Storage::disk('public')->assertExists($first->storage_path);
        Storage::disk('public')->assertExists($second->storage_path);
    }

    public function test_upload_records_metadata(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();

        $media = app(MediaService::class)->upload($this->png(3), $user, 'Diagram');

        $this->assertSame('image/png', $media->mime_type);
        $this->assertSame(1, $media->width);
        $this->assertSame(1, $media->height);
        $this->assertSame('Diagram', $media->alt_text);
        $this->assertSame($user->id, $media->user_id);
    }
}
