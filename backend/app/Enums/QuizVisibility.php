<?php

namespace App\Enums;

enum QuizVisibility: string
{
    case Private = 'private';
    case School = 'school';
    case Public = 'public';

    public function label(): string
    {
        return match ($this) {
            self::Private => 'Private',
            self::School => 'School',
            self::Public => 'Public',
        };
    }
}
