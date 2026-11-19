<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class MoodleService
{
    protected string $baseUrl;

    protected ?string $systemToken;

    protected string $serviceName;

    public function __construct()
    {
        $this->baseUrl = rtrim((string) config('services.moodle.url', 'https://e-learning.smkbinarahayu.sch.id'), '/');
        $this->systemToken = config('services.moodle.system_token');
        $this->serviceName = (string) config('services.moodle.service', 'moodle_mobile_app');
    }

    /**
     * Authenticate user credentials against Moodle token endpoint.
     * Returns personal web service token on success, or null on failure.
     */
    public function authenticate(string $username, string $password): ?string
    {
        try {
            $response = Http::asForm()
                ->timeout(15)
                ->post("{$this->baseUrl}/login/token.php", [
                    'username' => $username,
                    'password' => $password,
                    'service' => $this->serviceName,
                ]);

            if (! $response->successful()) {
                Log::warning('Moodle authentication request failed', [
                    'status' => $response->status(),
                    'username' => $username,
                ]);

                return null;
            }

            $data = $response->json();

            if (isset($data['token']) && is_string($data['token'])) {
                return $data['token'];
            }

            Log::info('Moodle authentication rejected credentials', [
                'error' => $data['error'] ?? 'unknown',
                'username' => $username,
            ]);

            return null;
        } catch (\Throwable $e) {
            Log::error('Moodle authentication exception: '.$e->getMessage(), [
                'username' => $username,
            ]);

            return null;
        }
    }

    /**
     * Get Moodle site and authenticated user info via core_webservice_get_site_info.
     *
     * @return array<string, mixed>|null
     */
    public function getSiteInfo(string $token): ?array
    {
        $response = $this->callFunction('core_webservice_get_site_info', [], $token);

        if (! $response || ! isset($response['userid'])) {
            return null;
        }

        return $response;
    }

    /**
     * Get detailed user profile by user ID (including real email).
     *
     * @return array<string, mixed>|null
     */
    public function getUserProfile(int $userId, ?string $token = null): ?array
    {
        $effectiveToken = $token ?: $this->systemToken;

        if (! $effectiveToken) {
            return null;
        }

        $response = $this->callFunction('core_user_get_users_by_field', [
            'field' => 'id',
            'values' => [$userId],
        ], $effectiveToken);

        if (is_array($response) && isset($response[0]) && is_array($response[0])) {
            return $response[0];
        }

        return null;
    }

    /**
     * Get list of courses where the authenticated user has teacher / question-editing rights.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getTeachingCourses(string $token): array
    {
        if (! $token) {
            return [];
        }

        $response = $this->callFunction('local_quizbuilder_get_teaching_courses', [], $token);

        if (! is_array($response) || isset($response['exception'])) {
            if (is_array($response) && isset($response['exception'])) {
                Log::warning('Moodle getTeachingCourses error', [
                    'exception' => $response['exception'],
                    'errorcode' => $response['errorcode'] ?? null,
                    'message' => $response['message'] ?? null,
                ]);
            }

            return [];
        }

        return array_values(array_map(function ($course) {
            return [
                'id' => (int) ($course['id'] ?? 0),
                'shortname' => (string) ($course['shortname'] ?? ''),
                'fullname' => (string) ($course['fullname'] ?? ''),
                'displayname' => (string) ($course['displayname'] ?? $course['fullname'] ?? ''),
                'category' => (int) ($course['category'] ?? 0),
                'visible' => (bool) ($course['visible'] ?? true),
            ];
        }, $response));
    }

    /**
     * Verify whether the authenticated Moodle user is a teacher (teaches >= 1 course or is site admin).
     *
     * @param  array<string, mixed>|null  $siteInfo
     */
    public function isTeacher(string $token, ?array $siteInfo = null): bool
    {
        if (! empty($siteInfo['userissiteadmin'])) {
            return true;
        }

        return count($this->getTeachingCourses($token)) > 0;
    }

    /**
     * Import Moodle XML questions into a course question bank and create a quiz activity.
     *
     * @return array<string, mixed>
     */
    public function importQuizXml(
        int $courseId,
        string $quizName,
        string $quizIntro,
        string $xml,
        string $token
    ): array {
        $response = $this->callFunction(
            'local_quizbuilder_import_quiz_xml',
            [
                'courseid' => $courseId,
                'quizname' => $quizName,
                'quizintro' => $quizIntro,
                'xml' => $xml,
                'section' => 0,
            ],
            $token,
            60
        );

        if (! is_array($response)) {
            throw new \RuntimeException('Tidak dapat terhubung ke server e-Learning Moodle.');
        }

        if (isset($response['exception'])) {
            throw new \RuntimeException((string) ($response['message'] ?? 'Gagal mengimpor soal ke e-Learning Moodle.'));
        }

        return [
            'status' => (bool) ($response['status'] ?? true),
            'imported_count' => (int) ($response['imported_count'] ?? 0),
            'category_id' => (int) ($response['category_id'] ?? 0),
            'category_name' => (string) ($response['category_name'] ?? ''),
            'quiz_id' => (int) ($response['quiz_id'] ?? 0),
            'quiz_cmid' => (int) ($response['quiz_cmid'] ?? 0),
            'quiz_url' => (string) ($response['quiz_url'] ?? ''),
        ];
    }

    /**
     * Get list of courses enrolled by a user (courses taught / enrolled).
     *
     * @return array<int, array<string, mixed>>
     */
    public function getUserCourses(int $userId, ?string $token = null): array
    {
        $effectiveToken = $token ?: $this->systemToken;

        if (! $effectiveToken) {
            return [];
        }

        $response = $this->callFunction('core_enrol_get_users_courses', [
            'userid' => $userId,
        ], $effectiveToken);

        if (! is_array($response) || isset($response['exception'])) {
            return [];
        }

        return array_map(function ($course) {
            return [
                'id' => (int) ($course['id'] ?? 0),
                'shortname' => (string) ($course['shortname'] ?? ''),
                'fullname' => (string) ($course['fullname'] ?? ''),
                'displayname' => (string) ($course['displayname'] ?? $course['fullname'] ?? ''),
                'idnumber' => (string) ($course['idnumber'] ?? ''),
                'category' => (int) ($course['category'] ?? 0),
                'visible' => (bool) ($course['visible'] ?? true),
                'enrolledusercount' => (int) ($course['enrolledusercount'] ?? 0),
                'courseimage' => (string) ($course['courseimage'] ?? ''),
            ];
        }, $response);
    }

    /**
     * Generic wrapper to execute Moodle Web Service REST functions.
     *
     * @param  array<string, mixed>  $params
     */
    protected function callFunction(string $functionName, array $params = [], ?string $token = null, int $timeout = 15): mixed
    {
        $effectiveToken = $token ?: $this->systemToken;

        if (! $effectiveToken) {
            return null;
        }

        try {
            $payload = array_merge($params, [
                'wstoken' => $effectiveToken,
                'wsfunction' => $functionName,
                'moodlewsrestformat' => 'json',
            ]);

            $response = Http::asForm()
                ->timeout($timeout)
                ->post("{$this->baseUrl}/webservice/rest/server.php", $payload);

            if (! $response->successful()) {
                Log::error("Moodle function {$functionName} returned HTTP status {$response->status()}", [
                    'body' => mb_substr($response->body(), 0, 500),
                ]);

                return null;
            }

            $decoded = $response->json();
            if ($decoded === null) {
                Log::error("Moodle function {$functionName} returned non-JSON response", [
                    'body' => mb_substr($response->body(), 0, 500),
                ]);
            }

            return $decoded;
        } catch (\Throwable $e) {
            Log::error("Moodle function {$functionName} exception: ".$e->getMessage());

            return null;
        }
    }
}
