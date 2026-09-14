<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class QuestionOptionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'content' => $this->content,
            'is_correct' => $this->is_correct,
            'fraction' => $this->fraction,
            'feedback' => $this->feedback,
            'sort_order' => $this->sort_order,
        ];
    }
}
