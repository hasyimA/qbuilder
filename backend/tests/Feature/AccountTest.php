<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AccountTest extends TestCase
{
    use RefreshDatabase;

    private function bearer(User $user): array
    {
        return ['Authorization' => 'Bearer '.$user->createToken('test-token')->plainTextToken];
    }

    public function test_unauthenticated_request_returns_401(): void
    {
        $this->getJson('/api/account')->assertUnauthorized();
        $this->patchJson('/api/account/profile', ['name' => 'Nama Baru'])->assertUnauthorized();
        $this->patchJson('/api/account/password', [])->assertUnauthorized();
    }

    public function test_suspended_user_cannot_access_account_endpoints(): void
    {
        $user = User::factory()->suspended()->create();
        $headers = ['Authorization' => 'Bearer '.$user->createToken('stale-token')->plainTextToken];

        $this->withHeaders($headers)->getJson('/api/account')->assertForbidden();
        $this->withHeaders($headers)
            ->patchJson('/api/account/profile', ['name' => 'Nama Baru'])
            ->assertForbidden();
        $this->withHeaders($headers)
            ->patchJson('/api/account/password', [
                'current_password' => 'password',
                'password' => 'password-baru',
                'password_confirmation' => 'password-baru',
            ])
            ->assertForbidden();
    }

    public function test_user_can_view_own_account(): void
    {
        $user = User::factory()->create(['name' => 'Budi Santoso', 'email' => 'budi@example.com']);

        $response = $this->withHeaders($this->bearer($user))->getJson('/api/account');

        $response->assertOk()
            ->assertJsonPath('data.id', $user->id)
            ->assertJsonPath('data.name', 'Budi Santoso')
            ->assertJsonPath('data.email', 'budi@example.com')
            ->assertJsonPath('data.role', 'user')
            ->assertJsonPath('data.status', 'active')
            ->assertJsonMissingPath('data.password');
    }

    public function test_user_can_update_own_name(): void
    {
        $user = User::factory()->create(['name' => 'Nama Lama']);

        $response = $this->withHeaders($this->bearer($user))
            ->patchJson('/api/account/profile', ['name' => 'Nama Baru']);

        $response->assertOk()->assertJsonPath('data.name', 'Nama Baru');
        $this->assertDatabaseHas('users', ['id' => $user->id, 'name' => 'Nama Baru']);
    }

    public function test_user_cannot_update_email_via_profile_endpoint(): void
    {
        $user = User::factory()->create(['email' => 'lama@example.com']);

        $response = $this->withHeaders($this->bearer($user))
            ->patchJson('/api/account/profile', [
                'name' => 'Nama Baru',
                'email' => 'baru@example.com',
            ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['email']);
        $this->assertSame('lama@example.com', $user->fresh()->email);
    }

    public function test_admin_can_change_user_email(): void
    {
        $user = User::factory()->create(['email' => 'awal@example.com']);
        $admin = User::factory()->admin()->create();

        $this->withHeaders($this->bearer($admin))
            ->patchJson("/api/admin/users/{$user->id}", ['email' => 'dari-admin@example.com'])
            ->assertOk()
            ->assertJsonPath('data.email', 'dari-admin@example.com');

        $this->assertSame('dari-admin@example.com', $user->fresh()->email);
    }

    public function test_user_cannot_update_role_or_status_via_profile_endpoint(): void
    {
        $user = User::factory()->create();

        $response = $this->withHeaders($this->bearer($user))
            ->patchJson('/api/account/profile', [
                'name' => 'Nama Baru',
                'role' => 'admin',
                'status' => 'suspended',
            ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['role', 'status']);

        $fresh = $user->fresh();
        $this->assertSame('user', $fresh->role->value);
        $this->assertSame('active', $fresh->status->value);
    }

    public function test_user_cannot_change_password_with_wrong_current_password(): void
    {
        $user = User::factory()->create();

        $response = $this->withHeaders($this->bearer($user))
            ->patchJson('/api/account/password', [
                'current_password' => 'salah',
                'password' => 'password-baru',
                'password_confirmation' => 'password-baru',
            ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['current_password']);
        $this->assertTrue(Hash::check('password', $user->fresh()->password));
    }

    public function test_user_can_change_password_with_correct_current_password(): void
    {
        $user = User::factory()->create();

        $response = $this->withHeaders($this->bearer($user))
            ->patchJson('/api/account/password', [
                'current_password' => 'password',
                'password' => 'password-baru',
                'password_confirmation' => 'password-baru',
            ]);

        $response->assertOk()
            ->assertJsonPath('message', 'Password updated successfully.')
            ->assertJsonMissingPath('data.password');

        $this->assertTrue(Hash::check('password-baru', $user->fresh()->password));
    }

    public function test_password_change_rejects_short_or_unconfirmed_password(): void
    {
        $user = User::factory()->create();

        $short = $this->withHeaders($this->bearer($user))
            ->patchJson('/api/account/password', [
                'current_password' => 'password',
                'password' => 'pendek',
                'password_confirmation' => 'pendek',
            ]);

        $short->assertStatus(422)->assertJsonValidationErrors(['password']);

        $mismatch = $this->withHeaders($this->bearer($user))
            ->patchJson('/api/account/password', [
                'current_password' => 'password',
                'password' => 'password-baru',
                'password_confirmation' => 'password-lain',
            ]);

        $mismatch->assertStatus(422)->assertJsonValidationErrors(['password']);
        $this->assertTrue(Hash::check('password', $user->fresh()->password));
    }

    public function test_password_change_revokes_other_tokens_but_keeps_current(): void
    {
        $user = User::factory()->create();
        $currentToken = $user->createToken('current-device')->plainTextToken;
        $user->createToken('other-device-one');
        $user->createToken('other-device-two');

        $response = $this->withHeader('Authorization', "Bearer {$currentToken}")
            ->patchJson('/api/account/password', [
                'current_password' => 'password',
                'password' => 'password-baru',
                'password_confirmation' => 'password-baru',
            ]);

        $response->assertOk();
        $this->assertSame(1, $user->tokens()->count());

        $this->withHeader('Authorization', "Bearer {$currentToken}")
            ->getJson('/api/account')
            ->assertOk();
    }
}
