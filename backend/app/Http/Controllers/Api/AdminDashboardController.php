<?php

namespace App\Http\Controllers\Api;

use App\Enums\QuizStatus;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Models\Media;
use App\Models\Question;
use App\Models\Quiz;
use App\Models\User;
use Illuminate\Http\JsonResponse;

class AdminDashboardController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => [
                'users' => [
                    'total' => User::query()->count(),
                    'active' => User::query()->where('status', UserStatus::Active)->count(),
                    'moodle_linked' => User::query()->whereNotNull('moodle_user_id')->count(),
                ],
                'quizzes' => [
                    'total' => Quiz::query()->count(),
                    'published' => Quiz::query()->where('status', QuizStatus::Published)->count(),
                ],
                'questions' => [
                    'total' => Question::query()->count(),
                ],
                'media' => [
                    'total' => Media::query()->count(),
                ],
                'moodle' => [
                    'url' => (string) config('services.moodle.url'),
                    'service' => (string) config('services.moodle.service'),
                ],
            ],
        ]);
    }
}
