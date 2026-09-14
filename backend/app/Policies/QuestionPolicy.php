<?php

namespace App\Policies;

use App\Models\Question;
use App\Models\Quiz;
use App\Models\User;

class QuestionPolicy
{
    public function view(User $user, Question $question): bool
    {
        return $user->id === $question->user_id;
    }

    public function create(User $user): bool
    {
        return true;
    }

    public function update(User $user, Question $question): bool
    {
        return $user->id === $question->user_id;
    }

    public function delete(User $user, Question $question, ?Quiz $quiz = null): bool
    {
        if ($quiz && $quiz->user_id === $user->id) {
            return true;
        }

        return $user->id === $question->user_id;
    }

    public function duplicate(User $user, Question $question): bool
    {
        return $user->id === $question->user_id;
    }
}
