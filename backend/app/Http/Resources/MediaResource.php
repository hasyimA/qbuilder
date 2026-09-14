<?php

namespace App\Http\Resources;

use App\Services\MediaService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MediaResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $url = app(MediaService::class)->urlOf($this->resource);

        return [
            'id' => $this->id,
            'filename' => $this->filename,
            'mime_type' => $this->mime_type,
            'size' => $this->size,
            'url' => $url,
            'width' => $this->width,
            'height' => $this->height,
            'alt_text' => $this->alt_text,
            'created_at' => $this->created_at,
        ];
    }
}
