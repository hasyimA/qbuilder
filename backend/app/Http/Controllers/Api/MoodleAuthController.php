<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\MoodleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class MoodleAuthController extends Controller
{
    /**
     * Authenticate using Moodle credentials, link or create local user, and issue Sanctum token.
     */
    public function login(Request $request, MoodleService $moodle): JsonResponse
    {
        $validated = $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        $token = $moodle->authenticate($validated['username'], $validated['password']);

        if (! $token) {
            throw ValidationException::withMessages([
                'username' => ['Username atau kata sandi e-Learning Moodle tidak valid.'],
            ]);
        }

        $siteInfo = $moodle->getSiteInfo($token);

        if (! $siteInfo || ! isset($siteInfo['userid'])) {
            throw ValidationException::withMessages([
                'username' => ['Gagal memverifikasi informasi akun dari server e-Learning Moodle.'],
            ]);
        }

        $moodleUserId = (int) $siteInfo['userid'];
        $moodleUsername = (string) ($siteInfo['username'] ?? $validated['username']);

        // Fetch detailed profile to get official email if available
        $profile = $moodle->getUserProfile($moodleUserId, $token);
        $fullName = (string) ($profile['fullname'] ?? $siteInfo['fullname'] ?? $moodleUsername);
        $email = ! empty($profile['email'])
            ? (string) $profile['email']
            : "{$moodleUsername}@moodle.smkbinarahayu.sch.id";

        // Find existing user by moodle_user_id or matched email
        $user = User::where('moodle_user_id', $moodleUserId)->first();

        if (! $user) {
            $user = User::where('email', $email)->first();
        }

        if ($user) {
            $user->update([
                'moodle_user_id' => $moodleUserId,
                'moodle_username' => $moodleUsername,
                'moodle_token' => $token,
                'name' => $fullName ?: $user->name,
            ]);
        } else {
            $user = User::create([
                'name' => $fullName,
                'email' => $email,
                'password' => Hash::make(Str::random(32)),
                'role' => UserRole::User,
                'status' => UserStatus::Active,
                'moodle_user_id' => $moodleUserId,
                'moodle_username' => $moodleUsername,
                'moodle_token' => $token,
            ]);
        }

        if ($user->isSuspended()) {
            throw ValidationException::withMessages([
                'username' => ['Akun Anda telah ditangguhkan oleh administrator.'],
            ]);
        }

        $authToken = $user->createToken('moodle-auth-token')->plainTextToken;

        return response()->json([
            'data' => [
                'user' => $user->fresh(),
                'token' => $authToken,
                'moodle' => [
                    'site_name' => $siteInfo['sitename'] ?? 'e-Learning',
                    'user_id' => $moodleUserId,
                    'username' => $moodleUsername,
                ],
            ],
            'message' => 'Login berhasil menggunakan akun e-Learning Moodle.',
        ]);
    }

    /**
     * Get list of courses enrolled by the authenticated user in Moodle.
     */
    public function courses(Request $request, MoodleService $moodle): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! $user->moodle_user_id) {
            return response()->json([
                'message' => 'Akun Quiz Builder Anda belum terhubung dengan akun e-Learning Moodle.',
                'data' => [],
            ], 400);
        }

        $courses = $moodle->getUserCourses($user->moodle_user_id, $user->moodle_token);

        return response()->json([
            'data' => $courses,
            'message' => 'Daftar mata pelajaran / course berhasil diambil dari e-Learning.',
        ]);
    }
}
