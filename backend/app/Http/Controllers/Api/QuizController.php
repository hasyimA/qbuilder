<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreQuizRequest;
use App\Http\Requests\UpdateQuizRequest;
use App\Http\Resources\QuizResource;
use App\Models\Quiz;
use App\Services\QuizService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class QuizController extends Controller
{
    public function __construct(
        private QuizService $quizService
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->only([
            'search', 'status', 'category', 'tag', 'type',
            'min_questions', 'max_questions', 'updated_from', 'updated_to',
            'sort', 'sort_dir',
        ]);

        $perPage = max(1, min($request->integer('per_page', 20), 100));
        $tab = in_array($request->query('tab', 'mine'), ['mine', 'shared'], true)
            ? (string) $request->query('tab', 'mine')
            : 'mine';

        $quizzes = $this->quizService->listQuizzes($request->user(), $filters, $perPage, $tab);

        return QuizResource::collection($quizzes);
    }

    /** Option lists (categories/tags/types) to drive the dashboard filter controls. */
    public function filtersMeta(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->quizService->filtersMeta($request->user()),
        ]);
    }

    public function store(StoreQuizRequest $request): JsonResponse
    {
        $quiz = $this->quizService->create($request->validated(), $request->user());

        return response()->json([
            'data' => new QuizResource($quiz->load(['user:id,name', 'tags:id,name,slug'])),
            'message' => 'Quiz created successfully.',
        ], 201);
    }

    public function show(Quiz $quiz): JsonResponse
    {
        $this->authorize('view', $quiz);

        $quiz->loadCount('questions')
            ->load(['user:id,name', 'tags:id,name,slug', 'questions:id,type']);

        return response()->json([
            'data' => new QuizResource($quiz),
        ]);
    }

    public function update(UpdateQuizRequest $request, Quiz $quiz): JsonResponse
    {
        $this->authorize('update', $quiz);

        $quiz = $this->quizService->update($quiz, $request->validated());

        return response()->json([
            'data' => new QuizResource($quiz->load(['user:id,name', 'tags:id,name,slug'])),
            'message' => 'Quiz updated successfully.',
        ]);
    }

    public function destroy(Quiz $quiz): JsonResponse
    {
        $this->authorize('delete', $quiz);

        $this->quizService->delete($quiz);

        return response()->json([
            'message' => 'Quiz deleted successfully.',
        ]);
    }

    /** Clone any quiz the requester is allowed to view; the copy becomes theirs. */
    public function duplicate(Request $request, Quiz $quiz): JsonResponse
    {
        $this->authorize('view', $quiz);

        $copy = $this->quizService->duplicate($quiz, $request->user());

        return response()->json([
            'data' => new QuizResource($copy),
            'message' => 'Quiz duplicated successfully.',
        ], 201);
    }
}
