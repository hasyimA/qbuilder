<?php

namespace App\Services;

use App\Models\Media;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class MediaService
{
    private const STORAGE_DISK = 'public';

    private const UPLOAD_DIRECTORY = 'media';

    private const ALLOWED_MIME_TYPES = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
    ];

    /**
     * File extension is derived from the sniffed (finfo) MIME type, never from
     * the client-supplied extension, so the stored path reflects the actual
     * bytes and content served from /storage always matches its extension.
     */
    private const MIME_EXTENSION_MAP = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/gif' => 'gif',
        'image/webp' => 'webp',
    ];

    public function upload(UploadedFile $file, User $user, ?string $altText = null): Media
    {
        $mimeType = (string) $file->getMimeType();

        if (! in_array($mimeType, self::ALLOWED_MIME_TYPES, true)) {
            throw new \RuntimeException('Unsupported media type.');
        }

        $extension = self::MIME_EXTENSION_MAP[$mimeType];
        $filename = Str::random(32).'.'.$extension;

        $storagePath = $file->storeAs(self::UPLOAD_DIRECTORY, $filename, self::STORAGE_DISK);

        if ($storagePath === false) {
            throw new \RuntimeException('Unable to store uploaded file.');
        }

        [$width, $height] = $this->dimensionsOf($file, $mimeType);

        return Media::create([
            'user_id' => $user->id,
            'filename' => basename($file->getClientOriginalName() ?: $filename),
            'mime_type' => $mimeType,
            'size' => $file->getSize(),
            'storage_path' => $storagePath,
            'width' => $width,
            'height' => $height,
            'alt_text' => $altText,
        ]);
    }

    public function delete(Media $media): bool
    {
        Storage::disk(self::STORAGE_DISK)->delete($media->storage_path);

        return (bool) $media->delete();
    }

    public function urlOf(Media $media): ?string
    {
        return Storage::disk(self::STORAGE_DISK)->url($media->storage_path);
    }

    private function dimensionsOf(UploadedFile $file, ?string $mimeType): array
    {
        if ($mimeType === 'image/svg+xml' || ! str_starts_with((string) $mimeType, 'image/')) {
            return [null, null];
        }

        $path = $file->getRealPath();
        if (! is_file($path)) {
            return [null, null];
        }

        $info = @getimagesize($path);
        if ($info === false) {
            return [null, null];
        }

        return [$info[0], $info[1]];
    }
}
