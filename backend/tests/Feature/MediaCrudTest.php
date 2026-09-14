<?php

namespace Tests\Feature;

use App\Models\Media;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Testing\File;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MediaCrudTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        $this->user = User::factory()->create();
    }

    private function image(): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'media').'.png';
        file_put_contents(
            $path,
            base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=')
        );

        return new UploadedFile($path, 'question-image.png', 'image/png', null, true);
    }

    public function test_user_can_upload_media(): void
    {
        $image = $this->image();

        $response = $this->actingAs($this->user)
            ->postJson('/api/media', [
                'file' => $image,
                'alt_text' => 'Diagram of x',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.mime_type', 'image/png')
            ->assertJsonPath('data.alt_text', 'Diagram of x')
            ->assertJsonPath('data.width', 1)
            ->assertJsonPath('data.height', 1);

        $this->assertDatabaseHas('media', [
            'user_id' => $this->user->id,
            'mime_type' => 'image/png',
            'size' => $image->getSize(),
        ]);

        $storagePath = Media::first()->storage_path;
        Storage::disk('public')->assertExists($storagePath);
    }

    public function test_upload_rejects_non_image_file(): void
    {
        $response = $this->actingAs($this->user)
            ->postJson('/api/media', [
                'file' => File::create('notes.txt', 'not an image'),
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['file']);
    }

    public function test_user_can_delete_own_media(): void
    {
        $media = Media::factory()->create(['user_id' => $this->user->id]);

        $response = $this->actingAs($this->user)
            ->deleteJson("/api/media/{$media->id}");

        $response->assertOk();

        $this->assertDatabaseMissing('media', ['id' => $media->id]);
        Storage::disk('public')->assertMissing($media->storage_path);
    }

    public function test_user_can_view_own_media(): void
    {
        $media = Media::factory()->create(['user_id' => $this->user->id]);

        $response = $this->actingAs($this->user)
            ->getJson("/api/media/{$media->id}");

        $response->assertOk()
            ->assertJsonPath('data.id', $media->id);
    }

    public function test_user_cannot_delete_other_users_media(): void
    {
        $other = User::factory()->create();
        $media = Media::factory()->create(['user_id' => $other->id]);

        $response = $this->actingAs($this->user)
            ->deleteJson("/api/media/{$media->id}");

        $response->assertForbidden();

        $this->assertDatabaseHas('media', ['id' => $media->id]);
    }

    public function test_user_cannot_view_other_users_media(): void
    {
        $other = User::factory()->create();
        $media = Media::factory()->create(['user_id' => $other->id]);

        $response = $this->actingAs($this->user)
            ->getJson("/api/media/{$media->id}");

        $response->assertForbidden();
    }

    public function test_user_can_download_own_media_file(): void
    {
        $content = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
        $media = Media::factory()->create(['user_id' => $this->user->id]);
        Storage::disk('public')->put($media->storage_path, $content);

        $response = $this->actingAs($this->user)
            ->get("/api/media/{$media->id}/file");

        $response->assertOk()
            ->assertHeader('Content-Type', 'image/png');
        $this->assertSame($content, $response->streamedContent());
    }

    public function test_user_cannot_download_other_users_media_file(): void
    {
        $other = User::factory()->create();
        $media = Media::factory()->create(['user_id' => $other->id]);
        Storage::disk('public')->put($media->storage_path, 'x');

        $response = $this->actingAs($this->user)
            ->get("/api/media/{$media->id}/file");

        $response->assertForbidden();
    }

    public function test_download_media_file_returns_404_when_missing_on_disk(): void
    {
        $media = Media::factory()->create(['user_id' => $this->user->id]);

        $response = $this->actingAs($this->user)
            ->get("/api/media/{$media->id}/file");

        $response->assertNotFound();
    }

    public function test_download_media_file_requires_authentication(): void
    {
        $media = Media::factory()->create(['user_id' => $this->user->id]);
        Storage::disk('public')->put($media->storage_path, 'x');

        $response = $this->getJson("/api/media/{$media->id}/file");

        $response->assertUnauthorized();
    }

    public function test_stored_extension_derives_from_sniffed_mime_not_client_extension(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'media').'.txt';
        file_put_contents(
            $path,
            base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=')
        );
        $image = new UploadedFile($path, 'question-image.txt', 'image/png', null, true);

        $response = $this->actingAs($this->user)
            ->postJson('/api/media', [
                'file' => $image,
            ]);

        $response->assertCreated()->assertJsonPath('data.mime_type', 'image/png');

        $this->assertStringEndsWith('.png', Media::first()->storage_path);
        Storage::disk('public')->assertExists(Media::first()->storage_path);
    }

    public function test_display_filename_is_sanitized_to_basename(): void
    {
        $image = $this->image();
        $image->getClientOriginalName();

        $uploaded = new UploadedFile(
            $image->getPathname(),
            '../../portal.png',
            'image/png',
            null,
            true
        );

        $response = $this->actingAs($this->user)
            ->postJson('/api/media', [
                'file' => $uploaded,
            ]);

        $response->assertCreated()->assertJsonPath('data.filename', 'portal.png');
    }

    public function test_upload_requires_authentication(): void
    {
        $response = $this->postJson('/api/media', [
            'file' => $this->image(),
        ]);

        $response->assertUnauthorized();
    }

    public function test_delete_media_is_authenticated_only(): void
    {
        $media = Media::factory()->create(['user_id' => $this->user->id]);

        $response = $this->deleteJson("/api/media/{$media->id}");

        $response->assertUnauthorized();
    }
}
