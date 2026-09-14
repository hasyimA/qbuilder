<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UploadMediaRequest;
use App\Http\Resources\MediaResource;
use App\Models\Media;
use App\Services\MediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class MediaController extends Controller
{
    public function __construct(
        private MediaService $mediaService
    ) {}

    public function store(UploadMediaRequest $request): JsonResponse
    {
        $media = $this->mediaService->upload(
            $request->file('file'),
            $request->user(),
            $request->validated('alt_text')
        );

        return response()->json([
            'data' => MediaResource::make($media),
            'message' => 'Media uploaded successfully.',
        ], 201);
    }

    public function destroy(Media $media): JsonResponse
    {
        $this->authorize('delete', $media);

        $this->mediaService->delete($media);

        return response()->json([
            'message' => 'Media deleted successfully.',
        ]);
    }

    public function show(Media $media): JsonResponse
    {
        $this->authorize('view', $media);

        return response()->json([
            'data' => MediaResource::make($media),
        ]);
    }

    /**
     * Serves the media file bytes through the API so cross-origin browsers can
     * read it (the raw /storage path bypasses Laravel and lacks CORS headers,
     * which breaks base64 inlining during Moodle export).
     */
    public function file(Media $media): BinaryFileResponse
    {
        $this->authorize('view', $media);

        if (! Storage::disk('public')->exists($media->storage_path)) {
            abort(404, 'Media file not found.');
        }

        return response()->file(
            Storage::disk('public')->path($media->storage_path),
            ['Content-Type' => $media->mime_type]
        );
    }
}
