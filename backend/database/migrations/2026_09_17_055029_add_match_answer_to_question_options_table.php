<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('question_options', function (Blueprint $table) {
            $table->string('match_answer', 2000)->nullable()->after('content');
        });
    }

    public function down(): void
    {
        Schema::table('question_options', function (Blueprint $table) {
            $table->dropColumn('match_answer');
        });
    }
};
