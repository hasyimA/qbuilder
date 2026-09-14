<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\MediaController;
use App\Http\Controllers\Api\QuestionController;
use App\Http\Controllers\Api\QuestionOrderController;
use App\Http\Controllers\Api\QuizController;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Health: public liveness + DB connectivity probe for load balancers and
| uptime monitors. Laravel's built-in `GET /up` (web route) stays as a
| stateless ping; this endpoint additionally verifies the database.
*/

Route::get('/health', function () {
    try {
        DB::select('select 1');
        $status = 200;
        $database = 'ok';
    } catch (Throwable) {
        $status = 503;
        $database = 'unreachable';
    }

    return response()->json([
        'status' => $status === 200 ? 'ok' : 'degraded',
        'service' => 'quiz-builder-api',
        'database' => $database,
        'timestamp' => now()->toIso8601String(),
    ], $status);
});

Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:login');
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', [AuthController::class, 'user']);

    Route::get('/quizzes', [QuizController::class, 'index']);
    Route::get('/quizzes/filters/meta', [QuizController::class, 'filtersMeta']);
    Route::get('/quizzes/{quiz}', [QuizController::class, 'show']);
    Route::get('/quizzes/{quiz}/questions', [QuestionController::class, 'index']);

    Route::get('/questions', [QuestionController::class, 'bankIndex']);
    Route::get('/questions/filters/meta', [QuestionController::class, 'filtersMeta']);
    Route::get('/questions/{question}', [QuestionController::class, 'show']);

    Route::get('/media/{media}', [MediaController::class, 'show']);
    Route::get('/media/{media}/file', [MediaController::class, 'file']);
});

Route::middleware(['auth:sanctum', 'throttle:mutations'])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::post('/quizzes', [QuizController::class, 'store']);
    Route::patch('/quizzes/{quiz}', [QuizController::class, 'update']);
    Route::delete('/quizzes/{quiz}', [QuizController::class, 'destroy']);
    Route::post('/quizzes/{quiz}/duplicate', [QuizController::class, 'duplicate']);

    Route::post('/quizzes/{quiz}/questions', [QuestionController::class, 'store']);
    Route::patch('/quizzes/{quiz}/questions/order', QuestionOrderController::class);
    Route::post('/quizzes/{quiz}/questions/{question}/duplicate', [QuestionController::class, 'duplicate']);
    Route::post('/quizzes/{quiz}/questions/{question}/attach', [QuestionController::class, 'attach']);
    Route::delete('/quizzes/{quiz}/questions/{question}', [QuestionController::class, 'detach']);

    Route::post('/questions', [QuestionController::class, 'bankStore']);
    Route::patch('/questions/{question}', [QuestionController::class, 'update']);
    Route::delete('/questions/{question}', [QuestionController::class, 'destroy']);
    Route::post('/questions/{question}/duplicate', [QuestionController::class, 'duplicateStandalone']);

    Route::post('/media', [MediaController::class, 'store']);
    Route::delete('/media/{media}', [MediaController::class, 'destroy']);
});
