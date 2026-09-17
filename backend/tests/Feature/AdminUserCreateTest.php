<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminUserCreateTest extends TestCase
{
    use RefreshDatabase;

    private function bearer(User $user): array
    {
        return ['Authorization' => 'Bearer '.$user->createToken('test-token')->plainTextToken];
    }

    public function test_unauthenticated_request_returns_401(): void
    {
        $this->postJson('/api/admin/users', [
            'name' => 'Guru Baru',
            'email' => 'guru@example.com',
        ])->assertUnauthorized();
    }

    public function test_regular_user_cannot_create_user(): void
    {
        $user = User::factory()->create();

        $this->withHeaders($this->bearer($user))
            ->postJson('/api/admin/users', [
                'name' => 'Guru Baru',
                'email' => 'guru@example.com',
            ])
            ->assertForbidden();
    }

    public function test_admin_can_create_user_with_manual_password(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this->withHeaders($this->bearer($admin))
            ->postJson('/api/admin/users', [
                'name' => 'Guru Baru',
                'email' => 'guru@example.com',
                'password' => 'password-baru',
                'password_confirmation' => 'password-baru',
                'role' => 'user',
                'status' => 'active',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.email', 'guru@example.com')
            ->assertJsonPath('data.role', 'user')
            ->assertJsonPath('data.status', 'active');

        $this->assertArrayNotHasKey('temporary_password', $response->json());

        $created = User::query()->where('email', 'guru@example.com')->firstOrFail();
        $this->assertTrue(Hash::check('password-baru', $created->password));
    }

    public function test_admin_can_create_user_with_generated_password(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this->withHeaders($this->bearer($admin))
            ->postJson('/api/admin/users', [
                'name' => 'Guru Tanpa Sandi',
                'email' => 'tanpa-sandi@example.com',
            ]);

        $response->assertCreated();

        $temporaryPassword = $response->json('temporary_password');
        $this->assertIsString($temporaryPassword);
        $this->assertGreaterThanOrEqual(8, strlen($temporaryPassword));

        $created = User::query()->where('email', 'tanpa-sandi@example.com')->firstOrFail();
        $this->assertTrue(Hash::check($temporaryPassword, $created->password));
    }

    public function test_admin_can_create_another_admin(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this->withHeaders($this->bearer($admin))
            ->postJson('/api/admin/users', [
                'name' => 'Admin Baru',
                'email' => 'admin-baru@example.com',
                'role' => 'admin',
            ]);

        $response->assertCreated()->assertJsonPath('data.role', 'admin');

        $this->assertSame(UserRole::Admin, User::query()->where('email', 'admin-baru@example.com')->firstOrFail()->role);
    }

    public function test_response_never_exposes_password_hash(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this->withHeaders($this->bearer($admin))
            ->postJson('/api/admin/users', [
                'name' => 'Guru Baru',
                'email' => 'guru@example.com',
            ]);

        $response->assertCreated()->assertJsonMissingPath('data.password');
        $this->assertStringNotContainsString('$2y$', $response->getContent());
    }

    public function test_create_rejects_duplicate_email(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->create(['email' => 'taken@example.com']);

        $response = $this->withHeaders($this->bearer($admin))
            ->postJson('/api/admin/users', [
                'name' => 'Guru Baru',
                'email' => 'taken@example.com',
            ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['email']);
    }

    public function test_create_requires_name_and_email(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this->withHeaders($this->bearer($admin))
            ->postJson('/api/admin/users', []);

        $response->assertStatus(422)->assertJsonValidationErrors(['name', 'email']);
    }

    public function test_create_rejects_mismatched_password_confirmation(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this->withHeaders($this->bearer($admin))
            ->postJson('/api/admin/users', [
                'name' => 'Guru Baru',
                'email' => 'guru@example.com',
                'password' => 'password-baru',
                'password_confirmation' => 'password-lain',
            ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['password']);
    }

    public function test_create_rejects_invalid_role(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this->withHeaders($this->bearer($admin))
            ->postJson('/api/admin/users', [
                'name' => 'Guru Baru',
                'email' => 'guru@example.com',
                'role' => 'superuser',
            ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['role']);
        $this->assertSame(0, User::query()->where('email', 'guru@example.com')->count());
    }

    public function test_create_rejects_invalid_status(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this->withHeaders($this->bearer($admin))
            ->postJson('/api/admin/users', [
                'name' => 'Guru Baru',
                'email' => 'guru@example.com',
                'status' => 'inactive',
            ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['status']);
    }

    public function test_created_user_defaults_to_active_regular_user(): void
    {
        $admin = User::factory()->admin()->create();

        $this->withHeaders($this->bearer($admin))
            ->postJson('/api/admin/users', [
                'name' => 'Guru Baru',
                'email' => 'guru@example.com',
            ])
            ->assertCreated()
            ->assertJsonPath('data.role', UserRole::User->value)
            ->assertJsonPath('data.status', UserStatus::Active->value);
    }
}
