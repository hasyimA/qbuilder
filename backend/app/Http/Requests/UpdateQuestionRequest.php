<?php

namespace App\Http\Requests;

use App\Services\DocumentValidator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateQuestionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'type' => ['sometimes', 'required', 'string', 'in:multiple_choice,true_false,short_answer,essay'],
            'content' => ['sometimes', 'required', 'array'],
            'content.type' => ['sometimes', 'required', 'string'],
            'default_mark' => ['nullable', 'numeric', 'min:0', 'max:9999.99'],
            'feedback_general' => ['nullable', 'array'],
            'feedback_correct' => ['nullable', 'array'],
            'feedback_incorrect' => ['nullable', 'array'],
            'category' => ['nullable', 'string', 'max:255'],
            'difficulty' => ['nullable', 'string', 'max:20'],
            'status' => ['nullable', 'string', 'in:draft,complete'],
            'tags' => ['nullable', 'array'],
            'tags.*' => ['string', 'max:255'],
            'base_updated_at' => ['nullable', 'date'],
            'options' => ['nullable', 'array'],
            'options.*.content' => ['required_with:options', 'array'],
            'options.*.is_correct' => ['nullable', 'boolean'],
            'options.*.fraction' => ['nullable', 'numeric', 'min:-100', 'max:100'],
            'options.*.feedback' => ['nullable', 'array'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator) {
                $this->validateContent($validator);

                $optionsProvided = array_key_exists('options', $this->all());
                if (! $optionsProvided) {
                    return;
                }

                $type = $this->input('type', $this->route('question')->type->value);
                $options = $this->validateOptionDocs($validator, $this->input('options') ?? []);
                $hasCorrect = false;

                if (in_array($type, ['multiple_choice', 'true_false'], true)) {
                    foreach ($options as $index => $option) {
                        $optionDoc = $option['content'] ?? null;
                        if (! $this->docHasText($optionDoc)) {
                            $validator->errors()->add("options.{$index}.content", 'Option content is required.');
                        }
                        $isCorrect = ! empty($option['is_correct'])
                            || (float) ($option['fraction'] ?? 0) > 0;
                        if ($isCorrect) {
                            $hasCorrect = true;
                        }
                    }

                    if (count($options) < 2) {
                        $validator->errors()->add('options', 'At least two options are required.');
                    }

                    if (! $hasCorrect) {
                        $validator->errors()->add('options', 'At least one option must be marked as correct.');
                    }
                }

                if ($type === 'true_false' && count($options) !== 2) {
                    $validator->errors()->add('options', 'True/False questions require exactly two options.');
                }

                if ($type === 'short_answer') {
                    $hasAnswer = false;
                    foreach ($options as $option) {
                        if ($this->docHasText($option['content'] ?? null)) {
                            $hasAnswer = true;
                            break;
                        }
                    }

                    if (! $hasAnswer) {
                        $validator->errors()->add('options', 'At least one accepted answer is required.');
                    }
                }
            },
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function normalizeDocuments(array $validated): array
    {
        $validator = app(DocumentValidator::class);

        if (array_key_exists('content', $this->all())) {
            $canonical = $validator->canonicalize($this->input('content'));
            if ($canonical !== null) {
                $validated['content'] = $canonical;
            }
        }

        if (array_key_exists('options', $this->all())) {
            $options = [];
            foreach ($this->input('options') ?? [] as $key => $option) {
                $canonical = $validator->canonicalize($option['content'] ?? null);
                if ($canonical !== null) {
                    $option['content'] = $canonical;
                }
                $options[$key] = $option;
            }
            $validated['options'] = $options;
        }

        return $validated;
    }

    private function validateContent(Validator $validator): void
    {
        if (! array_key_exists('content', $this->all()) || ! is_array($this->input('content'))) {
            return;
        }

        $canonical = app(DocumentValidator::class)->canonicalize($this->input('content'));
        if ($canonical === null) {
            $validator->errors()->add('content', 'Question content must be a valid rich-text document.');

            return;
        }
    }

    /**
     * @param  array<int, array<string, mixed>>  $options
     * @return array<int, array<string, mixed>>
     */
    private function validateOptionDocs(Validator $validator, array $options): array
    {
        foreach ($options as $index => $option) {
            $canonical = app(DocumentValidator::class)->canonicalize($option['content'] ?? null);
            if ($canonical === null) {
                $validator->errors()->add("options.{$index}.content", 'Option content must be a valid rich-text document.');
            }
        }

        return $options;
    }

    private function docHasText(mixed $doc): bool
    {
        return app(DocumentValidator::class)->hasText($doc);
    }
}
