<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateAccountPasswordRequest;
use App\Http\Requests\UpdateAccountProfileRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $request->user(),
        ]);
    }

    public function updateProfile(UpdateAccountProfileRequest $request): JsonResponse
    {
        $user = $request->user();
        $user->fill($request->validated())->save();

        return response()->json([
            'data' => $user->fresh(),
            'message' => 'Profile updated successfully.',
        ]);
    }

    public function updatePassword(UpdateAccountPasswordRequest $request): JsonResponse
    {
        $user = $request->user();
        $user->update(['password' => $request->validated('password')]);

        $this->revokeOtherTokens($user);

        return response()->json([
            'message' => 'Password updated successfully.',
        ]);
    }

    /**
     * Revoke the user's other tokens while keeping the session that made the
     * change alive — changing your own password must not log you out.
     */
    private function revokeOtherTokens(User $user): void
    {
        $query = $user->tokens();
        $currentToken = $user->currentAccessToken();

        if ($currentToken !== null) {
            $query->whereKeyNot($currentToken->getKey());
        }

        $query->delete();
    }
}
