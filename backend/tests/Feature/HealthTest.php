<?php

namespace Tests\Feature;

use Tests\TestCase;

class HealthTest extends TestCase
{
    public function test_health_endpoint_reports_ok(): void
    {
        $response = $this->getJson('/api/health');

        $response->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('service', 'quiz-builder-api')
            ->assertJsonPath('database', 'ok')
            ->assertJsonStructure(['timestamp']);
    }

    public function test_health_endpoint_does_not_require_authentication(): void
    {
        $this->get('/api/health')->assertOk();
    }
}
