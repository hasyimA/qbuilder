<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class ImportAdminUsersRequest extends FormRequest
{
    /**
     * Hard cap on the number of data rows accepted per import.
     */
    public const MAX_ROWS = 500;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'file' => ['required', 'file', 'mimes:csv,txt', 'max:2048'],
            'dry_run' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'file.mimes' => 'The file must be a CSV file.',
            'file.max' => 'The CSV file must not be larger than 2MB.',
        ];
    }
}
