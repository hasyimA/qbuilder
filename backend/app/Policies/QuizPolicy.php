<?php

namespace App\Policies;

use App\Models\Quiz;
use App\Models\User;

class QuizPolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, Quiz $quiz): bool
    {
        if ($quiz->user_id === $user->id) {
            return true;
        }

        return in_array($quiz->visibility->value, ['public', 'school'], true);
    }

    public function create(User $user): bool
    {
        return true;
    }

    public function update(User $user, Quiz $quiz): bool
    {
        return $user->id === $quiz->user_id;
    }

    public function delete(User $user, Quiz $quiz): bool
    {
        return $user->id === $quiz->user_id;
    }

    public function addQuestion(User $user, Quiz $quiz): bool
    {
        return $user->id === $quiz->user_id;
    }
}
