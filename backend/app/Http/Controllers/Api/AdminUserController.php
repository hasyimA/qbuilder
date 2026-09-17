<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ImportAdminUsersRequest;
use App\Http\Requests\ResetUserPasswordRequest;
use App\Http\Requests\StoreAdminUserRequest;
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

    public function store(StoreAdminUserRequest $request): JsonResponse
    {
        $result = $this->adminUserService->create($request->user(), $request->validated());

        $payload = [
            'data' => new AdminUserResource($result['user']),
            'message' => 'User created successfully.',
        ];

        if ($result['temporary_password'] !== null) {
            $payload['temporary_password'] = $result['temporary_password'];
        }

        return response()->json($payload, 201);
    }

    public function import(ImportAdminUsersRequest $request): JsonResponse
    {
        $dryRun = $request->boolean('dry_run', true);

        $summary = $dryRun
            ? $this->adminUserService->previewImport($request->file('file'))
            : $this->adminUserService->commitImport($request->file('file'));

        return response()->json([
            'data' => $summary,
            'message' => $dryRun ? 'Import preview generated.' : 'Import completed.',
        ]);
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
