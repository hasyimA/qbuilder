<?php

namespace App\Services;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Validation\ValidationException;

class AdminUserService
{
    /**
     * Paginated, filterable user listing with per-user activity counts.
     *
     * @param  array<string, mixed>  $filters
     */
    public function listUsers(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        $query = User::query()->withCount(['quizzes', 'questions', 'media']);

        $search = trim((string) ($filters['search'] ?? ''));
        if ($search !== '') {
            $query->where(function ($builder) use ($search): void {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $role = trim((string) ($filters['role'] ?? ''));
        if ($role !== '') {
            $query->where('role', $role);
        }

        $status = trim((string) ($filters['status'] ?? ''));
        if ($status !== '') {
            $query->where('status', $status);
        }

        $sort = in_array($filters['sort'] ?? '', ['name', 'email', 'created_at', 'updated_at'], true)
            ? (string) $filters['sort']
            : 'created_at';
        $direction = ($filters['sort_dir'] ?? '') === 'asc' ? 'asc' : 'desc';

        return $query->orderBy($sort, $direction)->paginate($perPage);
    }

    /** User detail with counts and a short recent-activity feed. */
    public function detail(User $user): User
    {
        return $user->loadCount(['quizzes', 'questions', 'media'])
            ->load([
                'quizzes' => fn ($query) => $query
                    ->select(['id', 'user_id', 'title', 'status', 'updated_at'])
                    ->latest('updated_at')
                    ->limit(5),
                'questions' => fn ($query) => $query
                    ->select(['id', 'user_id', 'type', 'status', 'search_text', 'updated_at'])
                    ->latest('updated_at')
                    ->limit(5),
            ]);
    }

    /**
     * Apply an admin edit, enforcing the safety rules that protect the last
     * administrator and prevent self-inflicted lockout.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(User $actor, User $target, array $data): User
    {
        $newRole = isset($data['role']) ? UserRole::from($data['role']) : $target->role;
        $newStatus = isset($data['status']) ? UserStatus::from($data['status']) : $target->status;

        $this->guardAgainstRemovingLastAdmin($target, $newRole, $newStatus);
        $this->guardAgainstSelfSuspension($actor, $target, $newStatus);
        $this->guardAgainstSelfDemotion($actor, $target, $newRole);

        $wasActive = $target->isActive();

        $target->fill($data)->save();

        if ($wasActive && $target->fresh()->isSuspended()) {
            // A suspended user must not keep using any token issued before the
            // suspension; `EnsureUserIsActive` backs this up for stale tokens.
            $target->tokens()->delete();
        }

        return $target->fresh()->loadCount(['quizzes', 'questions', 'media']);
    }

    /**
     * Set a new password. Other sessions are revoked so a compromised account
     * cannot be reset without also signing the attacker out.
     */
    public function resetPassword(User $actor, User $target, string $password): User
    {
        $target->update(['password' => $password]);

        $this->revokeTokens($actor, $target);

        return $target->fresh()->loadCount(['quizzes', 'questions', 'media']);
    }

    /**
     * Delete the target's Sanctum tokens. Revoking your own tokens keeps the
     * current session alive — this endpoint must never lock the acting admin
     * out of their own account.
     */
    public function revokeTokens(User $actor, User $target): int
    {
        $query = $target->tokens();

        if ($actor->is($target)) {
            $currentToken = $actor->currentAccessToken();

            if ($currentToken === null) {
                return 0;
            }

            $query->whereKeyNot($currentToken->getKey());
        }

        return (int) $query->delete();
    }

    private function guardAgainstSelfSuspension(User $actor, User $target, UserStatus $newStatus): void
    {
        if ($actor->is($target) && $newStatus === UserStatus::Suspended) {
            throw ValidationException::withMessages([
                'status' => ['You cannot suspend your own account.'],
            ]);
        }
    }

    private function guardAgainstSelfDemotion(User $actor, User $target, UserRole $newRole): void
    {
        if ($actor->is($target) && $newRole !== UserRole::Admin) {
            throw ValidationException::withMessages([
                'role' => ['You cannot remove your own administrator role.'],
            ]);
        }
    }

    private function guardAgainstRemovingLastAdmin(User $target, UserRole $newRole, UserStatus $newStatus): void
    {
        if (! $target->isAdmin()) {
            return;
        }

        $staysActiveAdmin = $newRole === UserRole::Admin && $newStatus === UserStatus::Active;
        if ($staysActiveAdmin) {
            return;
        }

        $remainingActiveAdmins = User::query()
            ->admins()
            ->active()
            ->whereKeyNot($target->getKey())
            ->count();

        if ($remainingActiveAdmins === 0) {
            throw ValidationException::withMessages([
                'role' => ['You cannot demote or suspend the last active administrator.'],
            ]);
        }
    }
}
