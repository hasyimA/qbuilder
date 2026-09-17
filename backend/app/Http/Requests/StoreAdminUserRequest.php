<?php

namespace App\Http\Requests;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class StoreAdminUserRequest extends FormRequest
{
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
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')],
            'role' => ['sometimes', 'required', Rule::enum(UserRole::class)],
            'status' => ['sometimes', 'required', Rule::enum(UserStatus::class)],
            'password' => ['nullable', 'string', Password::min(8), 'confirmed'],
        ];
    }

    /**
     * Keep the enum failure messages consistent with the rest of the API.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'role.enum' => 'The selected role is invalid.',
            'status.enum' => 'The selected status is invalid.',
        ];
    }
}
