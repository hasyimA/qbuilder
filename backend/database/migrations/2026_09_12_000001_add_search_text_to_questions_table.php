<?php

use App\Models\Question;
use App\Services\DocumentValidator;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('questions', function (Blueprint $table) {
            $table->text('search_text')->nullable()->after('difficulty');
        });

        $validator = new DocumentValidator;
        foreach (Question::cursor() as $question) {
            $question->search_text = $validator->plainText($question->content);
            $question->saveQuietly();
        }
    }

    public function down(): void
    {
        Schema::table('questions', function (Blueprint $table) {
            $table->dropColumn('search_text');
        });
    }
};
