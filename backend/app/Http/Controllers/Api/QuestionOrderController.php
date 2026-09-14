<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReorderQuestionsRequest;
use App\Models\Quiz;
use App\Services\QuestionService;
use Illuminate\Http\JsonResponse;

class QuestionOrderController extends Controller
{
    public function __construct(
        private QuestionService $questionService
    ) {}

    public function __invoke(ReorderQuestionsRequest $request, Quiz $quiz): JsonResponse
    {
        $this->authorize('update', $quiz);

        $this->questionService->reorder($quiz, $request->validated('order'));

        return response()->json([
            'message' => 'Question order updated successfully.',
        ]);
    }
}
