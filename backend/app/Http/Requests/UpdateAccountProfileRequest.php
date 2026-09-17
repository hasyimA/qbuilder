<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class UpdateAccountProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Only the display name is self-service. Email, role, and status stay under
     * administrator control and are explicitly rejected if sent.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['prohibited'],
            'role' => ['prohibited'],
            'status' => ['prohibited'],
            'password' => ['prohibited'],
        ];
    }

    public function messages(): array
    {
        return [
            'email.prohibited' => 'Email can only be changed by an administrator.',
            'role.prohibited' => 'Role can only be changed by an administrator.',
            'status.prohibited' => 'Status can only be changed by an administrator.',
            'password.prohibited' => 'Use the password endpoint to change your password.',
        ];
    }
}
