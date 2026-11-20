<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminSettingsController extends Controller
{
    public function school(): JsonResponse
    {
        return response()->json([
            'data' => AppSetting::getSchoolSettings(),
        ]);
    }

    public function show(): JsonResponse
    {
        return response()->json([
            'data' => AppSetting::getSchoolSettings(),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'school_name' => 'required|string|max:150',
            'school_subtitle' => 'nullable|string|max:200',
            'school_address' => 'nullable|string|max:255',
            'academic_year' => 'required|string|max:30',
            'semester' => 'required|in:Ganjil,Genap',
            'default_exam_title' => 'nullable|string|max:150',
            'principal_name' => 'nullable|string|max:150',
            'principal_nip' => 'nullable|string|max:60',
        ]);

        $updated = AppSetting::putSchoolSettings($validated);

        return response()->json([
            'data' => $updated,
            'message' => 'Pengaturan sekolah & naskah ujian berhasil disimpan.',
        ]);
    }
}
