<?php

namespace App\Enums;

enum QuestionStatus: string
{
    case Draft = 'draft';
    case Complete = 'complete';

    public function label(): string
    {
        return match ($this) {
            self::Draft => 'Draft',
            self::Complete => 'Complete',
        };
    }
}
