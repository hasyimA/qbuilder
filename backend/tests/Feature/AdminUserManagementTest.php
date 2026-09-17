<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\Media;
use App\Models\Question;
use App\Models\Quiz;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminUserManagementTest extends TestCase
{
    use RefreshDatabase;

    private function bearer(User $user): array
    {
        return ['Authorization' => 'Bearer '.$user->createToken('test-token')->plainTextToken];
    }

    public function test_unauthenticated_request_returns_401(): void
    {
        $this->getJson('/api/admin/users')->assertUnauthorized();
    }

    public function test_regular_user_cannot_access_admin_endpoints(): void
    {
        $user = User::factory()->create();

        $this->withHeaders($this->bearer($user))
            ->getJson('/api/admin/users')
            ->assertForbidden();
    }

    public function test_admin_can_list_users_with_activity_counts(): void
    {
        $admin = User::factory()->admin()->create(['name' => 'Admin Satu']);
        $target = User::factory()->create(['name' => 'Guru Satu']);

        Quiz::factory()->count(2)->create(['user_id' => $target->id]);
        Question::factory()->create(['user_id' => $target->id]);
        Media::factory()->create(['user_id' => $target->id]);

        $response = $this->withHeaders($this->bearer($admin))
            ->getJson('/api/admin/users');

        $response->assertOk()->assertJsonStructure([
            'data',
            'meta' => ['current_page', 'last_page', 'per_page', 'total'],
        ]);

        $row = collect($response->json('data'))->firstWhere('id', $target->id);

        $this->assertSame('user', $row['role']);
        $this->assertSame('active', $row['status']);
        $this->assertSame(2, $row['quizzes_count']);
        $this->assertSame(1, $row['questions_count']);
        $this->assertSame(1, $row['media_count']);
    }

    public function test_admin_can_search_and_filter_users(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->create(['name' => 'Alice Guru', 'email' => 'alice@example.com']);
        User::factory()->suspended()->create(['name' => 'Bob Murid', 'email' => 'bob@example.com']);

        $headers = $this->bearer($admin);

        $search = $this->withHeaders($headers)->getJson('/api/admin/users?search=alice');
        $search->assertOk();
        $this->assertSame(['alice@example.com'], $search->json('data.*.email'));

        $byStatus = $this->withHeaders($headers)->getJson('/api/admin/users?status=suspended');
        $byStatus->assertOk();
        $this->assertSame(['bob@example.com'], $byStatus->json('data.*.email'));

        $byRole = $this->withHeaders($headers)->getJson('/api/admin/users?role=admin');
        $byRole->assertOk();
        $this->assertSame([$admin->email], $byRole->json('data.*.email'));
    }

    public function test_admin_can_view_user_detail(): void
    {
        $admin = User::factory()->admin()->create();
        $target = User::factory()->create();
        Quiz::factory()->create(['user_id' => $target->id]);
        Question::factory()->create(['user_id' => $target->id]);

        $response = $this->withHeaders($this->bearer($admin))
            ->getJson("/api/admin/users/{$target->id}");

        $response->assertOk()
            ->assertJsonPath('data.id', $target->id)
            ->assertJsonCount(1, 'data.recent_quizzes')
            ->assertJsonCount(1, 'data.recent_questions')
            ->assertJsonMissingPath('data.password')
            ->assertJsonMissingPath('data.tokens');
    }

    public function test_admin_can_suspend_user_and_revokes_their_tokens(): void
    {
        $admin = User::factory()->admin()->create();
        $target = User::factory()->create();
        $target->createToken('old-token');

        $response = $this->withHeaders($this->bearer($admin))
            ->patchJson("/api/admin/users/{$target->id}", ['status' => 'suspended']);

        $response->assertOk()->assertJsonPath('data.status', 'suspended');
        $this->assertDatabaseHas('users', ['id' => $target->id, 'status' => 'suspended']);
        $this->assertSame(0, $target->tokens()->count());
    }

    public function test_suspended_user_cannot_login(): void
    {
        User::factory()->suspended()->create(['email' => 'suspended@example.com']);

        $response = $this->postJson('/api/login', [
            'email' => 'suspended@example.com',
            'password' => 'password',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['email']);
    }

    public function test_suspended_user_with_existing_token_is_rejected(): void
    {
        $user = User::factory()->suspended()->create();
        $token = $user->createToken('stale-token')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/user')
            ->assertForbidden();
    }

    public function test_admin_cannot_suspend_self(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->admin()->create();

        $response = $this->withHeaders($this->bearer($admin))
            ->patchJson("/api/admin/users/{$admin->id}", ['status' => 'suspended']);

        $response->assertStatus(422)->assertJsonValidationErrors(['status']);
        $this->assertSame(UserStatus::Active, $admin->fresh()->status);
    }

    public function test_admin_cannot_demote_last_admin(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this->withHeaders($this->bearer($admin))
            ->patchJson("/api/admin/users/{$admin->id}", ['role' => 'user']);

        $response->assertStatus(422)->assertJsonValidationErrors(['role']);
        $this->assertSame(UserRole::Admin, $admin->fresh()->role);
    }

    public function test_admin_cannot_demote_self_when_another_admin_exists(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->admin()->create();

        $response = $this->withHeaders($this->bearer($admin))
            ->patchJson("/api/admin/users/{$admin->id}", ['role' => 'user']);

        $response->assertStatus(422)->assertJsonValidationErrors(['role']);
        $this->assertSame(UserRole::Admin, $admin->fresh()->role);
    }

    public function test_admin_can_reset_user_password(): void
    {
        $admin = User::factory()->admin()->create();
        $target = User::factory()->create();
        $target->createToken('device-one');
        $target->createToken('device-two');

        $response = $this->withHeaders($this->bearer($admin))
            ->postJson("/api/admin/users/{$target->id}/reset-password", [
                'password' => 'brand-new-password',
                'password_confirmation' => 'brand-new-password',
            ]);

        $response->assertOk()->assertJsonMissingPath('data.password');
        $this->assertTrue(Hash::check('brand-new-password', $target->fresh()->password));
        $this->assertSame(0, $target->tokens()->count());
    }

    public function test_admin_can_revoke_user_tokens(): void
    {
        $admin = User::factory()->admin()->create();
        $target = User::factory()->create();
        $target->createToken('device-one');
        $target->createToken('device-two');

        $response = $this->withHeaders($this->bearer($admin))
            ->postJson("/api/admin/users/{$target->id}/revoke-tokens");

        $response->assertOk()->assertJsonPath('data.revoked_count', 2);
        $this->assertSame(0, $target->tokens()->count());
    }

    public function test_admin_revoking_own_tokens_keeps_current_session(): void
    {
        $admin = User::factory()->admin()->create();
        $currentToken = $admin->createToken('current')->plainTextToken;
        $admin->createToken('other-device');

        $response = $this->withHeader('Authorization', "Bearer {$currentToken}")
            ->postJson("/api/admin/users/{$admin->id}/revoke-tokens");

        $response->assertOk()->assertJsonPath('data.revoked_count', 1);
        $this->assertSame(1, $admin->tokens()->count());

        $this->withHeader('Authorization', "Bearer {$currentToken}")
            ->getJson('/api/user')
            ->assertOk();
    }

    public function test_update_rejects_email_already_used_by_another_user(): void
    {
        $admin = User::factory()->admin()->create();
        $target = User::factory()->create();
        User::factory()->create(['email' => 'taken@example.com']);

        $response = $this->withHeaders($this->bearer($admin))
            ->patchJson("/api/admin/users/{$target->id}", ['email' => 'taken@example.com']);

        $response->assertStatus(422)->assertJsonValidationErrors(['email']);
    }
}
