<?php

namespace App\Services;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Http\Requests\ImportAdminUsersRequest;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
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
     * Create an account on behalf of an administrator. When no password is
     * supplied a strong temporary one is generated and returned exactly once,
     * so it is never recoverable from the database afterwards.
     *
     * @param  array<string, mixed>  $data
     * @return array{user: User, temporary_password: ?string}
     */
    public function create(User $actor, array $data): array
    {
        $temporaryPassword = null;

        if (empty($data['password'])) {
            $temporaryPassword = Str::password(16);
            $data['password'] = $temporaryPassword;
        }

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
            'role' => $data['role'] ?? UserRole::User->value,
            'status' => $data['status'] ?? UserStatus::Active->value,
        ]);

        return [
            'user' => $user->loadCount(['quizzes', 'questions', 'media']),
            'temporary_password' => $temporaryPassword,
        ];
    }

    /**
     * Validate an uploaded CSV without writing anything. The summary tells the
     * admin exactly which rows would be skipped and why.
     *
     * @return array<string, mixed>
     */
    public function previewImport(UploadedFile $file): array
    {
        return $this->analyseImport($file, dryRun: true);
    }

    /**
     * Create every account from a valid CSV. The whole file is written inside
     * a transaction and only when every row passes validation, so a partly
     * broken file never leaves the database in a half-imported state.
     *
     * @return array<string, mixed>
     */
    public function commitImport(UploadedFile $file): array
    {
        return $this->analyseImport($file, dryRun: false);
    }

    /**
     * Shared CSV parsing/validation pipeline for dry-run and commit.
     *
     * @return array<string, mixed>
     */
    private function analyseImport(UploadedFile $file, bool $dryRun): array
    {
        $records = $this->readCsvRecords($file);
        $totalRows = count($records);

        if ($totalRows > ImportAdminUsersRequest::MAX_ROWS) {
            throw ValidationException::withMessages([
                'file' => ['The CSV file may not contain more than '.ImportAdminUsersRequest::MAX_ROWS.' rows.'],
            ]);
        }

        $existingEmails = $this->existingEmails($records);

        $rows = [];
        $payloads = [];
        $seenEmails = [];

        foreach ($records as $record) {
            $values = $record['values'];
            $errors = [];

            $name = trim((string) ($values['name'] ?? ''));
            if ($name === '') {
                $errors[] = 'Name is required.';
            } elseif (mb_strlen($name) > 255) {
                $errors[] = 'Name may not be greater than 255 characters.';
            }

            $email = trim((string) ($values['email'] ?? ''));
            if ($email === '') {
                $errors[] = 'Email is required.';
            } elseif (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $errors[] = 'Email is invalid.';
            } elseif (mb_strlen($email) > 255) {
                $errors[] = 'Email may not be greater than 255 characters.';
            } else {
                $normalised = Str::lower($email);
                if (isset($seenEmails[$normalised])) {
                    $errors[] = 'Duplicate email in file.';
                } elseif (in_array($normalised, $existingEmails, true)) {
                    $errors[] = 'Email is already registered.';
                }
                $seenEmails[$normalised] = true;
            }

            $role = UserRole::User;
            $roleValue = UserRole::User->value;
            $roleRaw = Str::lower(trim((string) ($values['role'] ?? '')));
            if ($roleRaw !== '') {
                $parsedRole = UserRole::tryFrom($roleRaw);
                if ($parsedRole === null) {
                    $errors[] = 'Role is invalid.';
                    $roleValue = null;
                } else {
                    $role = $parsedRole;
                    $roleValue = $parsedRole->value;
                }
            }

            $status = UserStatus::Active;
            $statusValue = UserStatus::Active->value;
            $statusRaw = Str::lower(trim((string) ($values['status'] ?? '')));
            if ($statusRaw !== '') {
                $parsedStatus = UserStatus::tryFrom($statusRaw);
                if ($parsedStatus === null) {
                    $errors[] = 'Status is invalid.';
                    $statusValue = null;
                } else {
                    $status = $parsedStatus;
                    $statusValue = $parsedStatus->value;
                }
            }

            $password = (string) ($values['password'] ?? '');
            if ($password !== '' && mb_strlen($password) < 8) {
                $errors[] = 'Password must be at least 8 characters.';
            }

            $valid = $errors === [];

            $rows[] = [
                'row' => $record['line'],
                'name' => $name,
                'email' => $email,
                'role' => $roleValue,
                'status' => $statusValue,
                'valid' => $valid,
                'errors' => $errors,
            ];

            if ($valid) {
                $payloads[] = [
                    'row' => $record['line'],
                    'name' => $name,
                    'email' => $email,
                    'role' => $role->value,
                    'status' => $status->value,
                    'password' => $password,
                ];
            }
        }

        $errorRows = $totalRows - count($payloads);
        $created = [];

        if (! $dryRun && $errorRows === 0) {
            $created = DB::transaction(fn (): array => array_map(
                fn (array $payload): array => $this->createImportedUser($payload),
                $payloads
            ));
        }

        return [
            'dry_run' => $dryRun,
            'total_rows' => $totalRows,
            'valid_rows' => count($payloads),
            'error_rows' => $errorRows,
            'rows' => $rows,
            'created' => $created,
        ];
    }

    /**
     * Insert one validated CSV row, generating a temporary password when the
     * row did not provide one.
     *
     * @param  array{row: int, name: string, email: string, role: string, status: string, password: string}  $payload
     * @return array<string, mixed>
     */
    private function createImportedUser(array $payload): array
    {
        $temporaryPassword = null;
        $password = $payload['password'];

        if ($password === '') {
            $temporaryPassword = Str::password(16);
            $password = $temporaryPassword;
        }

        $user = User::create([
            'name' => $payload['name'],
            'email' => $payload['email'],
            'password' => $password,
            'role' => $payload['role'],
            'status' => $payload['status'],
        ]);

        $created = [
            'row' => $payload['row'],
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role->value,
            'status' => $user->status->value,
        ];

        if ($temporaryPassword !== null) {
            $created['temporary_password'] = $temporaryPassword;
        }

        return $created;
    }

    /**
     * Read a CSV file into line-numbered, header-keyed records. Blank lines are
     * ignored but line numbers keep pointing at the original file.
     *
     * @return list<array{line: int, values: array<string, string>}>
     */
    private function readCsvRecords(UploadedFile $file): array
    {
        $path = $file->getRealPath();
        $handle = $path !== false ? fopen($path, 'r') : false;

        if ($handle === false) {
            throw ValidationException::withMessages([
                'file' => ['The CSV file could not be read.'],
            ]);
        }

        try {
            $header = fgetcsv($handle);

            if ($header === false) {
                throw ValidationException::withMessages([
                    'file' => ['The CSV file is empty.'],
                ]);
            }

            $columns = [];
            foreach ($header as $index => $column) {
                $column = (string) $column;
                if ($index === 0) {
                    $column = preg_replace('/^\xEF\xBB\xBF/', '', $column) ?? $column;
                }
                $columns[] = Str::lower(trim($column));
            }

            if (! in_array('name', $columns, true) || ! in_array('email', $columns, true)) {
                throw ValidationException::withMessages([
                    'file' => ['The CSV file must contain "name" and "email" columns.'],
                ]);
            }

            $records = [];
            $line = 1;

            while (($values = fgetcsv($handle)) !== false) {
                $line++;
                $mapped = [];
                $isEmpty = true;

                foreach ($columns as $index => $column) {
                    $value = isset($values[$index]) ? trim((string) $values[$index]) : '';
                    $mapped[$column] = $value;

                    if ($value !== '') {
                        $isEmpty = false;
                    }
                }

                if ($isEmpty) {
                    continue;
                }

                $records[] = ['line' => $line, 'values' => $mapped];
            }

            return $records;
        } finally {
            fclose($handle);
        }
    }

    /**
     * Collect the lower-cased emails already present in the database for the
     * addresses referenced by the file.
     *
     * @param  list<array{line: int, values: array<string, string>}>  $records
     * @return list<string>
     */
    private function existingEmails(array $records): array
    {
        $candidates = [];

        foreach ($records as $record) {
            $email = trim((string) ($record['values']['email'] ?? ''));

            if ($email !== '') {
                $candidates[] = $email;
            }
        }

        if ($candidates === []) {
            return [];
        }

        return User::query()
            ->whereIn('email', array_values(array_unique($candidates)))
            ->pluck('email')
            ->map(fn (string $email): string => Str::lower($email))
            ->all();
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
