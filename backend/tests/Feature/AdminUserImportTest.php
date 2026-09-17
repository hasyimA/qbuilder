<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class AdminUserImportTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_request_returns_401(): void
    {
        $this->postJson('/api/admin/users/import', [])->assertUnauthorized();
    }

    public function test_regular_user_cannot_import(): void
    {
        $user = User::factory()->create();

        $this->importRequest($user, $this->csv([
            'Guru Baru,guru@example.com,,user,active',
        ]))->assertForbidden();
    }

    public function test_dry_run_validates_without_creating_accounts(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this->importRequest($admin, $this->csv([
            'Guru Satu,guru1@example.com,,user,active',
            'Guru Dua,guru2@example.com,password-dua,admin,active',
        ]));

        $response->assertOk()
            ->assertJsonPath('data.dry_run', true)
            ->assertJsonPath('data.total_rows', 2)
            ->assertJsonPath('data.valid_rows', 2)
            ->assertJsonPath('data.error_rows', 0)
            ->assertJsonPath('data.rows.0.valid', true)
            ->assertJsonPath('data.created', []);

        $this->assertSame(0, User::query()->whereIn('email', ['guru1@example.com', 'guru2@example.com'])->count());
    }

    public function test_import_defaults_to_dry_run_when_flag_is_missing(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this->withHeaders([
            'Authorization' => 'Bearer '.$admin->createToken('test-token')->plainTextToken,
            'Accept' => 'application/json',
        ])->post('/api/admin/users/import', [
            'file' => $this->csv(['Guru Satu,guru1@example.com,,user,active']),
        ]);

        $response->assertOk()->assertJsonPath('data.dry_run', true);
        $this->assertSame(0, User::query()->where('email', 'guru1@example.com')->count());
    }

    public function test_dry_run_reports_error_for_each_invalid_row(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->create(['email' => 'taken@example.com']);

        $response = $this->importRequest($admin, $this->csv([
            ',guru1@example.com,,user,active',
            'Guru Dua,bukan-email,,user,active',
            'Guru Tiga,guru3@example.com,pendek,user,active',
            'Guru Empat,guru4@example.com,,superuser,bogus',
            'Guru Lima,taken@example.com,,user,active',
        ]));

        $response->assertOk()
            ->assertJsonPath('data.total_rows', 5)
            ->assertJsonPath('data.valid_rows', 0)
            ->assertJsonPath('data.error_rows', 5);

        $this->assertContains('Name is required.', $response->json('data.rows.0.errors'));
        $this->assertContains('Email is invalid.', $response->json('data.rows.1.errors'));
        $this->assertContains('Password must be at least 8 characters.', $response->json('data.rows.2.errors'));
        $this->assertContains('Role is invalid.', $response->json('data.rows.3.errors'));
        $this->assertContains('Status is invalid.', $response->json('data.rows.3.errors'));
        $this->assertContains('Email is already registered.', $response->json('data.rows.4.errors'));
    }

    public function test_commit_creates_every_valid_row(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this->importRequest($admin, $this->csv([
            'Guru Satu,guru1@example.com,,user,active',
            'Guru Dua,guru2@example.com,password-dua,admin,active',
            'Guru Tiga,guru3@example.com,,user,suspended',
        ]), dryRun: false);

        $response->assertOk()
            ->assertJsonPath('data.dry_run', false)
            ->assertJsonPath('data.error_rows', 0)
            ->assertJsonCount(3, 'data.created');

        $this->assertDatabaseHas('users', ['email' => 'guru1@example.com', 'role' => 'user', 'status' => 'active']);
        $this->assertDatabaseHas('users', ['email' => 'guru2@example.com', 'role' => 'admin', 'status' => 'active']);
        $this->assertDatabaseHas('users', ['email' => 'guru3@example.com', 'role' => 'user', 'status' => 'suspended']);

        $manual = User::query()->where('email', 'guru2@example.com')->firstOrFail();
        $this->assertTrue(Hash::check('password-dua', $manual->password));
    }

    public function test_commit_aborts_entire_file_when_any_row_is_invalid(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this->importRequest($admin, $this->csv([
            'Guru Satu,guru1@example.com,,user,active',
            'Guru Dua,guru2@example.com,,superuser,active',
        ]), dryRun: false);

        $response->assertOk()
            ->assertJsonPath('data.valid_rows', 1)
            ->assertJsonPath('data.error_rows', 1)
            ->assertJsonCount(0, 'data.created');

        $this->assertSame(0, User::query()->whereIn('email', ['guru1@example.com', 'guru2@example.com'])->count());
    }

    public function test_import_rejects_duplicate_email_within_file(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this->importRequest($admin, $this->csv([
            'Guru Satu,guru@example.com,,user,active',
            'Guru Dua,guru@example.com,,user,active',
        ]));

        $response->assertOk()
            ->assertJsonPath('data.valid_rows', 1)
            ->assertJsonPath('data.error_rows', 1);

        $this->assertContains('Duplicate email in file.', $response->json('data.rows.1.errors'));
    }

    public function test_import_generates_temporary_password_only_for_rows_without_password(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this->importRequest($admin, $this->csv([
            'Guru Satu,guru1@example.com,password-satu,user,active',
            'Guru Dua,guru2@example.com,,user,active',
        ]), dryRun: false);

        $response->assertOk()->assertJsonCount(2, 'data.created');

        $created = collect($response->json('data.created'))->keyBy('email');

        $this->assertArrayNotHasKey('temporary_password', $created['guru1@example.com']);

        $temporaryPassword = $created['guru2@example.com']['temporary_password'] ?? null;
        $this->assertIsString($temporaryPassword);

        $generated = User::query()->where('email', 'guru2@example.com')->firstOrFail();
        $this->assertTrue(Hash::check($temporaryPassword, $generated->password));
    }

    public function test_import_rejects_more_than_max_rows(): void
    {
        $admin = User::factory()->admin()->create();

        $rows = array_map(
            fn (int $index): string => "Guru {$index},guru{$index}@example.com,,user,active",
            range(1, 501)
        );

        $response = $this->importRequest($admin, $this->csv($rows));

        $response->assertStatus(422)->assertJsonValidationErrors(['file']);
    }

    public function test_import_rejects_non_csv_file(): void
    {
        $admin = User::factory()->admin()->create();

        $file = UploadedFile::fake()->create('users.xlsx', 10, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        $response = $this->importRequest($admin, $file);

        $response->assertStatus(422)->assertJsonValidationErrors(['file']);
    }

    public function test_import_requires_name_and_email_columns(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this->importRequest($admin, $this->csv(
            ['Guru Satu,guru@example.com,,user,active'],
            'full_name,mail,password,role,status'
        ));

        $response->assertStatus(422)->assertJsonValidationErrors(['file']);
    }

    /**
     * @param  list<string>  $rows
     */
    private function csv(array $rows, string $header = 'name,email,password,role,status'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent('users.csv', $header."\n".implode("\n", $rows)."\n");
    }

    private function importRequest(User $admin, UploadedFile $file, bool $dryRun = true): TestResponse
    {
        return $this->withHeaders([
            'Authorization' => 'Bearer '.$admin->createToken('test-token')->plainTextToken,
            'Accept' => 'application/json',
        ])->post('/api/admin/users/import', [
            'file' => $file,
            'dry_run' => $dryRun,
        ]);
    }
}
