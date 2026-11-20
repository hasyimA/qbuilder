<?php

namespace Tests\Feature;

use App\Models\Quiz;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminSettingsAndDashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_teacher_can_fetch_default_school_settings(): void
    {
        $teacher = User::factory()->create();

        $response = $this->actingAs($teacher)->getJson('/api/settings/school');

        $response->assertOk()
            ->assertJsonPath('data.school_name', 'SMK Bina Rahayu')
            ->assertJsonPath('data.academic_year', '2026/2027')
            ->assertJsonPath('data.semester', 'Ganjil');
    }

    public function test_non_admin_cannot_access_admin_dashboard_or_update_settings(): void
    {
        $teacher = User::factory()->create();

        $this->actingAs($teacher)->getJson('/api/admin/dashboard')->assertForbidden();
        $this->actingAs($teacher)->getJson('/api/admin/settings')->assertForbidden();
        $this->actingAs($teacher)->putJson('/api/admin/settings', [
            'school_name' => 'Test',
            'academic_year' => '2026/2027',
            'semester' => 'Genap',
        ])->assertForbidden();
    }

    public function test_admin_can_view_dashboard_and_update_school_settings(): void
    {
        $admin = User::factory()->admin()->create();
        $teacher = User::factory()->create(['moodle_user_id' => 10]);
        Quiz::factory()->for($teacher)->create(['status' => 'published']);

        $dashboard = $this->actingAs($admin)->getJson('/api/admin/dashboard');
        $dashboard->assertOk()
            ->assertJsonPath('data.users.total', 2)
            ->assertJsonPath('data.users.moodle_linked', 1)
            ->assertJsonPath('data.quizzes.total', 1)
            ->assertJsonPath('data.quizzes.published', 1);

        $update = $this->actingAs($admin)->putJson('/api/admin/settings', [
            'school_name' => 'SMK Bina Rahayu Depok',
            'school_subtitle' => 'Yayasan Pendidikan Bina Rahayu',
            'school_address' => 'Jl. Raya Pengasinan No. 10',
            'academic_year' => '2026/2027',
            'semester' => 'Genap',
            'default_exam_title' => 'Asesmen Sumatif Akhir Tahun',
            'principal_name' => 'Drs. Ahmad Fauzi, M.Pd',
            'principal_nip' => '197001012000011001',
        ]);

        $update->assertOk()
            ->assertJsonPath('data.school_name', 'SMK Bina Rahayu Depok')
            ->assertJsonPath('data.semester', 'Genap')
            ->assertJsonPath('data.principal_name', 'Drs. Ahmad Fauzi, M.Pd');

        // Teachers immediately see updated settings
        $this->actingAs($teacher)->getJson('/api/settings/school')
            ->assertOk()
            ->assertJsonPath('data.school_name', 'SMK Bina Rahayu Depok')
            ->assertJsonPath('data.semester', 'Genap');
    }
}
