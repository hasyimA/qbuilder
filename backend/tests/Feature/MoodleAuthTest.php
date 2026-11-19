<?php

namespace Tests\Feature;

use App\Enums\UserStatus;
use App\Models\Quiz;
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
                    'userissiteadmin' => false,
                ])
                ->push([
                    [
                        'id' => 3,
                        'shortname' => 'PABP-X-R',
                        'fullname' => 'PENDIDIKAN AGAMA - X REGULER',
                        'displayname' => 'PENDIDIKAN AGAMA - X REGULER',
                        'category' => 2,
                        'visible' => true,
                    ],
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

    public function test_student_or_non_teacher_cannot_login_via_moodle(): void
    {
        Http::fake([
            '*/login/token.php*' => Http::response([
                'token' => 'student_token_123',
            ]),
            '*/webservice/rest/server.php*' => Http::sequence()
                ->push([
                    'sitename' => 'e-Learning SMK Bina Rahayu',
                    'username' => 'siswa01',
                    'fullname' => 'Siswa Satu',
                    'userid' => 55,
                    'userissiteadmin' => false,
                ])
                ->push([]), // 0 teaching courses
        ]);

        $response = $this->postJson('/api/moodle/login', [
            'username' => 'siswa01',
            'password' => 'secret123',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['username']);

        $this->assertDatabaseMissing('users', ['moodle_user_id' => 55]);
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
                    'userissiteadmin' => false,
                ])
                ->push([
                    [
                        'id' => 3,
                        'shortname' => 'PABP-X-R',
                        'fullname' => 'PENDIDIKAN AGAMA',
                        'displayname' => 'PENDIDIKAN AGAMA',
                        'category' => 2,
                        'visible' => true,
                    ],
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
                    'userissiteadmin' => false,
                ])
                ->push([
                    [
                        'id' => 3,
                        'shortname' => 'PABP-X-R',
                        'fullname' => 'PENDIDIKAN AGAMA',
                        'displayname' => 'PENDIDIKAN AGAMA',
                        'category' => 2,
                        'visible' => true,
                    ],
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

    public function test_authenticated_teacher_can_fetch_teaching_courses(): void
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
                    'visible' => true,
                ],
                [
                    'id' => 3,
                    'shortname' => 'PABP-X-R',
                    'fullname' => 'PENDIDIKAN AGAMA DAN BUDI PEKERTI - X REGULER',
                    'displayname' => 'PENDIDIKAN AGAMA DAN BUDI PEKERTI - X REGULER',
                    'category' => 2,
                    'visible' => true,
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

    public function test_authenticated_teacher_can_import_quiz_to_moodle(): void
    {
        $user = User::factory()->create([
            'moodle_user_id' => 2,
            'moodle_username' => 'hasyim',
            'moodle_token' => 'teacher_token',
        ]);
        $quiz = Quiz::factory()->for($user)->create([
            'title' => 'UTS Jaringan Dasar',
        ]);

        Http::fake([
            '*/webservice/rest/server.php*' => Http::response([
                'status' => true,
                'imported_count' => 5,
                'category_id' => 14,
                'category_name' => 'UTS Jaringan Dasar [2026-11-19]',
                'quiz_id' => 42,
                'quiz_cmid' => 108,
                'quiz_url' => 'https://e-learning.smkbinarahayu.sch.id/mod/quiz/view.php?id=108',
            ]),
        ]);

        $response = $this->actingAs($user)->postJson("/api/moodle/quizzes/{$quiz->id}/import", [
            'course_id' => 3,
            'xml' => '<quiz><question type="multichoice"></question></quiz>',
            'quiz_name' => 'UTS Jaringan Dasar',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.imported_count', 5)
            ->assertJsonPath('data.quiz_cmid', 108)
            ->assertJsonPath('data.quiz_url', 'https://e-learning.smkbinarahayu.sch.id/mod/quiz/view.php?id=108');
    }

    public function test_import_quiz_returns_422_on_moodle_exception(): void
    {
        $user = User::factory()->create([
            'moodle_user_id' => 2,
            'moodle_username' => 'hasyim',
            'moodle_token' => 'teacher_token',
        ]);
        $quiz = Quiz::factory()->for($user)->create();

        Http::fake([
            '*/webservice/rest/server.php*' => Http::response([
                'exception' => 'required_capability_exception',
                'errorcode' => 'nopermissions',
                'message' => 'Sorry, but you do not currently have permissions to do that (Add questions).',
            ]),
        ]);

        $response = $this->actingAs($user)->postJson("/api/moodle/quizzes/{$quiz->id}/import", [
            'course_id' => 3,
            'xml' => '<quiz></quiz>',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('message', 'Sorry, but you do not currently have permissions to do that (Add questions).');
    }
}
