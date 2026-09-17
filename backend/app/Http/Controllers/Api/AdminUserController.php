<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ResetUserPasswordRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Http\Resources\AdminUserResource;
use App\Models\User;
use App\Services\AdminUserService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AdminUserController extends Controller
{
    public function __construct(
        private AdminUserService $adminUserService
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->only(['search', 'role', 'status', 'sort', 'sort_dir']);
        $perPage = max(1, min($request->integer('per_page', 20), 100));

        return AdminUserResource::collection(
            $this->adminUserService->listUsers($filters, $perPage)
        );
    }

    public function show(User $user): JsonResponse
    {
        return response()->json([
            'data' => new AdminUserResource($this->adminUserService->detail($user)),
        ]);
    }

    public function update(UpdateUserRequest $request, User $user): JsonResponse
    {
        $updated = $this->adminUserService->update($request->user(), $user, $request->validated());

        return response()->json([
            'data' => new AdminUserResource($updated),
            'message' => 'User updated successfully.',
        ]);
    }

    public function resetPassword(ResetUserPasswordRequest $request, User $user): JsonResponse
    {
        $updated = $this->adminUserService->resetPassword(
            $request->user(),
            $user,
            (string) $request->validated('password')
        );

        return response()->json([
            'data' => new AdminUserResource($updated),
            'message' => 'Password reset successfully.',
        ]);
    }

    public function revokeTokens(Request $request, User $user): JsonResponse
    {
        $revokedCount = $this->adminUserService->revokeTokens($request->user(), $user);

        return response()->json([
            'data' => ['revoked_count' => $revokedCount],
            'message' => 'Tokens revoked successfully.',
        ]);
    }
}
