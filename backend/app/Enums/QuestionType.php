<?php

namespace App\Enums;

enum QuestionType: string
{
    case MultipleChoice = 'multiple_choice';
    case TrueFalse = 'true_false';
    case ShortAnswer = 'short_answer';
    case Essay = 'essay';
    case Matching = 'matching';

    public function label(): string
    {
        return match ($this) {
            self::MultipleChoice => 'Multiple Choice',
            self::TrueFalse => 'True / False',
            self::ShortAnswer => 'Short Answer',
            self::Essay => 'Essay',
            self::Matching => 'Matching',
        };
    }

    public function requiresOptions(): bool
    {
        return $this === self::MultipleChoice || $this === self::TrueFalse || $this === self::Matching;
    }
}
