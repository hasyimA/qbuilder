<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Creates the initial administrator account.
 *
 * Credentials come from the environment so a real deployment never has to rely
 * on the local fallback. In production the fallback is skipped entirely — set
 * `ADMIN_EMAIL` and `ADMIN_PASSWORD` (and optionally `ADMIN_NAME`) instead.
 */
class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $envEmail = env('ADMIN_EMAIL');
        $envPassword = env('ADMIN_PASSWORD');

        if (app()->environment('production') && (! $envEmail || ! $envPassword)) {
            $this->command?->warn(
                'AdminUserSeeder skipped: set ADMIN_EMAIL and ADMIN_PASSWORD in production.'
            );

            return;
        }

        $name = (string) (env('ADMIN_NAME') ?: 'Administrator');
        $email = (string) ($envEmail ?: 'admin@example.com');
        $password = (string) ($envPassword ?: 'password');

        $admin = User::firstOrNew(['email' => $email]);
        $admin->name = $name;
        $admin->role = UserRole::Admin;
        $admin->status = UserStatus::Active;
        $admin->email_verified_at ??= now();

        if (! $admin->exists) {
            // The `hashed` cast hashes this on save.
            $admin->password = $password;
        }

        $admin->save();
    }
}
