<?php

namespace Tests\Feature;

use App\Enums\UserStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MoodleAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_teacher_can_login_with_moodle_and_creates_account(): void
    {
        Http::fake([
            '*/login/token.php*' => Http::response([
                'token' => 'moodle_test_token_12345',
            ]),
            '*/webservice/rest/server.php*' => Http::sequence()
                ->push([
                    'sitename' => 'e-Learning SMK Bina Rahayu',
                    'username' => 'hasyim',
                    'fullname' => 'Hasyim Asyari',
                    'userid' => 2,
                ])
                ->push([
                    [
                        'id' => 2,
                        'username' => 'hasyim',
                        'email' => 'hasyim@smkbinarahayu.sch.id',
                        'fullname' => 'Hasyim Asyari',
                    ],
                ]),
        ]);

        $response = $this->postJson('/api/moodle/login', [
            'username' => 'hasyim',
            'password' => 'secret123',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.user.name', 'Hasyim Asyari')
            ->assertJsonPath('data.user.email', 'hasyim@smkbinarahayu.sch.id')
            ->assertJsonPath('data.moodle.username', 'hasyim')
            ->assertJsonPath('data.moodle.user_id', 2)
            ->assertJsonStructure([
                'data' => [
                    'user' => ['id', 'name', 'email', 'role', 'status'],
                    'token',
                    'moodle',
                ],
                'message',
            ]);

        // Token must be strictly hidden from the JSON response
        $this->assertArrayNotHasKey('moodle_token', $response->json('data.user'));

        $user = User::where('moodle_user_id', 2)->first();
        $this->assertNotNull($user);
        $this->assertSame('moodle_test_token_12345', $user->moodle_token);
    }

    public function test_existing_user_linked_when_logging_in_via_moodle(): void
    {
        $existing = User::factory()->create([
            'email' => 'hasyim@smkbinarahayu.sch.id',
            'name' => 'Existing Hasyim',
            'moodle_user_id' => null,
        ]);

        Http::fake([
            '*/login/token.php*' => Http::response([
                'token' => 'new_moodle_token_999',
            ]),
            '*/webservice/rest/server.php*' => Http::sequence()
                ->push([
                    'sitename' => 'e-Learning SMK Bina Rahayu',
                    'username' => 'hasyim',
                    'fullname' => 'Hasyim Asyari',
                    'userid' => 2,
                ])
                ->push([
                    [
                        'id' => 2,
                        'username' => 'hasyim',
                        'email' => 'hasyim@smkbinarahayu.sch.id',
                        'fullname' => 'Hasyim Asyari',
                    ],
                ]),
        ]);

        $response = $this->postJson('/api/moodle/login', [
            'username' => 'hasyim',
            'password' => 'secret123',
        ]);

        $response->assertOk();
        $existing->refresh();

        $this->assertSame(2, $existing->moodle_user_id);
        $this->assertSame('hasyim', $existing->moodle_username);
        $this->assertSame('new_moodle_token_999', $existing->moodle_token);
    }

    public function test_moodle_login_fails_with_invalid_credentials(): void
    {
        Http::fake([
            '*/login/token.php*' => Http::response([
                'error' => 'Invalid login, please try again',
                'errorcode' => 'invalidlogin',
            ]),
        ]);

        $response = $this->postJson('/api/moodle/login', [
            'username' => 'wronguser',
            'password' => 'wrongpass',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['username']);
    }

    public function test_suspended_user_cannot_login_via_moodle(): void
    {
        User::factory()->create([
            'email' => 'suspended@smkbinarahayu.sch.id',
            'status' => UserStatus::Suspended,
            'moodle_user_id' => 10,
        ]);

        Http::fake([
            '*/login/token.php*' => Http::response([
                'token' => 'any_token',
            ]),
            '*/webservice/rest/server.php*' => Http::sequence()
                ->push([
                    'sitename' => 'e-Learning',
                    'username' => 'suspended',
                    'userid' => 10,
                ])
                ->push([
                    [
                        'id' => 10,
                        'email' => 'suspended@smkbinarahayu.sch.id',
                    ],
                ]),
        ]);

        $response = $this->postJson('/api/moodle/login', [
            'username' => 'suspended',
            'password' => 'secret123',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['username']);
    }

    public function test_authenticated_teacher_can_fetch_enrolled_courses(): void
    {
        $user = User::factory()->create([
            'moodle_user_id' => 2,
            'moodle_username' => 'hasyim',
            'moodle_token' => 'sample_token',
        ]);

        Http::fake([
            '*/webservice/rest/server.php*' => Http::response([
                [
                    'id' => 2,
                    'shortname' => 'RG',
                    'fullname' => 'Ruang Guru',
                    'displayname' => 'Ruang Guru',
                    'category' => 1,
                    'visible' => 1,
                ],
                [
                    'id' => 3,
                    'shortname' => 'PABP-X-R',
                    'fullname' => 'PENDIDIKAN AGAMA DAN BUDI PEKERTI - X REGULER',
                    'displayname' => 'PENDIDIKAN AGAMA DAN BUDI PEKERTI - X REGULER',
                    'category' => 2,
                    'visible' => 1,
                ],
            ]),
        ]);

        $response = $this->actingAs($user)->getJson('/api/moodle/courses');

        $response->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', 2)
            ->assertJsonPath('data.0.shortname', 'RG')
            ->assertJsonPath('data.1.id', 3);
    }

    public function test_unlinked_user_gets_400_when_fetching_courses(): void
    {
        $user = User::factory()->create([
            'moodle_user_id' => null,
        ]);

        $response = $this->actingAs($user)->getJson('/api/moodle/courses');

        $response->assertStatus(400);
    }
}
