<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AppSetting extends Model
{
    protected $fillable = ['key', 'value'];

    /**
     * @return array<string, string>
     */
    public static function schoolDefaults(): array
    {
        return [
            'school_name' => 'SMK Bina Rahayu',
            'school_subtitle' => 'Program Keahlian Teknologi Informasi & Bisnis',
            'school_address' => 'Jl. Raya Pendidikan, Indonesia',
            'academic_year' => '2026/2027',
            'semester' => 'Ganjil',
            'default_exam_title' => 'Penilaian Sumatif Akhir Semester',
            'principal_name' => '',
            'principal_nip' => '',
        ];
    }

    /**
     * @return array<string, string>
     */
    public static function getSchoolSettings(): array
    {
        $defaults = self::schoolDefaults();
        $stored = self::query()
            ->whereIn('key', array_keys($defaults))
            ->pluck('value', 'key')
            ->all();

        $merged = [];
        foreach ($defaults as $key => $defaultValue) {
            $val = $stored[$key] ?? null;
            $merged[$key] = is_string($val) ? $val : $defaultValue;
        }

        return $merged;
    }

    /**
     * @param  array<string, string|null>  $values
     * @return array<string, string>
     */
    public static function putSchoolSettings(array $values): array
    {
        $allowedKeys = array_keys(self::schoolDefaults());

        foreach ($values as $key => $value) {
            if (! in_array($key, $allowedKeys, true)) {
                continue;
            }

            self::query()->updateOrCreate(
                ['key' => $key],
                ['value' => $value ?? '']
            );
        }

        return self::getSchoolSettings();
    }
}
