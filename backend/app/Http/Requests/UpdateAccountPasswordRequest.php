<?php

namespace App\Http\Requests;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Hash;

class UpdateAccountPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string|Closure>
     */
    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string', $this->currentPasswordMatches()],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ];
    }

    public function messages(): array
    {
        return [
            'current_password.required' => 'Your current password is required.',
        ];
    }

    /**
     * Verified against the authenticated user rather than the `current_password`
     * rule, which resolves the default (session) guard and would not see a
     * Sanctum token user.
     */
    private function currentPasswordMatches(): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail): void {
            $user = $this->user();

            if ($user === null || ! Hash::check((string) $value, $user->password)) {
                $fail('The provided password does not match your current password.');
            }
        };
    }
}
