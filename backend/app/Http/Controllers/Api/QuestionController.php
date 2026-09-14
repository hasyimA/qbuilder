<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreQuestionRequest;
use App\Http\Requests\UpdateQuestionRequest;
use App\Http\Resources\QuestionResource;
use App\Models\Question;
use App\Models\Quiz;
use App\Services\QuestionService;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Carbon;

class QuestionController extends Controller
{
    public function __construct(
        private QuestionService $questionService
    ) {}

    public function index(Quiz $quiz): AnonymousResourceCollection
    {
        $this->authorize('view', $quiz);

        $questions = $quiz->questions()
            ->with('options')
            ->orderByPivot('sort_order')
            ->get();

        return QuestionResource::collection($questions);
    }

    public function store(StoreQuestionRequest $request, Quiz $quiz): JsonResponse
    {
        $this->authorize('update', $quiz);

        $created = $this->questionService->create(
            $request->normalizeDocuments($request->validated()),
            $request->user(),
            $quiz
        );

        $question = $quiz->questions()
            ->with(['options', 'tags'])
            ->withCount('quizzes')
            ->where('questions.id', $created->id)
            ->first();

        return response()->json([
            'data' => QuestionResource::make($question),
            'message' => 'Question created successfully.',
        ], 201);
    }

    public function bankIndex(Request $request): AnonymousResourceCollection
    {
        $perPage = max(1, min((int) $request->query('per_page', 20), 100));
        $sort = (string) $request->query('sort', 'updated_at');
        $sortDir = (string) $request->query('sort_dir', 'desc');

        if (! in_array($sort, ['created_at', 'updated_at', 'status', 'type', 'default_mark'], true)) {
            $sort = 'updated_at';
        }

        $filters = [
            'search' => $request->query('search'),
            'status' => $request->query('status'),
            'type' => $request->query('type'),
            'category' => $request->query('category'),
            'difficulty' => $request->query('difficulty'),
            'tag' => $request->query('tag'),
            'updated_from' => $this->optionalDate($request->query('updated_from')),
            'updated_to' => $this->optionalDate($request->query('updated_to')),
        ];

        $questions = $this->questionService->listQuestions(
            $request->user(),
            $filters,
            $perPage,
            $sort,
            $sortDir
        );

        return QuestionResource::collection($questions);
    }

    public function bankStore(StoreQuestionRequest $request): JsonResponse
    {
        $created = $this->questionService->create(
            $request->normalizeDocuments($request->validated()),
            $request->user()
        );

        return response()->json([
            'data' => QuestionResource::make(
                $created->load('options', 'tags')->loadCount('quizzes')
            ),
            'message' => 'Question created successfully.',
        ], 201);
    }

    public function filtersMeta(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->questionService->filtersMeta($request->user()),
        ]);
    }

    public function show(Question $question): JsonResponse
    {
        $this->authorize('view', $question);

        return response()->json([
            'data' => QuestionResource::make(
                $question->load('options', 'tags')->loadCount('quizzes')
            ),
        ]);
    }

    public function update(UpdateQuestionRequest $request, Question $question): JsonResponse
    {
        $this->authorize('update', $question);

        if ($request->filled('base_updated_at')
            && Carbon::parse($request->input('base_updated_at'))->lt($question->updated_at)) {
            return response()->json([
                'message' => 'This question has been modified by another session. Refresh to see the latest version.',
                'data' => QuestionResource::make($question->load('options', 'tags')),
            ], 409);
        }

        $data = $request->normalizeDocuments($request->validated());
        unset($data['base_updated_at']);

        $question = $this->questionService->update($question, $data);

        return response()->json([
            'data' => QuestionResource::make(
                $question->load('options', 'tags')->loadCount('quizzes')
            ),
            'message' => 'Question updated successfully.',
        ]);
    }

    public function destroy(Question $question): JsonResponse
    {
        $this->authorize('delete', $question);

        $usedIn = $question->quizzes()->count();
        if ($usedIn > 0) {
            return response()->json([
                'message' => "Cannot delete: this question is used in {$usedIn} quiz(es). Remove it from those quizzes first.",
            ], 409);
        }

        $this->questionService->delete($question);

        return response()->json([
            'message' => 'Question deleted successfully.',
        ]);
    }

    public function duplicate(Quiz $quiz, Question $question): JsonResponse
    {
        $this->authorize('view', $question);
        $this->authorize('update', $quiz);

        $copy = $this->questionService->duplicateIntoQuiz($question, $quiz);

        $duplicated = $quiz->questions()
            ->with(['options', 'tags'])
            ->withCount('quizzes')
            ->where('questions.id', $copy->id)
            ->first();

        return response()->json([
            'data' => QuestionResource::make($duplicated),
            'message' => 'Question duplicated successfully.',
        ], 201);
    }

    public function duplicateStandalone(Question $question): JsonResponse
    {
        $this->authorize('view', $question);

        $copy = $this->questionService->duplicate($question);

        return response()->json([
            'data' => QuestionResource::make(
                $copy->load('options', 'tags')->loadCount('quizzes')
            ),
            'message' => 'Question duplicated successfully.',
        ], 201);
    }

    public function attach(Quiz $quiz, Question $question): JsonResponse
    {
        $this->authorize('update', $quiz);
        $this->authorize('view', $question);

        try {
            $this->questionService->attachToQuiz($quiz, $question);
        } catch (DomainException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
            ], 422);
        }

        $attached = $quiz->questions()
            ->with(['options', 'tags'])
            ->withCount('quizzes')
            ->where('questions.id', $question->id)
            ->first();

        return response()->json([
            'data' => QuestionResource::make($attached),
            'message' => 'Question added to quiz successfully.',
        ], 201);
    }

    public function detach(Quiz $quiz, Question $question): JsonResponse
    {
        $this->authorize('update', $quiz);

        $removed = $this->questionService->detachFromQuiz($quiz, $question);

        if ($removed === 0) {
            return response()->json([
                'message' => 'Question is not part of this quiz.',
            ], 404);
        }

        return response()->json([
            'message' => 'Question removed from quiz successfully.',
        ]);
    }

    private function optionalDate(mixed $value): ?Carbon
    {
        if (! is_string($value) || $value === '') {
            return null;
        }

        $date = Carbon::parse($value);

        return $date->isValid() ? $date : null;
    }
}
